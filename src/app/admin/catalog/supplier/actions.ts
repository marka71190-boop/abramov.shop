"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { applyCards, matchBatch, matchByRef } from "@/lib/fortu";
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

/** Заполнить отмеченные карточки: пустые характеристики и описание */
export async function applyAction(raw: unknown): Promise<Res> {
  const me = await requireAdmin();
  const p = ApplyIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Отметьте товары" };
  try {
    // Только то, что нашли: чужой id сюда не подсунуть
    const found = await db
      .select({ id: s.supplierCard.productId })
      .from(s.supplierCard)
      .where(and(inArray(s.supplierCard.productId, p.data.ids), inArray(s.supplierCard.status, ["FOUND", "APPLIED"])));
    const r = await applyCards(found.map((x) => x.id), p.data.overwrite);
    await audit(me.id, "catalog.supplier_fill", "product", null, r);
    revalidatePath("/", "layout");
    return { ok: `Заполнено товаров: ${r.products} · характеристик: ${r.attrs} · описаний: ${r.texts}` };
  } catch (e) {
    return fail(e, "Не получилось заполнить");
  }
}
