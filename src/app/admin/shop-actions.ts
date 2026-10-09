"use server";
/** Действия админки: заказы, промокоды, товары, категории, настройки доставки. */
import { and, eq, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { cancelOrder, markDelivered, markPaid, OrderError, refundOrder, setStatus, shipWithCdek, syncCdek } from "@/lib/orders";
import { getSettings, saveSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import { yookassaEnabled } from "@/lib/yookassa";
import type { ActionState } from "./actions";

const rubToKop = (v: string | number | undefined | null) => Math.round(Number(String(v ?? "").replace(",", ".").replace(/\s/g, "")) * 100);
const mskDate = (v?: string | null) => {
  if (!v) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00+03:00` : `${v}:00+03:00`);
  return Number.isNaN(+d) ? null : d;
};
const msg = (e: unknown) => (e instanceof OrderError ? e.message : e instanceof Error ? e.message : "Ошибка");

// ============================================================
// Заказы
// ============================================================

export async function orderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const op = String(form.get("op") ?? "");
  try {
    switch (op) {
      case "assembling":
        await setStatus(id, "ASSEMBLING", me.id);
        break;
      case "shipped":
        await setStatus(id, "SHIPPED", me.id, String(form.get("track") ?? "").trim() || null);
        break;
      case "track":
        await setStatus(id, (String(form.get("status")) as "PAID" | "ASSEMBLING" | "SHIPPED") || "SHIPPED", me.id, String(form.get("track") ?? "").trim() || null);
        break;
      case "delivered":
        await markDelivered(id, me.id);
        break;
      case "cancel":
        await cancelOrder(id, String(form.get("reason") || "Отменён магазином"), me.id);
        break;
      case "testpay":
        if (yookassaEnabled()) return { error: "ЮKassa подключена — тестовая оплата выключена" };
        await markPaid(id, `admin:${me.id}`);
        break;
      case "refund":
        await refundOrder(id, me.id, { restock: form.get("restock") === "on", reason: String(form.get("reason") || "Возврат денег") });
        break;
      case "cdek":
        await shipWithCdek(id, me.id);
        try {
          await new Promise((r) => setTimeout(r, 2500));
          await syncCdek(id);
        } catch {}
        break;
      case "cdek-sync":
        await syncCdek(id);
        break;
      default:
        return { error: "Неизвестное действие" };
    }
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/orders");
  return { ok: "Готово" };
}

// ============================================================
// Промокоды
// ============================================================

const PromoIn = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-ZА-ЯЁ0-9_-]{3,30}$/, "Код — 3–30 символов: буквы, цифры, дефис"),
  type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
  value: z.string().optional(),
  minOrder: z.string().optional(),
  maxUses: z.string().optional(),
  maxUsesPerUser: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  categoryId: z.string().optional(),
  note: z.string().max(300).optional(),
});

export async function savePromo(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = PromoIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const num = (v?: string) => (v?.trim() ? Math.trunc(Number(v)) : null);
  let value = 0;
  if (d.type === "PERCENT") {
    value = Number(d.value);
    if (!Number.isInteger(value) || value < 1 || value > 90) return { error: "Скидка — от 1 до 90 %" };
  } else if (d.type === "FIXED") {
    value = rubToKop(d.value);
    if (!(value >= 100)) return { error: "Укажите скидку в рублях" };
  }
  const values = {
    code: d.code,
    type: d.type,
    value,
    minOrder: d.minOrder?.trim() ? rubToKop(d.minOrder) : null,
    maxUses: num(d.maxUses),
    maxUsesPerUser: num(d.maxUsesPerUser),
    startsAt: mskDate(d.startsAt),
    endsAt: d.endsAt ? mskDate(`${d.endsAt}`.length === 10 ? `${d.endsAt}T23:59` : d.endsAt) : null,
    categoryId: d.categoryId || null,
    isActive: form.get("isActive") === "on",
    firstOrderOnly: form.get("firstOrderOnly") === "on",
    combinableWithBonus: form.get("combinableWithBonus") === "on",
    note: d.note?.trim() || null,
  };
  try {
    if (d.id) {
      await db.update(s.promoCode).set(values).where(eq(s.promoCode.id, d.id));
      await audit(me.id, "promo.update", "promo", d.id, { code: d.code });
    } else {
      const [row] = await db.insert(s.promoCode).values(values).returning({ id: s.promoCode.id });
      await audit(me.id, "promo.create", "promo", row.id, { code: d.code });
    }
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message + String((e as { cause?: unknown }).cause))) return { error: "Такой промокод уже есть" };
    throw e;
  }
  revalidatePath("/admin/promo");
  if (!d.id) redirect("/admin/promo?saved=1");
  return { ok: "Сохранено" };
}

export async function togglePromo(id: string, isActive: boolean) {
  const me = await requireAdmin();
  await db.update(s.promoCode).set({ isActive }).where(eq(s.promoCode.id, id));
  await audit(me.id, "promo.toggle", "promo", id, { isActive });
  revalidatePath("/admin/promo");
}

// ============================================================
// Товары
// ============================================================

const slugRe = /^[a-z0-9-]{2,80}$/;

const VariantIn = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Название варианта не может быть пустым").max(120),
  sku: z.string().trim().max(60).optional().default(""),
  price: z.string().optional().default(""),
  stock: z.coerce.number().int().min(0, "Остаток не может быть отрицательным"),
  isActive: z.boolean(),
});
const ImageIn = z.object({ url: z.string().min(1).max(500), alt: z.string().max(200).default("") });

const ProductIn = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Введите название").max(200),
  slug: z.string().trim().toLowerCase().regex(slugRe, "Адрес — латиница, цифры и дефис"),
  categoryId: z.string().optional(),
  description: z.string().max(20_000).default(""),
  price: z.string(),
  oldPrice: z.string().optional(),
  sku: z.string().trim().max(60).optional(),
  visibility: z.enum(["DRAFT", "HIDDEN", "PUBLISHED"]),
  publishAt: z.string().optional(),
  limitedTotal: z.string().optional(),
  weightGrams: z.coerce.number().int().min(1).max(100_000),
  lengthCm: z.coerce.number().int().min(1).max(300),
  widthCm: z.coerce.number().int().min(1).max(300),
  heightCm: z.coerce.number().int().min(1).max(300),
  sortOrder: z.coerce.number().int().default(0),
  variants: z.string(),
  images: z.string(),
});

export async function saveProduct(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = ProductIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;

  const variants = z.array(VariantIn).min(1, "Нужен хотя бы один вариант").max(100).safeParse(JSON.parse(d.variants || "[]"));
  if (!variants.success) return { error: variants.error.issues[0]?.message };
  const images = z.array(ImageIn).max(30).safeParse(JSON.parse(d.images || "[]"));
  if (!images.success) return { error: "Ошибка в списке фото" };

  const price = rubToKop(d.price);
  if (!(price >= 100)) return { error: "Укажите цену в рублях" };
  const oldPrice = d.oldPrice?.trim() ? rubToKop(d.oldPrice) : null;
  if (oldPrice != null && oldPrice <= price) return { error: "Старая цена должна быть больше текущей — или оставьте поле пустым" };
  const isLimited = form.get("isLimited") === "on";
  const limitedTotal = isLimited && d.limitedTotal?.trim() ? Math.trunc(Number(d.limitedTotal)) : null;

  const values = {
    name: d.name,
    slug: d.slug,
    categoryId: d.categoryId || null,
    description: d.description,
    price,
    oldPrice,
    sku: d.sku || null,
    visibility: d.visibility,
    publishAt: mskDate(d.publishAt),
    isLimited,
    limitedTotal,
    weightGrams: d.weightGrams,
    lengthCm: d.lengthCm,
    widthCm: d.widthCm,
    heightCm: d.heightCm,
    sortOrder: d.sortOrder,
  };

  let productId = d.id;
  try {
    await db.transaction(async (tx) => {
      if (productId) await tx.update(s.product).set(values).where(eq(s.product.id, productId));
      else productId = (await tx.insert(s.product).values(values).returning({ id: s.product.id }))[0].id;

      // Варианты: обновляем существующие, добавляем новые, удаляем убранные
      const keep = variants.data.filter((v) => v.id).map((v) => v.id!);
      await tx
        .delete(s.productVariant)
        .where(and(eq(s.productVariant.productId, productId!), keep.length ? notInArray(s.productVariant.id, keep) : undefined));
      for (const [i, v] of variants.data.entries()) {
        const row = {
          name: v.name,
          sku: v.sku || null,
          price: v.price.trim() ? rubToKop(v.price) : null,
          stock: v.stock,
          isActive: v.isActive,
          sortOrder: i,
        };
        if (v.id) await tx.update(s.productVariant).set(row).where(and(eq(s.productVariant.id, v.id), eq(s.productVariant.productId, productId!)));
        else await tx.insert(s.productVariant).values({ ...row, productId: productId! });
      }

      // Фото: порядок — как в списке
      await tx.delete(s.productImage).where(eq(s.productImage.productId, productId!));
      if (images.data.length) {
        await tx.insert(s.productImage).values(images.data.map((im, i) => ({ productId: productId!, url: im.url, alt: im.alt || d.name, sortOrder: i })));
      }
    });
  } catch (e) {
    const text = e instanceof Error ? e.message + String((e as { cause?: unknown }).cause) : "";
    if (/unique|duplicate/i.test(text)) {
      if (/sku/i.test(text)) return { error: "Такой артикул уже есть у другого товара или варианта" };
      return { error: "Товар с таким адресом уже есть" };
    }
    throw e;
  }
  await audit(me.id, d.id ? "product.update" : "product.create", "product", productId, { slug: d.slug, visibility: d.visibility });
  revalidatePath("/", "layout");
  if (!d.id) redirect(`/admin/catalog/product/${productId}?saved=1`);
  return { ok: "Сохранено" };
}

export async function deleteProduct(id: string) {
  const me = await requireAdmin("OWNER");
  const p = await db.query.product.findFirst({ where: eq(s.product.id, id) });
  await db.delete(s.product).where(eq(s.product.id, id));
  await audit(me.id, "product.delete", "product", id, { slug: p?.slug });
  revalidatePath("/", "layout");
  redirect("/admin/catalog");
}

// ============================================================
// Категории
// ============================================================

const CategoryIn = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Введите название").max(120),
  slug: z.string().trim().toLowerCase().regex(slugRe, "Адрес — латиница, цифры и дефис"),
  description: z.string().max(2000).optional(),
  image: z.string().max(500).optional(),
  visibility: z.enum(["DRAFT", "HIDDEN", "PUBLISHED"]),
  publishAt: z.string().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveCategory(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = CategoryIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const values = {
    name: d.name,
    slug: d.slug,
    description: d.description?.trim() || null,
    image: d.image?.trim() || null,
    visibility: d.visibility,
    publishAt: mskDate(d.publishAt),
    sortOrder: d.sortOrder,
  };
  let id = d.id;
  try {
    if (id) await db.update(s.category).set(values).where(eq(s.category.id, id));
    else id = (await db.insert(s.category).values(values).returning({ id: s.category.id }))[0].id;
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message + String((e as { cause?: unknown }).cause))) return { error: "Категория с таким адресом уже есть" };
    throw e;
  }
  await audit(me.id, d.id ? "category.update" : "category.create", "category", id, { slug: d.slug });
  revalidatePath("/", "layout");
  if (!d.id) redirect(`/admin/catalog/category/${id}?saved=1`);
  return { ok: "Сохранено" };
}

export async function deleteCategory(id: string) {
  const me = await requireAdmin("OWNER");
  const n = await db.$count(s.product, eq(s.product.categoryId, id));
  if (n > 0) throw new Error("Сначала перенесите товары в другую категорию");
  await db.delete(s.category).where(eq(s.category.id, id));
  await audit(me.id, "category.delete", "category", id);
  revalidatePath("/", "layout");
  redirect("/admin/catalog");
}

// ============================================================
// Настройки доставки и оформления
// ============================================================

const ShopSettingsIn = z.object({
  fromCityCode: z.coerce.number().int().positive("Код города отправки — число, Краснодар: 435"),
  shipmentPoint: z.string().trim().min(2, "Укажите код ПВЗ, где сдаёте посылки").max(20),
  tariffPvz: z.coerce.number().int().positive(),
  tariffCourier: z.coerce.number().int().positive(),
  markup: z.coerce.number().int().min(0),
  freeFrom: z.coerce.number().int().min(0),
  flatPvz: z.coerce.number().int().min(0),
  flatCourier: z.coerce.number().int().min(0),
  paymentMinutes: z.coerce.number().int().min(15, "Не меньше 15 минут").max(1440),
  maxQtyPerItem: z.coerce.number().int().min(1).max(999),
  notice: z.string().trim().max(500),
});

export async function updateShopSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  const p = ShopSettingsIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const pvzEnabled = form.get("pvzEnabled") === "on";
  const courierEnabled = form.get("courierEnabled") === "on";
  if (!pvzEnabled && !courierEnabled) return { error: "Оставьте хотя бы один способ доставки" };
  const cur = await getSettings();
  await saveSettings({
    ...cur,
    delivery: {
      pvzEnabled,
      courierEnabled,
      fromCityCode: d.fromCityCode,
      shipmentPoint: d.shipmentPoint.toUpperCase(),
      tariffPvz: d.tariffPvz,
      tariffCourier: d.tariffCourier,
      markup: d.markup,
      freeFrom: d.freeFrom,
      flatPvz: d.flatPvz,
      flatCourier: d.flatCourier,
    },
    checkout: { paymentMinutes: d.paymentMinutes, maxQtyPerItem: d.maxQtyPerItem, notice: d.notice },
  });
  await audit(me.id, "settings.shop", "setting", "site", d);
  revalidatePath("/", "layout");
  return { ok: "Сохранено" };
}
