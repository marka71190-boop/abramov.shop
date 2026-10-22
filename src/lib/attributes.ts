/** Характеристики товаров: справочник, значения, форматирование. */
import "server-only";
import { asc, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";

export type Attr = typeof s.attribute.$inferSelect;
import type { AttrType } from "./attributes-defaults";
export type { AttrType };

export const ATTR_TYPES: Record<AttrType, string> = { number: "Число (фильтр «от–до»)", select: "Выбор из списка", text: "Текст (только в карточке)" };

export async function listAttributes() {
  return db.query.attribute.findMany({ orderBy: [asc(s.attribute.sortOrder), asc(s.attribute.name)] });
}

/** Для категории: свои + общие (без категорий) */
export const appliesTo = (a: Pick<Attr, "categoryIds">, categoryId: string | null) => !a.categoryIds.length || (!!categoryId && a.categoryIds.includes(categoryId));

/** Значения характеристик по товарам: productId → attrId → value */
export async function attrValues(productIds: string[]) {
  const out = new Map<string, Map<string, string>>();
  if (!productIds.length) return out;
  const rows = await db.select().from(s.productAttribute).where(inArray(s.productAttribute.productId, productIds));
  for (const r of rows) {
    if (!out.has(r.productId)) out.set(r.productId, new Map());
    out.get(r.productId)!.set(r.attributeId, r.value);
  }
  return out;
}

/** «12.5» → «12,5 мм» */
export function formatAttr(a: Pick<Attr, "type" | "unit">, value: string) {
  const v = a.type === "number" ? value.replace(".", ",") : value;
  return a.unit ? `${v} ${a.unit}` : v;
}

/** Проверка значения из формы. null — пусто (удалить), строка ошибки — нельзя сохранить */
export function normalizeAttr(a: Pick<Attr, "type" | "options" | "name">, raw: unknown): { value: string | null } | { error: string } {
  const v = String(raw ?? "").trim();
  if (!v) return { value: null };
  if (a.type === "number") {
    const n = Number(v.replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(n)) return { error: `«${a.name}» — числом` };
    return { value: String(Math.round(n * 1000) / 1000) };
  }
  if (a.type === "select") {
    const hit = a.options.find((o) => o.toLowerCase() === v.toLowerCase());
    if (!hit) return { error: `«${a.name}»: выберите из списка` };
    return { value: hit };
  }
  return { value: v.slice(0, 200) };
}

/** Характеристики товара для карточки: в порядке справочника */
export async function productSpecs(productId: string, categoryId: string | null) {
  const [attrs, vals] = await Promise.all([listAttributes(), attrValues([productId])]);
  const mine = vals.get(productId) ?? new Map();
  return attrs.filter((a) => mine.has(a.id) && appliesTo(a, categoryId)).map((a) => ({ name: a.name, value: formatAttr(a, mine.get(a.id)!) }));
}

export { DEFAULT_ATTRIBUTES } from "./attributes-defaults";
