import "server-only";
import { and, avg, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";

export interface RatingInfo {
  avg: number;
  count: number;
}

/** Средняя оценка и число одобренных отзывов — для карточек и страницы товара. */
export async function ratingsFor(productIds: string[]): Promise<Map<string, RatingInfo>> {
  const out = new Map<string, RatingInfo>();
  if (!productIds.length) return out;
  const rows = await db
    .select({ productId: s.review.productId, avg: avg(s.review.rating), n: count() })
    .from(s.review)
    .where(and(inArray(s.review.productId, productIds), eq(s.review.status, "APPROVED")))
    .groupBy(s.review.productId);
  for (const r of rows) out.set(r.productId, { avg: Math.round(Number(r.avg) * 10) / 10, count: r.n });
  return out;
}

export async function approvedReviews(productId: string) {
  return db.query.review.findMany({
    where: and(eq(s.review.productId, productId), eq(s.review.status, "APPROVED")),
    orderBy: desc(s.review.createdAt),
    limit: 50,
    with: { user: { columns: { name: true } } },
  });
}

/** Отзыв можно оставить на товар из полученного заказа. Возвращает номер заказа или null. */
export async function reviewableOrder(userId: string, productId: string) {
  const [row] = await db
    .select({ orderId: s.order.id })
    .from(s.orderItem)
    .innerJoin(s.order, eq(s.order.id, s.orderItem.orderId))
    .where(and(eq(s.order.userId, userId), eq(s.order.status, "DELIVERED"), eq(s.orderItem.productId, productId)))
    .limit(1);
  return row?.orderId ?? null;
}

export async function myReview(userId: string, productId: string) {
  return db.query.review.findFirst({ where: and(eq(s.review.userId, userId), eq(s.review.productId, productId)) });
}

export async function isFavorite(userId: string, productId: string) {
  const r = await db.query.favorite.findFirst({ where: and(eq(s.favorite.userId, userId), eq(s.favorite.productId, productId)) });
  return !!r;
}

export async function favoriteIds(userId: string) {
  const rows = await db.select({ id: s.favorite.productId }).from(s.favorite).where(eq(s.favorite.userId, userId));
  return new Set(rows.map((r) => r.id));
}

export async function isSubscribed(userId: string, productId: string) {
  const r = await db.query.stockSubscription.findFirst({
    where: and(eq(s.stockSubscription.userId, userId), eq(s.stockSubscription.productId, productId), isNull(s.stockSubscription.notifiedAt)),
  });
  return !!r;
}

/** «Имя Ф.» — для подписи отзыва. */
export function shortName(name: string) {
  const [first, last] = name.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
}
