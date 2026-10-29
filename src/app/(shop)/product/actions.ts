"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { reviewableOrder } from "@/lib/reviews";
import { SITE } from "@/lib/site";
import { esc, notifyAdmins } from "@/lib/telegram";
import { getActiveBan, getViewer } from "@/lib/viewer";

async function me() {
  const u = await getViewer();
  if (!u || getActiveBan(u)) return null;
  return u;
}

/** Добавить или убрать из избранного. Возвращает новое состояние; null — нужно войти. */
export async function toggleFavorite(productId: string): Promise<boolean | null> {
  const u = await me();
  if (!u) return null;
  const where = and(eq(s.favorite.userId, u.id), eq(s.favorite.productId, productId));
  const existing = await db.query.favorite.findFirst({ where });
  if (existing) await db.delete(s.favorite).where(where);
  else {
    // Цена на момент добавления — от неё считаем «подешевело»
    const { baselineFor } = await import("@/lib/price-drop");
    await db.insert(s.favorite).values({ userId: u.id, productId, notifiedPrice: await baselineFor(productId) }).onConflictDoNothing();
  }
  revalidatePath("/account");
  return !existing;
}

/** «Сообщить о поступлении». Возвращает новое состояние; null — нужно войти. */
export async function toggleStockAlert(productId: string): Promise<boolean | null> {
  const u = await me();
  if (!u) return null;
  const where = and(eq(s.stockSubscription.userId, u.id), eq(s.stockSubscription.productId, productId));
  const existing = await db.query.stockSubscription.findFirst({ where });
  if (existing && !existing.notifiedAt) {
    await db.delete(s.stockSubscription).where(where);
    return false;
  }
  if (existing) await db.update(s.stockSubscription).set({ notifiedAt: null, createdAt: new Date() }).where(where);
  else await db.insert(s.stockSubscription).values({ productId, userId: u.id, email: u.email });
  return true;
}

const ReviewIn = z.object({
  productId: z.string().min(1),
  rating: z.coerce.number().int().min(1, "Поставьте оценку").max(5),
  text: z.string().trim().min(10, "Напишите хотя бы пару предложений").max(2000),
  photos: z.array(z.string().regex(/^\/media\/[0-9a-f-]{36}$/)).max(5),
});

export async function submitReview(input: unknown): Promise<{ ok?: string; error?: string }> {
  const u = await me();
  if (!u) return { error: "Войдите в аккаунт" };
  const p = ReviewIn.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const orderId = await reviewableOrder(u.id, d.productId);
  if (!orderId) return { error: "Отзыв можно оставить после получения заказа с этим товаром" };
  const existing = await db.query.review.findFirst({ where: and(eq(s.review.userId, u.id), eq(s.review.productId, d.productId)) });
  const values = { rating: d.rating, text: d.text, photos: d.photos, status: "PENDING" as const, orderId };
  if (existing) await db.update(s.review).set({ ...values, moderatedAt: null }).where(eq(s.review.id, existing.id));
  else await db.insert(s.review).values({ ...values, productId: d.productId, userId: u.id });

  const product = await db.query.product.findFirst({ where: eq(s.product.id, d.productId), columns: { name: true, slug: true } });
  void notifyAdmins(`⭐ Новый отзыв ${"★".repeat(d.rating)}${"☆".repeat(5 - d.rating)} на «${esc(product?.name ?? "")}»\n\n${esc(d.text.slice(0, 500))}`, {
    text: "Модерация",
    url: `${SITE.url}/admin/reviews`,
  });
  revalidatePath(`/product/${product?.slug}`);
  return { ok: "Спасибо! Отзыв появится после проверки" };
}

const QuestionIn = z.object({
  productId: z.string().min(1).max(64),
  text: z.string().trim().min(8, "Опишите вопрос чуть подробнее").max(1000, "Слишком длинно — до 1000 символов"),
});

const askLimit = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });

/** Вопрос о товаре. Виден автору сразу, остальным — после ответа магазина */
export async function askQuestion(input: unknown): Promise<{ ok?: string; error?: string }> {
  const u = await me();
  if (!u) return { error: "Войдите в аккаунт, чтобы задать вопрос" };
  const p = QuestionIn.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message };
  if (!askLimit(u.id)) return { error: "Слишком много вопросов подряд — попробуйте через час" };
  const product = await db.query.product.findFirst({ where: eq(s.product.id, p.data.productId), columns: { id: true, name: true, slug: true } });
  if (!product) return { error: "Товар не найден" };
  const waiting = await db.$count(s.productQuestion, and(eq(s.productQuestion.userId, u.id), eq(s.productQuestion.productId, product.id), eq(s.productQuestion.status, "NEW")));
  if (waiting >= 3) return { error: "Мы ещё отвечаем на ваши прошлые вопросы об этом товаре" };
  await db.insert(s.productQuestion).values({ productId: product.id, userId: u.id, text: p.data.text.replace(/\r\n/g, "\n") });
  // Без текста вопроса: в нём могут быть контакты, а Telegram — иностранный сервис (152-ФЗ)
  void notifyAdmins(`❓ Новый вопрос о товаре «${esc(product.name)}»`, { text: "Ответить", url: `${SITE.url}/admin/questions` });
  revalidatePath(`/product/${product.slug}`);
  return { ok: "Вопрос отправлен. Ответ придёт на почту и появится здесь" };
}
