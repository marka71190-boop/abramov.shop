/**
 * Кий «Чемпион» на заказ — серверная часть: прайс в базе, служебный товар для заказов,
 * строка корзины по коду сборки.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema as s } from "@/db";
import { mergeCue, parseCueKey, resolveCue, specText, type CueConfig } from "@/lib/cue-config";

const KEY = "cue";
/** Служебный товар: к нему привязаны позиции заказов, по нему считаются размеры посылки для СДЭК */
export const CUE_SLUG = "kiy-chempion-na-zakaz";

export const getCueConfig = cache(async (): Promise<CueConfig> => {
  const row = await db.query.setting.findFirst({ where: eq(s.setting.key, KEY) });
  return mergeCue(row?.value);
});

export async function saveCueConfig(c: CueConfig) {
  await db
    .insert(s.setting)
    .values({ key: KEY, value: c })
    .onConflictDoUpdate({ target: s.setting.key, set: { value: c, updatedAt: new Date() } });
}

/** Товар-носитель для заказов: скрыт из каталога, вес и габариты — коробки с кием */
export async function cueProduct() {
  const found = await db.query.product.findFirst({ where: eq(s.product.slug, CUE_SLUG) });
  if (found) return found;
  const [p] = await db
    .insert(s.product)
    .values({
      name: "Кий «Чемпион» на заказ",
      slug: CUE_SLUG,
      description: "Служебный товар для конструктора кия. Вес и габариты — для расчёта доставки СДЭК.",
      price: 0,
      visibility: "HIDDEN",
      weightGrams: 2500,
      lengthCm: 165,
      widthCm: 12,
      heightCm: 12,
    })
    .onConflictDoNothing()
    .returning();
  return p ?? (await db.query.product.findFirst({ where: eq(s.product.slug, CUE_SLUG) }))!;
}

/** Строка корзины для сборки кия или причина, почему её нельзя купить */
export async function cueLine(key: string, qty: number) {
  const cfg = await getCueConfig();
  if (!cfg.enabled) return { error: "Заказ киёв «Чемпион» временно не принимаем" } as const;
  const sel = parseCueKey(key);
  if (!sel) return { error: "Сборка кия устарела — соберите его заново" } as const;
  const r = resolveCue(cfg, sel);
  if (typeof r === "string") return { error: "Параметры кия изменились — соберите его заново" } as const;
  const p = await cueProduct();
  return {
    line: {
      variantId: key,
      productId: p.id,
      slug: CUE_SLUG,
      href: `/cue?c=${encodeURIComponent(key)}`,
      name: "Кий «Чемпион»",
      variantName: r.summary,
      sku: "CHAMPION",
      image: `/cue/thumb?c=${encodeURIComponent(key)}`,
      price: r.price,
      qty,
      stock: 999,
      lineTotal: r.price * qty,
      categoryId: p.categoryId,
      weightGrams: p.weightGrams,
      lengthCm: p.lengthCm,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
      spec: specText(r),
      madeToOrder: cfg.leadDays,
    },
  } as const;
}
