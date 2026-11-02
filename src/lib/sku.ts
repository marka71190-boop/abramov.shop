import "server-only";
import { eq, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isGroup, type GroupKey } from "@/lib/attributes-pro";

/** Префикс артикула по категории: кии — CUE, мел — CHALK… Без категории — AB */
const PREFIX: Record<GroupKey, string> = {
  cues: "CUE",
  tips: "TIP",
  chalk: "CHALK",
  balls: "BALL",
  cloth: "CLOTH",
  tables: "TABLE",
  gloves: "GLOVE",
  merch: "MERCH",
  cases: "CASE",
};

export async function skuPrefix(categoryId: string | null | undefined) {
  if (!categoryId) return "AB";
  const cat = await db.query.category.findFirst({ where: eq(s.category.id, categoryId), columns: { name: true, slug: true } });
  for (const [g, p] of Object.entries(PREFIX) as [GroupKey, string][]) if (isGroup(g, cat)) return p;
  return "AB";
}

/** Следующий свободный артикул: CUE-0001, CUE-0002… (смотрим и товары, и варианты) */
export async function nextSku(categoryId: string | null | undefined) {
  const prefix = await skuPrefix(categoryId);
  const re = `^${prefix}-([0-9]+)$`;
  const [p, v] = await Promise.all([
    db
      .select({ n: sql<number | null>`max((regexp_match(${s.product.sku}, ${re}))[1]::int)` })
      .from(s.product)
      .where(sql`${s.product.sku} ~ ${re}`),
    db
      .select({ n: sql<number | null>`max((regexp_match(${s.productVariant.sku}, ${re}))[1]::int)` })
      .from(s.productVariant)
      .where(or(sql`${s.productVariant.sku} ~ ${re}`)),
  ]);
  const n = Math.max(p[0]?.n ?? 0, v[0]?.n ?? 0) + 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}
