"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { getActiveConsent } from "@/lib/consent";
import { normalizePhone } from "@/lib/format";
import { cancelOrder, markPaid, OrderError, placeOrder } from "@/lib/orders";
import { computeQuote, type Quote } from "@/lib/pricing";
import { createRateLimiter } from "@/lib/rate-limit";
import { getOrigin, getRequestMeta } from "@/lib/request";
import { SITE, isPlaceholderEmail } from "@/lib/site";
import { getActiveBan, getViewer, isAdmin } from "@/lib/viewer";
import { yookassaEnabled } from "@/lib/yookassa";

const Line = z.object({ variantId: z.string().max(64), qty: z.coerce.number().int().min(1).max(999) });
const Delivery = z.object({
  type: z.enum(["PVZ", "COURIER"]),
  cityCode: z.number().int().positive().nullish(),
  cityName: z.string().trim().max(200).nullish(),
  pvzCode: z.string().trim().max(40).nullish(),
  pvzAddress: z.string().trim().max(300).nullish(),
  address: z.string().trim().max(300).nullish(),
  postalCode: z.string().trim().max(12).nullish(),
});
const QuoteIn = z.object({
  lines: z.array(Line).max(50),
  promoCode: z.string().trim().max(40).nullish(),
  useBonus: z.boolean().optional(),
  delivery: Delivery.nullish(),
});

const quoteLimit = createRateLimiter({ limit: 120, windowMs: 60_000 });
const placeLimit = createRateLimiter({ limit: 6, windowMs: 10 * 60_000 });

async function ipKey() {
  return (await getRequestMeta()).ip ?? "?";
}

/** Пересчёт корзины / страницы оформления. */
export async function quoteAction(raw: unknown): Promise<{ quote?: Quote; error?: string }> {
  if (!quoteLimit(await ipKey())) return { error: "Слишком много запросов, подождите минуту" };
  const p = QuoteIn.safeParse(raw);
  if (!p.success) return { error: "Некорректные данные корзины" };
  const viewer = await getViewer();
  return { quote: await computeQuote(p.data, viewer && !getActiveBan(viewer) ? viewer : null) };
}

const PlaceIn = QuoteIn.extend({
  name: z.string().trim().min(2, "Укажите имя и фамилию получателя").max(120),
  phone: z.string().trim().max(40),
  email: z.email("Проверьте почту — на неё придёт чек").max(200),
  comment: z.string().trim().max(1000).nullish(),
  referralCode: z.string().trim().max(20).nullish(),
  expectedTotal: z.number().int(),
});

export async function placeOrderAction(raw: unknown): Promise<{ payUrl?: string; number?: string; error?: string; quote?: Quote }> {
  const user = await getViewer();
  if (!user) return { error: "Войдите в аккаунт, чтобы оформить заказ" };
  if (getActiveBan(user)) return { error: "Аккаунт заблокирован" };
  if (!(await getActiveConsent(user.id, "PERSONAL_DATA"))) return { error: "Нужно согласие на обработку персональных данных" };
  if (!yookassaEnabled() && !isAdmin(user)) return { error: "Онлайн-оплата подключается. Напишите нам в Telegram — оформим заказ вручную" };
  if (!placeLimit(user.id)) return { error: "Слишком много попыток. Подождите несколько минут" };

  const p = PlaceIn.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте поля формы" };
  const phone = normalizePhone(p.data.phone);
  if (!phone) return { error: "Проверьте телефон: нужен российский номер, например +7 900 123-45-67" };
  if (isPlaceholderEmail(p.data.email)) return { error: "Укажите настоящую почту — на неё придёт чек" };

  try {
    const origin = await getOrigin(SITE.url);
    const r = await placeOrder(user, { ...p.data, phone }, origin);
    revalidatePath("/account");
    return r;
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message, quote: e.quote };
    console.error("[checkout] placeOrder:", e);
    return { error: "Не удалось оформить заказ. Попробуйте ещё раз через минуту" };
  }
}

/** Покупатель сам отменяет неоплаченный заказ. */
export async function cancelMyOrder(number: string) {
  const user = await getViewer();
  if (!user) return;
  const o = await db.query.order.findFirst({ where: and(eq(s.order.number, number), eq(s.order.userId, user.id)) });
  if (!o) return;
  await cancelOrder(o.id, "Отменён покупателем", user.id, { onlyIfAwaiting: true });
  revalidatePath(`/order/${number}`);
}

/** Тестовая оплата — только для админов, пока ЮKassa не подключена. */
export async function testPay(number: string) {
  const user = await getViewer();
  if (!isAdmin(user) || yookassaEnabled()) return;
  const o = await db.query.order.findFirst({ where: eq(s.order.number, number) });
  if (!o) return;
  await markPaid(o.id, `test:${user!.id}`);
  revalidatePath(`/order/${number}`);
}
