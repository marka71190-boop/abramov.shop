import type { MetadataRoute } from "next";
import { db, schema as s } from "@/db";
import { SITE } from "@/lib/site";
import { publicWhere } from "@/lib/visibility";

export const dynamic = "force-dynamic";

/** В карту сайта попадает только открытое — скрытые страницы, категории и товары не светятся в поиске. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [pages, cats, products] = await Promise.all([
    db.select({ slug: s.page.slug, updatedAt: s.page.updatedAt }).from(s.page).where(publicWhere(s.page)),
    db.select({ slug: s.category.slug, updatedAt: s.category.updatedAt }).from(s.category).where(publicWhere(s.category)),
    db.select({ slug: s.product.slug, updatedAt: s.product.updatedAt }).from(s.product).where(publicWhere(s.product)),
  ]);
  return [
    { url: SITE.url, changeFrequency: "daily", priority: 1 },
    ...cats.map((c) => ({ url: `${SITE.url}/catalog/${c.slug}`, lastModified: c.updatedAt })),
    ...products.map((p) => ({ url: `${SITE.url}/product/${p.slug}`, lastModified: p.updatedAt })),
    ...pages.map((p) => ({ url: `${SITE.url}/p/${p.slug}`, lastModified: p.updatedAt })),
  ];
}
