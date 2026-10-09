import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { publicWhere } from "@/lib/visibility";

export async function getPublicCategories() {
  return db.select().from(s.category).where(publicWhere(s.category)).orderBy(asc(s.category.sortOrder), asc(s.category.name));
}

/** Первые фото и остатки для списка товаров. */
async function decorate(products: (typeof s.product.$inferSelect)[]) {
  if (!products.length) return [];
  const ids = products.map((p) => p.id);
  const [images, stock] = await Promise.all([
    db.select().from(s.productImage).where(inArray(s.productImage.productId, ids)).orderBy(asc(s.productImage.sortOrder)),
    db
      .select({ productId: s.productVariant.productId, stock: sql<number>`coalesce(sum(${s.productVariant.stock}), 0)::int` })
      .from(s.productVariant)
      .where(and(inArray(s.productVariant.productId, ids), eq(s.productVariant.isActive, true)))
      .groupBy(s.productVariant.productId),
  ]);
  return products.map((p) => ({
    ...p,
    image: images.find((i) => i.productId === p.id) ?? null,
    stock: stock.find((x) => x.productId === p.id)?.stock ?? 0,
  }));
}

export async function getPublicProductsByCategory(categoryId: string) {
  const rows = await db
    .select()
    .from(s.product)
    .where(and(publicWhere(s.product), eq(s.product.categoryId, categoryId)))
    .orderBy(asc(s.product.sortOrder), asc(s.product.name));
  return decorate(rows);
}

export async function getFeaturedLimited() {
  const rows = await db
    .select()
    .from(s.product)
    .where(and(publicWhere(s.product), eq(s.product.isLimited, true)))
    .orderBy(asc(s.product.sortOrder))
    .limit(1);
  const [p] = await decorate(rows);
  return p ?? null;
}

export async function getProductBySlug(slug: string) {
  const p = await db.query.product.findFirst({
    where: eq(s.product.slug, slug),
    with: {
      images: { orderBy: asc(s.productImage.sortOrder) },
      variants: { where: eq(s.productVariant.isActive, true), orderBy: asc(s.productVariant.sortOrder) },
      category: true,
    },
  });
  return p ?? null;
}
