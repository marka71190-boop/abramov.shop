/** Журнал — серверная часть */
import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { publicWhere } from "@/lib/visibility";

export type Article = typeof s.article.$inferSelect;

export async function publicArticles(section?: string) {
  return db.query.article.findMany({
    where: and(publicWhere(s.article), section ? eq(s.article.section, section) : undefined),
    orderBy: [desc(s.article.publishAt), desc(s.article.createdAt)],
    limit: 200,
  });
}

export async function articleBySlug(slug: string) {
  return (await db.query.article.findFirst({ where: eq(s.article.slug, slug) })) ?? null;
}

/** Ещё почитать: из того же раздела, потом свежие */
export async function moreArticles(a: Article, limit = 3) {
  const same = await db.query.article.findMany({
    where: and(publicWhere(s.article), eq(s.article.section, a.section), ne(s.article.id, a.id)),
    orderBy: desc(s.article.createdAt),
    limit,
  });
  if (same.length >= limit) return same;
  const rest = await db.query.article.findMany({
    where: and(publicWhere(s.article), ne(s.article.id, a.id), same.length ? ne(s.article.section, a.section) : undefined),
    orderBy: desc(s.article.createdAt),
    limit: limit - same.length,
  });
  return [...same, ...rest];
}

/** Дата для читателя: дата публикации или создания */
export const articleDate = (a: Pick<Article, "publishAt" | "createdAt">) => a.publishAt ?? a.createdAt;

