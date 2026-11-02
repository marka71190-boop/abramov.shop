import "server-only";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { attrValues, formatAttr, listAttributes } from "@/lib/attributes";
import { decorate } from "@/lib/catalog";
import { retailWhere } from "@/lib/visibility";

/** Паспорт кия: главное — в одну строку под названием */
const PASSPORT: { key: string; label: string }[] = [
  { key: "weight", label: "Вес" },
  { key: "length", label: "Длина" },
  { key: "tip", label: "Наклейка" },
  { key: "construction", label: "Конструкция" },
  { key: "butt", label: "Турняк" },
  { key: "shaft", label: "Древко" },
  { key: "joint", label: "Соединение" },
  { key: "balance", label: "Баланс" },
  { key: "brand", label: "Мастер / бренд" },
];

export async function cuePassport(productId: string) {
  const [defs, vals] = await Promise.all([listAttributes(), attrValues([productId])]);
  const mine = vals.get(productId) ?? new Map<string, string>();
  const out: { label: string; value: string }[] = [];
  for (const p of PASSPORT) {
    const d = defs.find((x) => x.key === p.key);
    const v = d && mine.get(d.id);
    if (d && v) out.push({ label: p.label, value: formatAttr(d, v) });
  }
  return out;
}

/** Похожие кии в наличии: та же категория, ближе по весу — выше */
export async function similarCues(productId: string, categoryId: string | null, limit = 8) {
  if (!categoryId) return [];
  const weight = await db
    .select({ value: s.productAttribute.value })
    .from(s.productAttribute)
    .innerJoin(s.attribute, eq(s.attribute.id, s.productAttribute.attributeId))
    .where(and(eq(s.productAttribute.productId, productId), eq(s.attribute.key, "weight")))
    .then((r) => Number(r[0]?.value) || null);
  const stock = sql<number>`(select coalesce(sum(v.stock), 0) from ${s.productVariant} v where v.product_id = ${s.product.id} and v.is_active)`;
  const w = sql<number | null>`(select pa.value::numeric from ${s.productAttribute} pa join ${s.attribute} a on a.id = pa.attribute_id where pa.product_id = ${s.product.id} and a.key = 'weight' and pa.value ~ '^[0-9]+([.][0-9]+)?$' limit 1)`;
  const rows = await db
    .select({ product: s.product, w })
    .from(s.product)
    .where(and(retailWhere(s.product), eq(s.product.categoryId, categoryId), ne(s.product.id, productId), gt(stock, 0)))
    .orderBy(weight ? sql`abs(coalesce(${w}, 0) - ${weight})` : sql`${s.product.sortOrder}`)
    .limit(limit);
  return decorate(rows.map((r) => r.product));
}
