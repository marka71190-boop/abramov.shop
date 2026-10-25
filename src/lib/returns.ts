/**
 * Возвраты и обмены по заявке из личного кабинета.
 *
 * Сроки (Закон о защите прав потребителей, ст. 18 и 26.1; правила возврата на сайте):
 *   • товар надлежащего качества (не подошёл) — 7 дней с получения, только возврат денег;
 *   • брак, повреждение, пересорт — 2 года с получения: возврат денег, обмен или скидка;
 *   • заявку рассматриваем в течение 7 дней, деньги возвращаем в течение 10 дней.
 *
 * Деньги за часть заказа считаются пропорционально: сколько покупатель реально заплатил
 * за эти товары после скидки и бонусов. Бонусы, которыми оплатили эту часть, возвращаются
 * на счёт, а начисленные за неё — списываются.
 */
import "server-only";
import { and, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDate, num, rub } from "@/lib/format";
import { returnToGift, splitGift } from "@/lib/giftcards";
import { escHtml, sendMail } from "@/lib/mail";
import { isPlaceholderEmail, SELLER, SITE } from "@/lib/site";
import { esc as tgEsc, notifyAdmins, notifyUser } from "@/lib/telegram";
import { createRefund, receiptLines, yookassaEnabled } from "@/lib/yookassa";

export const QUALITY_DAYS = 7;
export const DEFECT_DAYS = 730;
export const DECISION_DAYS = 7;
/** Сколько дней у мастера на проверку после получения товара (деньги — в течение 10 дней по закону) */
export const INSPECTION_DAYS = 10;

export class ReturnError extends Error {}

export const RETURN_STATUS = {
  NEW: { text: "На рассмотрении", tone: "gold" },
  APPROVED: { text: "Одобрена — ждём товар", tone: "gold" },
  RECEIVED: { text: "Товар получен — на проверке у мастера", tone: "gold" },
  COMPLETED: { text: "Завершена", tone: "ok" },
  REJECTED: { text: "Отклонена", tone: "bad" },
  CANCELLED: { text: "Отменена", tone: "dim" },
} as const;

export const RETURN_KIND = { QUALITY: "Не подошёл", DEFECT: "Брак, повреждение или не тот товар" } as const;
export const RETURN_RESOLUTION = { REFUND: "Вернуть деньги", EXCHANGE: "Обменять на такой же", DISCOUNT: "Скидка (оставлю товар)" } as const;
export const QUALITY_REASONS = ["Не подошёл размер или модель", "Не понравился", "Передумал", "Другое"];
export const DEFECT_REASONS = ["Брак", "Повреждён при доставке", "Прислали не тот товар", "Некомплект", "Другое"];

const OPEN: (typeof s.returnStatusEnum.enumValues)[number][] = ["NEW", "APPROVED", "RECEIVED", "COMPLETED"];

function returnNumber() {
  const msk = new Date(Date.now() + 3 * 3600_000);
  const day = msk.toISOString().slice(2, 10).replace(/-/g, "");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join("");
  return `RT-${day}-${tail}`;
}

const daysSince = (d: Date) => (Date.now() - d.getTime()) / 86400_000;

/** Что можно вернуть по заказу: по каждой позиции — сколько ещё не заявлено. */
export async function returnable(orderId: string) {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { items: true } });
  if (!o) return null;
  const claimed = await db
    .select({ orderItemId: s.returnItem.orderItemId, qty: sql<number>`sum(${s.returnItem.quantity})::int` })
    .from(s.returnItem)
    .innerJoin(s.returnRequest, eq(s.returnRequest.id, s.returnItem.requestId))
    .where(and(eq(s.returnRequest.orderId, orderId), inArray(s.returnRequest.status, OPEN)))
    .groupBy(s.returnItem.orderItemId);
  const used = new Map(claimed.map((c) => [c.orderItemId, Number(c.qty)]));
  const items = o.items.map((i) => ({ ...i, available: Math.max(0, i.quantity - (used.get(i.id) ?? 0)) }));
  const deliveredAt = o.deliveredAt ?? (o.status === "DELIVERED" ? o.updatedAt : null);
  const age = deliveredAt ? daysSince(deliveredAt) : null;
  return {
    order: o,
    items,
    deliveredAt,
    // Заявку можно подать только по полученному заказу
    allowed: o.status === "DELIVERED" && age !== null && items.some((i) => i.available > 0),
    qualityAllowed: age !== null && age <= QUALITY_DAYS,
    defectAllowed: age !== null && age <= DEFECT_DAYS,
    qualityUntil: deliveredAt ? new Date(deliveredAt.getTime() + QUALITY_DAYS * 86400_000) : null,
  };
}

export interface ReturnInput {
  orderNumber: string;
  kind: "QUALITY" | "DEFECT";
  resolution: "REFUND" | "EXCHANGE" | "DISCOUNT";
  reason: string;
  comment: string;
  photos: string[];
  items: { orderItemId: string; quantity: number }[];
}

export async function createReturn(userId: string, input: ReturnInput) {
  const o = await db.query.order.findFirst({ where: and(eq(s.order.number, input.orderNumber), eq(s.order.userId, userId)) });
  if (!o) throw new ReturnError("Заказ не найден");
  const info = await returnable(o.id);
  if (!info || !info.allowed) throw new ReturnError("Возврат можно оформить по полученному заказу");
  if (input.kind === "QUALITY" && !info.qualityAllowed)
    throw new ReturnError(
      `Вернуть товар, который не подошёл, можно в течение ${QUALITY_DAYS} дней после получения. Если у товара брак или повреждение — выберите «Брак, повреждение или не тот товар».`,
    );
  if (input.kind === "DEFECT" && !info.defectAllowed) throw new ReturnError("Срок для претензий по качеству (2 года) истёк — напишите в поддержку");
  if (input.kind === "DEFECT" && !input.photos.length) throw new ReturnError("Приложите хотя бы одно фото недостатка — так мы решим быстрее");
  const resolution = input.kind === "QUALITY" ? "REFUND" : input.resolution;

  // Одна позиция могла прийти в списке несколько раз — складываем, иначе каждая строка
  // по отдельности проходила бы проверку остатка и вернуть можно было бы больше, чем куплено
  const qty = new Map<string, number>();
  for (const i of input.items) if (i.quantity > 0) qty.set(i.orderItemId, (qty.get(i.orderItemId) ?? 0) + i.quantity);
  const lines = [...qty].map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  if (!lines.length) throw new ReturnError("Отметьте, что возвращаете");
  for (const l of lines) {
    const it = info.items.find((i) => i.id === l.orderItemId);
    if (!it) throw new ReturnError("Товар не из этого заказа");
    if (l.quantity > it.available) throw new ReturnError(`«${it.name}»: можно вернуть не больше ${it.available} шт.`);
  }

  const req = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(s.returnRequest)
      .values({
        number: returnNumber(),
        orderId: o.id,
        userId,
        kind: input.kind,
        resolution,
        reason: input.reason,
        comment: input.comment,
        photos: input.photos,
        decisionDue: new Date(Date.now() + DECISION_DAYS * 86400_000),
      })
      .returning();
    await tx.insert(s.returnItem).values(lines.map((l) => ({ requestId: r.id, orderItemId: l.orderItemId, quantity: l.quantity })));
    return r;
  });

  void notifyAdmins(
    `↩️ Новая заявка на ${input.kind === "DEFECT" ? "брак / обмен" : "возврат"} <b>${req.number}</b> по заказу ${tgEsc(o.number)}. Ответить до ${fmtDate(req.decisionDue)}.`,
    { text: "Открыть заявку", url: `${SITE.url}/admin/returns/${req.id}` },
  );
  void notifyReturn(req.id, "created");
  return req;
}

export async function cancelReturn(userId: string, number: string) {
  const [r] = await db
    .update(s.returnRequest)
    .set({ status: "CANCELLED", updatedAt: new Date(), resolvedAt: new Date() })
    .where(and(eq(s.returnRequest.number, number), eq(s.returnRequest.userId, userId), eq(s.returnRequest.status, "NEW")))
    .returning();
  if (!r) throw new ReturnError("Отменить можно только заявку на рассмотрении");
  void notifyAdmins(`Покупатель отменил заявку ${r.number}.`);
}

// ---------- Решения магазина

async function load(id: string) {
  const r = await db.query.returnRequest.findFirst({
    where: eq(s.returnRequest.id, id),
    with: { items: { with: { orderItem: true } }, order: { with: { items: true, payments: true } } },
  });
  if (!r) throw new ReturnError("Заявка не найдена");
  return r;
}

async function setStatus(id: string, from: string[], patch: Partial<typeof s.returnRequest.$inferInsert>) {
  const [r] = await db
    .update(s.returnRequest)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(s.returnRequest.id, id), inArray(s.returnRequest.status, from as never)))
    .returning();
  if (!r) throw new ReturnError("Статус заявки уже изменился — обновите страницу");
  return r;
}

export function defaultInstructions(r: { kind: string; resolution: string; number: string }) {
  if (r.kind === "DEFECT" && r.resolution === "DISCOUNT")
    return `Согласны на скидку за недостаток — товар оставьте себе. Вернём часть стоимости на карту или счёт, с которых оплачивали, в течение 10 дней.`;
  const ship =
    `Отправьте товар через СДЭК на адрес: ${SELLER.actualAddress}, получатель — ${SELLER.name}. ` + `В описании посылки укажите номер заявки ${r.number}. `;
  if (r.kind === "DEFECT")
    return (
      ship +
      "Доставку оплачиваем мы — напишите нам, и мы пришлём код для бесплатной отправки. " +
      (r.resolution === "EXCHANGE"
        ? "Как только посылка придёт и мы проверим товар, отправим вам замену."
        : "Как только посылка придёт и мы проверим товар, вернём деньги в течение 10 дней.")
    );
  return ship + "Доставку до нас оплачивает покупатель. Товар должен быть без следов использования, в упаковке. Как только посылка придёт, проверим товар и вернём деньги в течение 10 дней.";
}

export async function approveReturn(id: string, actorId: string, answer: string) {
  const r = await setStatus(id, ["NEW"], { status: "APPROVED", answer: answer.trim(), handledById: actorId });
  void notifyReturn(r.id, "approved");
  return r;
}

export async function rejectReturn(id: string, actorId: string, answer: string) {
  if (answer.trim().length < 10) throw new ReturnError("Напишите причину отказа — её увидит покупатель");
  const r = await setStatus(id, ["NEW", "APPROVED", "RECEIVED"], { status: "REJECTED", answer: answer.trim(), handledById: actorId, resolvedAt: new Date() });
  void notifyReturn(r.id, "rejected");
  return r;
}

export async function receiveReturn(id: string, actorId: string, restock: boolean) {
  const cur = await load(id);
  const r = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(s.returnRequest)
      .set({
        status: "RECEIVED",
        handledById: actorId,
        restocked: restock,
        receivedAt: new Date(),
        inspectionDue: new Date(Date.now() + INSPECTION_DAYS * 86400_000),
        updatedAt: new Date(),
      })
      .where(and(eq(s.returnRequest.id, id), eq(s.returnRequest.status, "APPROVED")))
      .returning();
    if (!row) throw new ReturnError("Статус заявки уже изменился — обновите страницу");
    if (restock) await restockItems(tx, cur.items);
    return row;
  });
  void notifyReturn(r.id, "received");
  return r;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function restockItems(tx: Tx, items: { quantity: number; orderItem: { variantId: string | null } }[]) {
  for (const i of items) {
    if (i.orderItem.variantId)
      await tx
        .update(s.productVariant)
        .set({ stock: sql`${s.productVariant.stock} + ${i.quantity}` })
        .where(eq(s.productVariant.id, i.orderItem.variantId));
  }
}

/** Сколько заплачено деньгами и бонусами за товары заявки — подсказка для суммы возврата. */
export function refundEstimate(r: Awaited<ReturnType<typeof load>>) {
  const o = r.order;
  const subtotal = o.items.reduce((a, i) => a + i.price * i.quantity, 0) || 1;
  const value = r.items.reduce((a, i) => a + i.orderItem.price * i.quantity, 0);
  const share = Math.min(1, value / subtotal);
  const pay = o.payments.find((p) => p.status === "SUCCEEDED" || p.status === "REFUNDED");
  const left = pay ? pay.amount - pay.refundedAmount : 0;
  // Часть, оплаченная подарочным сертификатом, возвращается на сертификат, а не деньгами
  const split = splitGift(o);
  return {
    value,
    money: Math.min(Math.round(split.cashGoods * share), pay ? left : Infinity),
    giftBack: r.resolution === "REFUND" ? Math.round(split.certGoods * share) : 0,
    left,
    bonusBack: Math.floor((o.bonusSpent * share) / 100),
    accruedBack: o.bonusCredited ? Math.floor((o.bonusAccrued * share) / 100) : 0,
    hasPayment: !!pay,
  };
}

export async function loadForAdmin(id: string) {
  const r = await load(id);
  return { r, estimate: refundEstimate(r) };
}

/**
 * Возврат денег по заявке (часть заказа). amount — копейки, может отличаться от подсказки
 * (например, скидка за брак). restock — вернуть товар на склад, если ещё не вернули.
 */
export async function refundReturn(id: string, actorId: string, opts: { amount: number; restock: boolean; returnBonuses: boolean; answer?: string }) {
  const r = await load(id);
  if (!["APPROVED", "RECEIVED"].includes(r.status)) throw new ReturnError("Деньги возвращаются по одобренной заявке");
  const est = refundEstimate(r);
  const o = r.order;
  const pay = o.payments.find((p) => p.status === "SUCCEEDED" || p.status === "REFUNDED");
  const amount = Math.round(opts.amount);
  if (amount < 0) throw new ReturnError("Сумма не может быть отрицательной");
  if (pay && amount > est.left) throw new ReturnError(`По заказу можно вернуть не больше ${rub(est.left)}`);
  if (!pay && yookassaEnabled() && amount > 0) throw new ReturnError("Не найден успешный платёж по заказу");

  if (pay && amount > 0) {
    const lines = receiptLines(
      r.items.map((i) => ({ name: i.orderItem.name, price: i.orderItem.price, quantity: i.quantity })),
      amount,
      0,
    );
    const res = await createRefund({
      paymentId: pay.externalId,
      amount,
      orderId: o.id,
      customer: { email: o.email, phone: o.phone },
      receipt: lines,
      idempotenceKey: `refund-${r.id}`,
    });
    if (res.status === "canceled") throw new ReturnError("ЮKassa отклонила возврат. Проверьте баланс магазина в ЮKassa");
  }

  const bonusBack = opts.returnBonuses ? est.bonusBack : 0;
  const accruedBack = opts.returnBonuses ? est.accruedBack : 0;
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(s.returnRequest)
      .set({
        status: "COMPLETED",
        refundAmount: amount,
        bonusReturned: bonusBack,
        restocked: r.restocked || opts.restock,
        answer: opts.answer?.trim() || r.answer,
        handledById: actorId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(s.returnRequest.id, r.id), inArray(s.returnRequest.status, ["APPROVED", "RECEIVED"])))
      .returning();
    if (!row) throw new ReturnError("Статус заявки уже изменился — обновите страницу");
    if (opts.restock && !r.restocked) await restockItems(tx, r.items);
    const giftBack = await returnToGift(tx, o.id, est.giftBack);
    if (pay && amount > 0) {
      const refunded = pay.refundedAmount + amount;
      await tx
        .update(s.payment)
        .set({ refundedAmount: refunded, status: refunded >= pay.amount ? "REFUNDED" : pay.status })
        .where(eq(s.payment.id, pay.id));
    }
    if (o.userId) {
      if (bonusBack > 0)
        await tx.insert(s.bonusTransaction).values({ userId: o.userId, amount: bonusBack, reason: "REFUND", orderId: o.id, comment: `Возврат бонусов по заявке ${r.number}` });
      if (accruedBack > 0)
        await tx.insert(s.bonusTransaction).values({ userId: o.userId, amount: -accruedBack, reason: "REFUND", orderId: o.id, comment: `Списание бонусов за возвращённый товар (${r.number})` });
      await tx
        .update(s.user)
        .set({
          bonusBalance: sql`greatest(${s.user.bonusBalance} + ${bonusBack - accruedBack}, 0)`,
          totalSpent: sql`greatest(${s.user.totalSpent} - ${o.bonusCredited ? amount : 0}, 0)`,
        })
        .where(eq(s.user.id, o.userId));
    }
    // Вернули всё, что было в заказе, и все деньги — заказ «Возврат»
    const all = await tx
      .select({ qty: sql<number>`coalesce(sum(${s.returnItem.quantity}), 0)::int` })
      .from(s.returnItem)
      .innerJoin(s.returnRequest, eq(s.returnRequest.id, s.returnItem.requestId))
      .where(and(eq(s.returnRequest.orderId, o.id), eq(s.returnRequest.status, "COMPLETED")));
    const totalQty = o.items.reduce((a, i) => a + i.quantity, 0);
    if (Number(all[0]?.qty ?? 0) >= totalQty && (!pay || pay.refundedAmount + amount >= pay.amount - o.shippingCost)) {
      await tx.update(s.order).set({ status: "REFUNDED", cancelReason: `Возврат по заявке ${r.number}` }).where(eq(s.order.id, o.id));
    }
    await tx.insert(s.auditLog).values({ actorId, action: "return.refund", entity: "return_request", entityId: r.id, details: { amount, giftBack, bonusBack, accruedBack, restock: opts.restock } });
    return row;
  });
  void notifyReturn(done.id, "refunded");
  return done;
}

/** Завершить без денег: обмен отправлен, вопрос решён иначе. */
export async function completeReturn(id: string, actorId: string, answer: string, restock: boolean) {
  const cur = await load(id);
  const r = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(s.returnRequest)
      .set({ status: "COMPLETED", answer: answer.trim() || cur.answer, handledById: actorId, resolvedAt: new Date(), updatedAt: new Date(), restocked: cur.restocked || restock })
      .where(and(eq(s.returnRequest.id, id), inArray(s.returnRequest.status, ["APPROVED", "RECEIVED"])))
      .returning();
    if (!row) throw new ReturnError("Статус заявки уже изменился — обновите страницу");
    if (restock && !cur.restocked) await restockItems(tx, cur.items);
    return row;
  });
  void notifyReturn(r.id, "completed");
  return r;
}

// ---------- Уведомления покупателю

type ReturnEvent = "created" | "approved" | "rejected" | "received" | "refunded" | "completed";

export async function notifyReturn(id: string, event: ReturnEvent) {
  try {
    const r = await db.query.returnRequest.findFirst({ where: eq(s.returnRequest.id, id), with: { order: true } });
    if (!r) return;
    const link = `${SITE.url}/account#returns`;
    const text: Record<ReturnEvent, { title: string; body: string }> = {
      created: {
        title: "Заявка принята",
        body: `Заявка <b>${r.number}</b> по заказу ${escHtml(r.order.number)} принята. Рассмотрим её до ${fmtDate(r.decisionDue)} и напишем решение.`,
      },
      approved: {
        title: "Заявка одобрена",
        body: `Заявка <b>${r.number}</b> одобрена.${r.answer ? `<br><br>${escHtml(r.answer).replace(/\n/g, "<br>")}` : ""}`,
      },
      rejected: {
        title: "Заявка отклонена",
        body: `К сожалению, по заявке <b>${r.number}</b> мы отказали.${r.answer ? `<br><br>Причина: ${escHtml(r.answer).replace(/\n/g, "<br>")}` : ""}${r.conclusion ? `<br><br>Заключение мастера: ${escHtml(r.conclusion).replace(/\n/g, "<br>")}` : ""}<br><br>Фото проверки — в личном кабинете. Если не согласны — ответьте на это письмо или напишите в поддержку.`,
      },
      received: {
        title: "Товар получен",
        body: `Получили товар по заявке <b>${r.number}</b>. Мастер проверит его${r.inspectionDue ? ` до ${fmtDate(r.inspectionDue)}` : ""} — сообщим решение и, если всё в порядке, сразу вернём деньги.`,
      },
      refunded: {
        title: "Деньги возвращены",
        body:
          `По заявке <b>${r.number}</b> вернули ${rub(r.refundAmount ?? 0)} на карту или счёт, с которых оплачивали. Зачисление обычно занимает 1–3 рабочих дня.` +
          (r.bonusReturned ? `<br>На бонусный счёт вернули ${num(r.bonusReturned)} бонусов.` : ""),
      },
      completed: { title: "Заявка выполнена", body: `Заявка <b>${r.number}</b> выполнена.${r.answer ? `<br><br>${escHtml(r.answer).replace(/\n/g, "<br>")}` : ""}` },
    };
    const t = text[event];
    if (!isPlaceholderEmail(r.order.email)) {
      await sendMail(r.order.email, `${t.title} — ${r.number}`, t.title, t.body, { text: "Мои заявки", url: link }).catch((e) =>
        console.error("[mail] return:", e instanceof Error ? e.message : e),
      );
    }
    // В Telegram — без подробностей и личных данных: только номер и статус
    if (r.userId) await notifyUser(r.userId, `↩️ ${t.title}: заявка <b>${r.number}</b>.`, { text: "Открыть", url: link });
  } catch (e) {
    console.error("[returns] notify:", e instanceof Error ? e.message : e);
  }
}

/** Заключение мастера после проверки товара — покупатель увидит его в кабинете. */
export async function saveConclusion(id: string, actorId: string, conclusion: string) {
  const [r] = await db
    .update(s.returnRequest)
    .set({ conclusion: conclusion.trim() || null, handledById: actorId, updatedAt: new Date() })
    .where(and(eq(s.returnRequest.id, id), inArray(s.returnRequest.status, ["RECEIVED", "APPROVED"])))
    .returning();
  if (!r) throw new ReturnError("Заключение можно записать, пока заявка в работе");
  return r;
}

/** Раз в час: напоминаем админам о заявках, срок ответа по которым истекает в ближайшие сутки. */
export async function remindReturnDeadlines() {
  // Проверка мастером: напоминаем за 2 дня до конца срока
  const inspecting = await db
    .select()
    .from(s.returnRequest)
    .where(
      and(
        eq(s.returnRequest.status, "RECEIVED"),
        lt(s.returnRequest.inspectionDue, new Date(Date.now() + 2 * 86400_000)),
        isNull(s.returnRequest.inspectionReminderAt),
      ),
    );
  for (const r of inspecting) {
    await notifyAdmins(`🔧 Заявка <b>${r.number}</b>: проверку мастером нужно закончить до ${r.inspectionDue ? fmtDate(r.inspectionDue) : "—"} и вернуть деньги или отказать.`, {
      text: "Открыть заявку",
      url: `${SITE.url}/admin/returns/${r.id}`,
    });
    await db.update(s.returnRequest).set({ inspectionReminderAt: new Date() }).where(eq(s.returnRequest.id, r.id));
  }
  const soon = await db
    .select()
    .from(s.returnRequest)
    .where(and(eq(s.returnRequest.status, "NEW"), lt(s.returnRequest.decisionDue, new Date(Date.now() + 86400_000)), isNull(s.returnRequest.dueReminderAt)));
  for (const r of soon) {
    await notifyAdmins(`⏰ Заявка <b>${r.number}</b> ждёт решения — срок до ${fmtDate(r.decisionDue)}.`, {
      text: "Открыть заявку",
      url: `${SITE.url}/admin/returns/${r.id}`,
    });
    await db.update(s.returnRequest).set({ dueReminderAt: new Date() }).where(eq(s.returnRequest.id, r.id));
  }
}

/** Заявки покупателя (для кабинета) или по заказу. */
export async function listReturns(where: { userId?: string; orderId?: string }) {
  const rows = await db.query.returnRequest.findMany({
    where: where.orderId ? eq(s.returnRequest.orderId, where.orderId) : eq(s.returnRequest.userId, where.userId!),
    orderBy: (r, { desc }) => desc(r.createdAt),
    limit: 30,
    with: { items: { with: { orderItem: { columns: { name: true, price: true } } } }, order: { columns: { number: true } } },
  });
  // Фото и видео проверки товара по заявке (с Google Диска)
  const media = rows.length
    ? await db.query.inspectionMedia.findMany({ where: inArray(s.inspectionMedia.returnId, rows.map((r) => r.id)), orderBy: (m, { asc }) => asc(m.createdAt) })
    : [];
  return rows.map((r) => ({ ...r, media: media.filter((m) => m.returnId === r.id) }));
}
export type ReturnListItem = Awaited<ReturnType<typeof listReturns>>[number];

export async function openReturnsCount() {
  return db.$count(s.returnRequest, notInArray(s.returnRequest.status, ["COMPLETED", "REJECTED", "CANCELLED"]));
}
