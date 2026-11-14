"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { applyCards, cardByRef, createProductFromFortu, grabPhotos, matchBatch, matchByRef, searchFortu, type GrabbedItem } from "@/lib/fortu";
import { requireAdmin } from "@/lib/viewer";

type Res = { ok?: string; error?: string };
const Id = z.string().min(1).max(64);
const fail = (e: unknown, text: string): Res => ({ error: e instanceof Error ? e.message : text });

/** Очередная порция поиска у поставщика. Страница зовёт, пока left не станет 0 */
export async function matchBatchAction(): Promise<{ found: number; none: number; left: number; error?: string }> {
  await requireAdmin();
  try {
    return await matchBatch();
  } catch (e) {
    return { found: 0, none: 0, left: -1, error: e instanceof Error ? e.message : "Поставщик не отвечает" };
  }
}

/** «Не тот товар»: человек вставил ссылку или код товара у поставщика */
export async function rematchAction(productId: string, ref: string): Promise<Res> {
  await requireAdmin();
  const id = Id.safeParse(productId);
  if (!id.success) return { error: "Товар не найден" };
  try {
    await matchByRef(id.data, String(ref).slice(0, 300));
    revalidatePath("/admin/catalog/supplier");
    return { ok: "Нашли — проверьте, что заполнится" };
  } catch (e) {
    return fail(e, "Не получилось");
  }
}

/** Убрать товар из списка: «не трогать» (SKIP) или «искать заново» (карточка удаляется) */
export async function setCardAction(productId: string, what: "skip" | "retry"): Promise<Res> {
  await requireAdmin();
  const id = Id.safeParse(productId);
  if (!id.success) return { error: "Товар не найден" };
  if (what === "retry") await db.delete(s.supplierCard).where(eq(s.supplierCard.productId, id.data));
  else
    await db
      .insert(s.supplierCard)
      .values({ productId: id.data, status: "SKIP" })
      .onConflictDoUpdate({ target: s.supplierCard.productId, set: { status: "SKIP", updatedAt: new Date() } });
  revalidatePath("/admin/catalog/supplier");
  return { ok: what === "retry" ? "Поищем заново" : "Пропускаем" };
}

/** Все «не нашли» — в очередь на повторный поиск (например, после правки названий) */
export async function retryNoneAction(): Promise<Res> {
  await requireAdmin();
  const r = await db.delete(s.supplierCard).where(eq(s.supplierCard.status, "NONE")).returning({ id: s.supplierCard.productId });
  revalidatePath("/admin/catalog/supplier");
  return { ok: `В очередь на поиск: ${r.length}` };
}

const ApplyIn = z.object({ ids: z.array(Id).min(1, "Отметьте товары").max(500), overwrite: z.boolean() });

/** Заполнить отмеченные карточки: пустые характеристики, описание и фото. Страница зовёт порциями по несколько товаров */
export async function applyAction(raw: unknown): Promise<Res & { n?: { products: number; attrs: number; texts: number; photos: number } }> {
  const me = await requireAdmin();
  const p = ApplyIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Отметьте товары" };
  try {
    // Только то, что нашли: чужой id сюда не подсунуть
    const found = await db
      .select({ id: s.supplierCard.productId })
      .from(s.supplierCard)
      .where(and(inArray(s.supplierCard.productId, p.data.ids), inArray(s.supplierCard.status, ["FOUND", "APPLIED"])));
    const r = await applyCards(found.map((x) => x.id), p.data.overwrite, me.id);
    await audit(me.id, "catalog.supplier_fill", "product", null, r);
    revalidatePath("/", "layout");
    return { ok: "ok", n: r };
  } catch (e) {
    return fail(e, "Не получилось заполнить");
  }
}

// ---------- Новый товар с сайта поставщика ----------

/** Поиск у поставщика по словам — список для выбора */
export async function supplierSearchAction(q: string): Promise<{ list?: { path: string; title: string }[]; error?: string }> {
  await requireAdmin();
  try {
    const list = await searchFortu(String(q));
    // Что уже заведено у нас по этой карточке — помечаем, чтобы не создать дубль
    return { list: list.slice(0, 60) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Поставщик не отвечает" };
  }
}

/** Карточка поставщика по ссылке или коду: характеристики и фото (фото сразу скачиваются к нам) */
export async function supplierGrabAction(ref: string, maxPhotos: number): Promise<{ item?: GrabbedItem; error?: string }> {
  const me = await requireAdmin();
  try {
    const card = await cardByRef(String(ref).slice(0, 300));
    if (!card) return { error: "У поставщика такой товар не нашёлся — проверьте ссылку или код" };
    const photos = await grabPhotos(card.images, me.id, Math.max(0, Math.min(6, Math.trunc(maxPhotos) || 0)));
    return { item: { path: card.path, title: card.title, code: card.code, rrp: card.rrp, specs: card.specs, images: card.images, photos } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Поставщик не отвечает" };
  }
}

const Item = z.object({
  path: z.string().regex(/^\/product\/[^?#\s]+$/).max(300),
  title: z.string().min(1).max(300),
  code: z.string().max(32).nullable(),
  rrp: z.number().int().min(0).max(1_000_000_000).nullable(),
  specs: z.array(z.object({ name: z.string().max(80), value: z.string().max(200) })).max(80),
  images: z.array(z.string().max(300)).max(12),
  photos: z.array(z.string().regex(/^\/media\/[\w-]+$/)).max(6),
  variant: z.string().max(120).optional(),
});
const CreateIn = z.object({
  name: z.string().trim().min(2, "Впишите название товара").max(200),
  categoryId: z.string().max(64).nullable(),
  items: z.array(Item).min(1, "Выберите товар у поставщика").max(20),
});

/** Создать черновик товара из одной или нескольких (варианты) карточек поставщика */
export async function supplierCreateAction(raw: unknown): Promise<{ id?: string; price?: number; error?: string }> {
  const me = await requireAdmin();
  const p = CreateIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте данные" };
  const names = p.data.items.map((i) => (i.variant ?? "").trim().toLowerCase());
  if (p.data.items.length > 1 && (names.some((n) => !n) || new Set(names).size !== names.length)) return { error: "У каждого варианта должно быть своё название" };
  try {
    const r = await createProductFromFortu(p.data.items, p.data.name, p.data.categoryId || null);
    await audit(me.id, "product.create_from_supplier", "product", r.id, { items: p.data.items.length });
    revalidatePath("/admin/catalog");
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не получилось создать товар" };
  }
}
