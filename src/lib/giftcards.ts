/**
 * Подарочные сертификаты.
 *
 *   покупка на сайте → PENDING (ждём оплату в ЮKassa; чек — полный расчёт, «иной предмет расчёта»)
 *     ├─ оплачен → ACTIVE: письмо покупателю, письмо получателю (сразу или в выбранный день)
 *     └─ не оплачен вовремя → VOID
 *   выпуск в админке → сразу ACTIVE
 *
 * Оплата заказа: сумма списывается с баланса при оформлении (gift_card_use), при отмене
 * или возврате заказа возвращается на сертификат. В чеке заказа сертификат — скидка:
 * в чек попадает только то, что покупатель доплатил онлайн (так решил бухгалтер).
 *
 * Все суммы — в копейках. Один сертификат на заказ.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { auditSystem } from "@/lib/audit";
import { fmtDate, rub } from "@/lib/format";
import { escHtml, sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import type { UserRow } from "@/lib/viewer";
import {
  createPaymentFor,
  createRefund,
  fromMoney,
  getPayment,
  yookassaEnabled,
  type ReceiptLine,
  type YkPayment,
} from "@/lib/yookassa";

export type GiftCard = typeof s.giftCard.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class GiftError extends Error {}

// ---------- Коды

const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без 0/O и 1/I
const CYR: Record<string, string> = { А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", Р: "P", С: "C", Т: "T", Х: "X", У: "Y" };

function newCode() {
  const b = randomBytes(12);
  const raw = Array.from(b, (x) => ABC[x % ABC.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
const newToken = () => randomBytes(18).toString("base64url");

/** Код, как его ввёл покупатель: регистр, пробелы, русские буквы-двойники, без дефисов. */
export function normalizeCode(input: string) {
  const up = input.toUpperCase().replace(/[АВЕКМНРСТХУ]/g, (c) => CYR[c] ?? c);
  const raw = up.replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 12) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export const giftUrl = (token: string) => `${SITE.url}/gift/${token}`;
export const isExpired = (c: Pick<GiftCard, "expiresAt">, now = new Date()) => !!c.expiresAt && c.expiresAt <= now;
export const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, d: string) => `${a}${"•".repeat(Math.min(6, Math.max(2, b.length)))}${d}`);

async function insertCard(values: Omit<typeof s.giftCard.$inferInsert, "code" | "token">) {
  for (let i = 0; i < 5; i++) {
    try {
      const [c] = await db.insert(s.giftCard).values({ ...values, code: newCode(), token: newToken() }).returning();
      return c;
    } catch (e) {
      if (i === 4) throw e;
    }
  }
  throw new Error("unreachable");
}

// ---------- Проверка кода (корзина, оформление, «проверить баланс»)

export type GiftCheck = { card: GiftCard } | { error: string };

export async function checkGiftCode(code: string): Promise<GiftCheck> {
  const c = normalizeCode(code);
  if (!c) return { error: "Код сертификата — 12 букв и цифр, например ABCD-EFGH-2345" };
  const card = await db.query.giftCard.findFirst({ where: eq(s.giftCard.code, c) });
  if (!card) return { error: "Сертификат с таким кодом не найден" };
  if (card.status === "PENDING") return { error: "Сертификат ещё не оплачен" };
  if (card.status === "VOID") return { error: "Сертификат недействителен" };
  if (isExpired(card)) return { error: `Срок действия сертификата закончился ${fmtDate(card.expiresAt!)}` };
  if (card.balance <= 0) return { error: "На сертификате не осталось денег" };
  return { card };
}

/**
 * Сколько списать с сертификата. Онлайн-платёж меньше 1 ₽ ЮKassa не принимает —
 * тогда сертификат покрывает всё, кроме 1 ₽.
 */
export function giftApplicable(balance: number, total: number) {
  let applied = Math.min(balance, total);
  const rest = total - applied;
  if (rest > 0 && rest < 100) applied = Math.max(0, total - 100);
  return applied;
}

/** Как сумма сертификата делится между товарами и доставкой: сертификат сначала покрывает товары. */
export function splitGift(o: { total: number; shippingCost: number; giftCardAmount: number }) {
  const goods = o.total - o.shippingCost;
  const certGoods = Math.min(goods, o.giftCardAmount);
  const certShip = Math.max(0, o.giftCardAmount - certGoods);
  return { cashGoods: goods - certGoods, cashShip: o.shippingCost - certShip, certGoods, certShip };
}

// ---------- Списание и возврат на сертификат (внутри транзакции заказа)

export async function chargeGift(tx: Tx, code: string, orderId: string, amount: number) {
  const r = await tx
    .update(s.giftCard)
    .set({ balance: sql`${s.giftCard.balance} - ${amount}`, updatedAt: new Date() })
    .where(
      and(
        eq(s.giftCard.code, code),
        eq(s.giftCard.status, "ACTIVE"),
        gte(s.giftCard.balance, amount),
        or(isNull(s.giftCard.expiresAt), gt(s.giftCard.expiresAt, new Date())),
      ),
    )
    .returning({ id: s.giftCard.id });
  if (!r.length) return false;
  await tx.insert(s.giftCardUse).values({ giftCardId: r[0].id, orderId, amount });
  return true;
}

/** Заказ отменён или возвращён — сумма возвращается на сертификат. */
export async function releaseGift(tx: Tx, orderId: string) {
  const uses = await tx.select().from(s.giftCardUse).where(and(eq(s.giftCardUse.orderId, orderId), isNull(s.giftCardUse.reversedAt)));
  for (const u of uses) {
    await tx.update(s.giftCard).set({ balance: sql`${s.giftCard.balance} + ${u.amount}`, updatedAt: new Date() }).where(eq(s.giftCard.id, u.giftCardId));
    await tx.update(s.giftCardUse).set({ reversedAt: new Date() }).where(eq(s.giftCardUse.id, u.id));
  }
  return uses.reduce((a, u) => a + u.amount, 0);
}

/** Часть суммы вернулась на сертификат (возврат части товаров по заявке). */
export async function returnToGift(tx: Tx, orderId: string, amount: number) {
  if (amount <= 0) return 0;
  const [u] = await tx.select().from(s.giftCardUse).where(and(eq(s.giftCardUse.orderId, orderId), isNull(s.giftCardUse.reversedAt))).limit(1);
  if (!u) return 0;
  const back = Math.min(amount, u.amount);
  await tx.update(s.giftCard).set({ balance: sql`${s.giftCard.balance} + ${back}`, updatedAt: new Date() }).where(eq(s.giftCard.id, u.giftCardId));
  if (back === u.amount) await tx.update(s.giftCardUse).set({ reversedAt: new Date() }).where(eq(s.giftCardUse.id, u.id));
  else await tx.update(s.giftCardUse).set({ amount: u.amount - back }).where(eq(s.giftCardUse.id, u.id));
  return back;
}

/** Оплата пришла после автоотмены заказа: снова списываем с сертификата, если получится. */
export async function rechargeGift(tx: Tx, orderId: string) {
  const uses = await tx.select().from(s.giftCardUse).where(and(eq(s.giftCardUse.orderId, orderId), isNotNull(s.giftCardUse.reversedAt)));
  for (const u of uses) {
    const r = await tx
      .update(s.giftCard)
      .set({ balance: sql`${s.giftCard.balance} - ${u.amount}` })
      .where(and(eq(s.giftCard.id, u.giftCardId), gte(s.giftCard.balance, u.amount)))
      .returning({ id: s.giftCard.id });
    if (!r.length) return false;
    await tx.update(s.giftCardUse).set({ reversedAt: null }).where(eq(s.giftCardUse.id, u.id));
  }
  return true;
}

// ---------- Покупка на сайте

export interface BuyInput {
  amount: number; // копейки
  email: string; // для чека и письма с сертификатом
  recipientName?: string | null;
  recipientEmail?: string | null;
  senderName?: string | null;
  message?: string | null;
  sendAt?: Date | null;
}

export async function allowedAmount(amount: number) {
  const g = (await getSettings()).giftCards;
  const rubles = amount / 100;
  if (g.nominals.includes(rubles)) return true;
  return g.customMin > 0 && Number.isInteger(rubles) && rubles >= g.customMin && rubles <= g.customMax;
}

/** Чек продажи сертификата: полный расчёт, «иной предмет расчёта» (так решил бухгалтер). При оплате заказа сертификат — скидка. */
const certificateLine = (amount: number): ReceiptLine => ({
  name: `Подарочный сертификат Abramov Shop на ${rub(amount)}`,
  quantity: 1,
  price: amount,
  kind: "another",
  mode: "full_payment",
});

export async function buyGiftCard(user: UserRow, input: BuyInput, origin: string) {
  const settings = await getSettings();
  if (!settings.giftCards.enabled) throw new GiftError("Продажа сертификатов сейчас выключена");
  if (!(await allowedAmount(input.amount))) throw new GiftError("Выберите номинал сертификата");
  if (!yookassaEnabled()) throw new GiftError("Онлайн-оплата подключается — купить сертификат пока можно через поддержку");

  const card = await insertCard({
    status: "PENDING",
    source: "SITE",
    initialAmount: input.amount,
    balance: input.amount,
    buyerId: user.id,
    buyerEmail: input.email,
    recipientName: input.recipientName?.trim() || null,
    recipientEmail: input.recipientEmail?.trim().toLowerCase() || null,
    senderName: input.senderName?.trim() || null,
    message: input.message?.trim() || null,
    sendAt: input.sendAt ?? null,
    payExpiresAt: new Date(Date.now() + settings.checkout.paymentMinutes * 60_000),
  });
  try {
    const p = await createPaymentFor({
      key: `gift-${card.id}`,
      amount: card.initialAmount,
      returnUrl: `${origin}/gift/${card.token}?from=pay`,
      description: `Подарочный сертификат Abramov Shop на ${rub(card.initialAmount)}`,
      metadata: { shop: "abramov.shop", asGiftId: card.id },
      customer: { email: input.email },
      receipt: [certificateLine(card.initialAmount)],
    });
    await db
      .update(s.giftCard)
      .set({ paymentId: p.id, paymentStatus: "PENDING", confirmationUrl: p.confirmation!.confirmation_url! })
      .where(eq(s.giftCard.id, card.id));
    return { token: card.token, payUrl: p.confirmation!.confirmation_url! };
  } catch (e) {
    console.error("[gift] платёж не создан:", e);
    await db.update(s.giftCard).set({ status: "VOID" }).where(eq(s.giftCard.id, card.id));
    throw new GiftError("Платёжная система не ответила. Попробуйте ещё раз через минуту");
  }
}

/** Применить статус платежа за сертификат. */
export async function applyGiftPayment(p: YkPayment) {
  const card = await db.query.giftCard.findFirst({ where: eq(s.giftCard.paymentId, p.id) });
  if (!card || card.refundedAt) return null;
  if (p.status === "succeeded" && fromMoney(p.amount) >= card.initialAmount) {
    await activate(card.id);
  } else if (p.status === "canceled" && card.status === "PENDING") {
    await db.update(s.giftCard).set({ status: "VOID", paymentStatus: "CANCELED" }).where(and(eq(s.giftCard.id, card.id), eq(s.giftCard.status, "PENDING")));
  }
  return card.id;
}

export async function syncGiftPayment(cardId: string) {
  const card = await db.query.giftCard.findFirst({ where: eq(s.giftCard.id, cardId) });
  if (!card?.paymentId || card.paymentStatus === "SUCCEEDED" || !yookassaEnabled()) return;
  try {
    await applyGiftPayment(await getPayment(card.paymentId));
  } catch (e) {
    console.error("[gift] sync:", e);
  }
}

async function activate(cardId: string) {
  const settings = await getSettings();
  const days = settings.giftCards.validityDays;
  const now = new Date();
  const [card] = await db
    .update(s.giftCard)
    .set({
      status: "ACTIVE",
      paymentStatus: "SUCCEEDED",
      paidAt: now,
      expiresAt: days > 0 ? new Date(now.getTime() + days * 86400_000) : null,
    })
    // Оплата могла прийти и после автоотмены (VOID без возврата денег)
    .where(and(eq(s.giftCard.id, cardId), inArray(s.giftCard.status, ["PENDING", "VOID"]), isNull(s.giftCard.refundedAt), isNull(s.giftCard.paidAt)))
    .returning();
  if (!card) return;
  await auditSystem(null, "gift.paid", "gift", card.id, { amount: card.initialAmount });
  await mailBuyer(card).catch((e) => console.error("[gift] письмо покупателю:", e));
  if (card.recipientEmail && (!card.sendAt || card.sendAt <= now)) await mailRecipient(card).catch((e) => console.error("[gift] письмо получателю:", e));
}

// ---------- Выпуск в админке

export interface IssueInput {
  amount: number;
  expiresAt: Date | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  senderName?: string | null;
  message?: string | null;
  sendAt?: Date | null;
  note?: string | null;
}

export async function issueGiftCard(adminId: string, input: IssueInput) {
  const card = await insertCard({
    status: "ACTIVE",
    source: "ADMIN",
    initialAmount: input.amount,
    balance: input.amount,
    expiresAt: input.expiresAt,
    recipientName: input.recipientName?.trim() || null,
    recipientEmail: input.recipientEmail?.trim().toLowerCase() || null,
    senderName: input.senderName?.trim() || null,
    message: input.message?.trim() || null,
    sendAt: input.sendAt ?? null,
    note: input.note?.trim() || null,
    createdById: adminId,
  });
  if (card.recipientEmail && (!card.sendAt || card.sendAt <= new Date())) await mailRecipient(card).catch((e) => console.error("[gift] письмо получателю:", e));
  return card;
}

/** Аннулировать: сертификатом больше нельзя платить. Деньги не возвращаются. */
export async function voidGiftCard(cardId: string) {
  const r = await db.update(s.giftCard).set({ status: "VOID" }).where(and(eq(s.giftCard.id, cardId), inArray(s.giftCard.status, ["ACTIVE", "PENDING"]))).returning();
  if (!r.length) throw new GiftError("Сертификат уже недействителен");
}

/** Вернуть покупателю деньги за неизрасходованный остаток (сертификат, купленный на сайте). */
export async function refundGiftCard(cardId: string) {
  const card = await db.query.giftCard.findFirst({ where: eq(s.giftCard.id, cardId) });
  if (!card) throw new GiftError("Сертификат не найден");
  if (card.source !== "SITE" || !card.paymentId || !card.paidAt) throw new GiftError("Вернуть деньги можно только за сертификат, оплаченный на сайте");
  if (card.refundedAt) throw new GiftError("Деньги уже возвращены");
  const pending = await db
    .select({ id: s.order.id })
    .from(s.giftCardUse)
    .innerJoin(s.order, eq(s.order.id, s.giftCardUse.orderId))
    .where(and(eq(s.giftCardUse.giftCardId, card.id), isNull(s.giftCardUse.reversedAt), eq(s.order.status, "AWAITING_PAYMENT")))
    .limit(1);
  if (pending.length) throw new GiftError("Сертификатом оплачивают заказ, который ещё ждёт оплату. Дождитесь оплаты или отмены");
  // Блокируем сертификат до запроса в ЮKassa, чтобы им не успели заплатить
  const [locked] = await db
    .update(s.giftCard)
    .set({ status: "VOID" })
    .where(and(eq(s.giftCard.id, card.id), isNull(s.giftCard.refundedAt)))
    .returning();
  const amount = locked.balance;
  if (amount <= 0) throw new GiftError("На сертификате не осталось денег — возвращать нечего");
  try {
    const r = await createRefund({
      paymentId: card.paymentId,
      amount,
      orderId: card.id,
      customer: { email: card.buyerEmail ?? "" },
      receipt: [certificateLine(amount)],
      idempotenceKey: `gift-refund-${card.id}`,
    });
    if (r.status === "canceled") throw new GiftError("ЮKassa отклонила возврат. Проверьте баланс магазина в ЮKassa");
  } catch (e) {
    await db.update(s.giftCard).set({ status: card.status }).where(eq(s.giftCard.id, card.id));
    throw e;
  }
  await db.update(s.giftCard).set({ balance: 0, refundedAt: new Date(), paymentStatus: amount >= card.initialAmount ? "REFUNDED" : card.paymentStatus }).where(eq(s.giftCard.id, card.id));
  return amount;
}

// ---------- Письма

const giftBlock = (c: GiftCard) => `
  <div style="margin:20px 0;padding:24px;border:1px solid #c9a24a;border-radius:12px;text-align:center;background:#111;color:#f5f1e6">
    <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#c9a24a">Подарочный сертификат</div>
    <div style="font-size:36px;font-weight:700;margin:8px 0">${escHtml(rub(c.initialAmount))}</div>
    <div style="font-family:monospace;font-size:22px;letter-spacing:.08em;margin:12px 0">${escHtml(c.code)}</div>
    ${c.expiresAt ? `<div style="font-size:13px;color:#aaa">Действует до ${escHtml(fmtDate(c.expiresAt))}</div>` : ""}
  </div>`;

async function mailBuyer(c: GiftCard) {
  if (!c.buyerEmail) return;
  const forWhom = c.recipientEmail
    ? c.sendAt && c.sendAt > new Date()
      ? `<p>Получатель получит письмо с сертификатом ${escHtml(fmtDate(c.sendAt))}.</p>`
      : `<p>Мы отправили сертификат получателю на почту.</p>`
    : `<p>Перешлите ссылку на сертификат получателю или распечатайте его — на странице сертификата есть кнопка «Распечатать».</p>`;
  await sendMail(
    c.buyerEmail,
    `Подарочный сертификат на ${rub(c.initialAmount)} оплачен`,
    "Сертификат готов",
    `<p>Спасибо за покупку! Сертификат оплачен и уже действует.</p>${giftBlock(c)}${forWhom}<p>Чтобы оплатить заказ, добавьте товары в корзину и введите код при оформлении.</p>`,
    { text: "Открыть сертификат", url: giftUrl(c.token) },
  );
}

/** Письмо получателю. После отправки адрес в базе маскируется — он больше не нужен. */
export async function mailRecipient(c: GiftCard) {
  if (!c.recipientEmail || c.sentAt || c.status !== "ACTIVE") return;
  const from = c.senderName ? escHtml(c.senderName) : "Вам";
  const hello = c.recipientName ? `<p>${escHtml(c.recipientName)}, здравствуйте!</p>` : "";
  const msg = c.message ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #c9a24a;color:#555">${escHtml(c.message).replace(/\n/g, "<br>")}</blockquote>` : "";
  const ok = await sendMail(
    c.recipientEmail,
    `${c.senderName ? `${c.senderName} дарит вам` : "Вам подарили"} сертификат Abramov Shop на ${rub(c.initialAmount)}`,
    "Вам подарок!",
    `${hello}<p>${from} ${c.senderName ? "дарит" : "подарили"} подарочный сертификат магазина Abramov Shop — всё для бильярда.</p>${msg}${giftBlock(c)}<p>Выберите товары на сайте, а при оформлении заказа введите код сертификата.</p>`,
    { text: "Открыть сертификат", url: giftUrl(c.token) },
  );
  if (ok) await db.update(s.giftCard).set({ sentAt: new Date(), recipientEmail: maskEmail(c.recipientEmail) }).where(eq(s.giftCard.id, c.id));
}

/** Повторно отправить письмо покупателю (из админки). */
export async function resendBuyer(cardId: string) {
  const c = await db.query.giftCard.findFirst({ where: eq(s.giftCard.id, cardId) });
  if (!c || c.status !== "ACTIVE") throw new GiftError("Сертификат не активен");
  if (!c.buyerEmail) throw new GiftError("У сертификата нет почты покупателя");
  await mailBuyer(c);
}

// ---------- Фоновые задачи

/** Неоплаченные: проверить в ЮKassa, просроченные — аннулировать. Отложенные письма получателям. */
export async function giftJobs() {
  const now = new Date();
  if (yookassaEnabled()) {
    const pending = await db
      .select({ id: s.giftCard.id, payExpiresAt: s.giftCard.payExpiresAt })
      .from(s.giftCard)
      .where(and(eq(s.giftCard.status, "PENDING"), isNotNull(s.giftCard.paymentId), gte(s.giftCard.createdAt, new Date(now.getTime() - 2 * 86400_000))))
      .orderBy(asc(s.giftCard.createdAt))
      .limit(50);
    for (const p of pending) await syncGiftPayment(p.id);
  }
  await db
    .update(s.giftCard)
    .set({ status: "VOID", paymentStatus: "CANCELED" })
    .where(and(eq(s.giftCard.status, "PENDING"), lt(s.giftCard.payExpiresAt, new Date(now.getTime() - 10 * 60_000))));

  const due = await db.query.giftCard.findMany({
    where: and(eq(s.giftCard.status, "ACTIVE"), isNotNull(s.giftCard.recipientEmail), isNull(s.giftCard.sentAt), lte(s.giftCard.sendAt, now)),
    limit: 50,
  });
  for (const c of due) await mailRecipient(c).catch((e) => console.error("[gift] письмо получателю:", e));
}
