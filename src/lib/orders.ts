/**
 * Жизненный цикл заказа.
 *
 *   оформление → AWAITING_PAYMENT (товар и бонусы зарезервированы)
 *     ├─ оплата прошла → PAID → ASSEMBLING → SHIPPED → DELIVERED (начисляем бонусы)
 *     └─ не оплачен вовремя / оплата отменена → CANCELLED (резерв возвращается)
 *   возврат денег → REFUNDED
 */
import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { auditSystem } from "@/lib/audit";
import { cdekEnabled, CDEK_IN_TRANSIT, createShipment, getShipment, parcelFor } from "@/lib/cdek";
import { tierProgress } from "@/lib/loyalty";
import { computeQuote, type Quote, type QuoteInput } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import type { UserRow } from "@/lib/viewer";
import {
  createPayment,
  createRefund,
  fromMoney,
  getPayment,
  receiptLines,
  yookassaEnabled,
  type YkPayment,
} from "@/lib/yookassa";

/** Ошибка, текст которой можно показать покупателю. */
export class OrderError extends Error {
  constructor(
    message: string,
    public quote?: Quote,
  ) {
    super(message);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderRow = typeof s.order.$inferSelect;

function orderNumber() {
  const msk = new Date(Date.now() + 3 * 3600_000);
  const day = msk.toISOString().slice(2, 10).replace(/-/g, "");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => abc[b % abc.length]).join("");
  return `AS-${day}-${tail}`;
}

const PAYMENT_STATUS = {
  pending: "PENDING",
  waiting_for_capture: "WAITING_FOR_CAPTURE",
  succeeded: "SUCCEEDED",
  canceled: "CANCELED",
} as const;

async function lockOrder(tx: Tx, id: string): Promise<OrderRow | undefined> {
  const [o] = await tx.select().from(s.order).where(eq(s.order.id, id)).for("update");
  return o;
}

// ============================================================
// Оформление
// ============================================================

export interface PlaceInput extends QuoteInput {
  name: string;
  phone: string; // уже +7XXXXXXXXXX
  email: string;
  comment?: string | null;
  referralCode?: string | null;
  expectedTotal: number;
}

export async function placeOrder(user: UserRow, input: PlaceInput, origin: string) {
  const settings = await getSettings();
  const quote = await computeQuote(input, user);
  const d = input.delivery;

  if (!quote.lines.length) throw new OrderError("Корзина пуста", quote);
  if (quote.removed.length || quote.adjusted.length) throw new OrderError("Корзина изменилась — проверьте товары и количество", quote);
  if (input.promoCode?.trim() && quote.promoError) throw new OrderError(quote.promoError, quote);
  if (!d) throw new OrderError("Выберите способ доставки", quote);
  if (quote.shippingError || !quote.shipping) throw new OrderError(quote.shippingError ?? "Не удалось рассчитать доставку", quote);
  if (cdekEnabled() && !d.cityCode) throw new OrderError("Выберите город доставки", quote);
  if (d.type === "PVZ" && !d.pvzCode && cdekEnabled()) throw new OrderError("Выберите пункт выдачи СДЭК", quote);
  if (d.type === "COURIER" && !d.address?.trim()) throw new OrderError("Укажите адрес для курьера", quote);
  if (!cdekEnabled() && !d.cityName?.trim()) throw new OrderError("Укажите город", quote);
  if (quote.total !== input.expectedTotal) throw new OrderError("Сумма заказа изменилась — проверьте итог и подтвердите ещё раз", quote);

  const expiresAt = new Date(Date.now() + settings.checkout.paymentMinutes * 60_000);
  const address = d.type === "PVZ" ? (d.pvzAddress ?? null) : (d.address?.trim() ?? null);

  const order = await db.transaction(async (tx) => {
    // 1. Резервируем товар: остаток не может уйти в минус
    for (const l of quote.lines) {
      const r = await tx
        .update(s.productVariant)
        .set({ stock: sql`${s.productVariant.stock} - ${l.qty}` })
        .where(and(eq(s.productVariant.id, l.variantId), gte(s.productVariant.stock, l.qty)))
        .returning({ id: s.productVariant.id });
      if (!r.length) throw new OrderError(`«${l.name}» осталось меньше, чем в корзине. Обновите страницу`);
    }

    // 2. Промокод: лимит использований проверяем атомарно
    let promoId: string | null = null;
    if (quote.promo) {
      const r = await tx
        .update(s.promoCode)
        .set({ usedCount: sql`${s.promoCode.usedCount} + 1` })
        .where(
          and(
            eq(s.promoCode.code, quote.promo.code),
            eq(s.promoCode.isActive, true),
            or(isNull(s.promoCode.maxUses), lt(s.promoCode.usedCount, s.promoCode.maxUses)),
          ),
        )
        .returning({ id: s.promoCode.id });
      if (!r.length) throw new OrderError("Промокод больше не действует");
      promoId = r[0].id;
    }

    // 3. Бонусы
    const spentBonus = quote.bonus.spent / 100;
    if (spentBonus > 0) {
      const r = await tx
        .update(s.user)
        .set({ bonusBalance: sql`${s.user.bonusBalance} - ${spentBonus}` })
        .where(and(eq(s.user.id, user.id), gte(s.user.bonusBalance, spentBonus)))
        .returning({ id: s.user.id });
      if (!r.length) throw new OrderError("Бонусов на счёте меньше, чем нужно. Обновите страницу");
    }

    // 4. Код друга — только к первому заказу и если ещё не указан
    const code = input.referralCode?.trim().toUpperCase();
    if (code && !user.referredById && code !== user.referralCode) {
      const friend = await tx.query.user.findFirst({ where: eq(s.user.referralCode, code), columns: { id: true } });
      const before = await tx.$count(s.order, eq(s.order.userId, user.id));
      if (friend && friend.id !== user.id && before === 0) {
        await tx.update(s.user).set({ referredById: friend.id }).where(eq(s.user.id, user.id));
      }
    }
    if (!user.phone) await tx.update(s.user).set({ phone: input.phone }).where(eq(s.user.id, user.id));

    // 5. Заказ
    const [o] = await tx
      .insert(s.order)
      .values({
        number: orderNumber(),
        userId: user.id,
        status: "AWAITING_PAYMENT",
        customerName: input.name,
        phone: input.phone,
        email: input.email,
        comment: input.comment?.trim() || null,
        subtotal: quote.subtotal,
        discount: quote.discount,
        bonusSpent: quote.bonus.spent,
        shippingCost: quote.shipping!.cost,
        total: quote.total,
        bonusAccrued: quote.accrue,
        promoCodeId: promoId,
        deliveryType: d.type,
        city: d.cityName?.trim() || null,
        cdekCityCode: d.cityCode ?? null,
        postalCode: d.postalCode ?? null,
        address,
        cdekPvzCode: d.type === "PVZ" ? (d.pvzCode ?? null) : null,
        deliveryTariff: quote.shipping!.tariff,
        deliveryDays: quote.shipping!.days,
        expiresAt,
      })
      .returning();

    await tx.insert(s.orderItem).values(
      quote.lines.map((l) => ({
        orderId: o.id,
        productId: l.productId,
        variantId: l.variantId,
        name: l.variantName ? `${l.name} · ${l.variantName}` : l.name,
        price: l.price,
        quantity: l.qty,
      })),
    );
    if (promoId) await tx.insert(s.promoUsage).values({ promoId, userId: user.id, orderId: o.id });
    if (spentBonus > 0) {
      await tx.insert(s.bonusTransaction).values({
        userId: user.id,
        amount: -spentBonus,
        reason: "ORDER_SPEND",
        orderId: o.id,
        comment: `Оплата заказа ${o.number}`,
      });
    }
    return o;
  });

  // 6. Платёж
  if (!yookassaEnabled()) return { number: order.number, payUrl: `/order/${order.number}` };
  try {
    const items = quote.lines.map((l) => ({ name: l.variantName ? `${l.name}, ${l.variantName}` : l.name, price: l.price, quantity: l.qty }));
    const p = await createPayment({
      orderId: order.id,
      number: order.number,
      amount: order.total,
      returnUrl: `${origin}/order/${order.number}?from=pay`,
      customer: { email: order.email, phone: order.phone },
      receipt: receiptLines(items, order.total - order.shippingCost, order.shippingCost),
    });
    await db.insert(s.payment).values({
      orderId: order.id,
      externalId: p.id,
      status: PAYMENT_STATUS[p.status],
      amount: order.total,
      confirmationUrl: p.confirmation!.confirmation_url!,
      raw: p,
    });
    return { number: order.number, payUrl: p.confirmation!.confirmation_url! };
  } catch (e) {
    console.error(`[orders] Платёж для ${order.number} не создан:`, e);
    await cancelOrder(order.id, "Платёжная система не ответила", null);
    throw new OrderError("Платёжная система не ответила. Попробуйте ещё раз через минуту — товар снова в корзине");
  }
}

// ============================================================
// Оплата
// ============================================================

/** Возвращает резерв: товар на склад, бонусы на счёт, промокод — снова доступен. */
async function release(tx: Tx, o: OrderRow, restock: boolean) {
  if (restock) {
    const items = await tx.select().from(s.orderItem).where(eq(s.orderItem.orderId, o.id));
    for (const i of items) {
      if (!i.variantId) continue;
      await tx
        .update(s.productVariant)
        .set({ stock: sql`${s.productVariant.stock} + ${i.quantity}` })
        .where(eq(s.productVariant.id, i.variantId));
    }
  }
  if (o.bonusSpent > 0 && o.userId) {
    const n = o.bonusSpent / 100;
    await tx.update(s.user).set({ bonusBalance: sql`${s.user.bonusBalance} + ${n}` }).where(eq(s.user.id, o.userId));
    await tx.insert(s.bonusTransaction).values({ userId: o.userId, amount: n, reason: "REFUND", orderId: o.id, comment: `Возврат бонусов за заказ ${o.number}` });
  }
  if (o.promoCodeId) {
    await tx
      .update(s.promoCode)
      .set({ usedCount: sql`greatest(${s.promoCode.usedCount} - 1, 0)` })
      .where(eq(s.promoCode.id, o.promoCodeId));
    await tx.delete(s.promoUsage).where(eq(s.promoUsage.orderId, o.id));
  }
}

export async function markPaid(orderId: string, source: string) {
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (!o) return;
    if (o.status === "AWAITING_PAYMENT") {
      await tx.update(s.order).set({ status: "PAID", paidAt: new Date() }).where(eq(s.order.id, o.id));
      return;
    }
    if (o.status !== "CANCELLED") return; // уже оплачен

    // Деньги пришли после автоотмены: снова резервируем то, что получится, и предупреждаем админов
    const problems: string[] = [];
    const items = await tx.select().from(s.orderItem).where(eq(s.orderItem.orderId, o.id));
    for (const i of items) {
      if (!i.variantId) continue;
      const r = await tx
        .update(s.productVariant)
        .set({ stock: sql`${s.productVariant.stock} - ${i.quantity}` })
        .where(and(eq(s.productVariant.id, i.variantId), gte(s.productVariant.stock, i.quantity)))
        .returning({ id: s.productVariant.id });
      if (!r.length) problems.push(`не хватило товара «${i.name}»`);
    }
    if (o.bonusSpent > 0 && o.userId) {
      const n = o.bonusSpent / 100;
      const r = await tx
        .update(s.user)
        .set({ bonusBalance: sql`${s.user.bonusBalance} - ${n}` })
        .where(and(eq(s.user.id, o.userId), gte(s.user.bonusBalance, n)))
        .returning({ id: s.user.id });
      if (r.length) await tx.insert(s.bonusTransaction).values({ userId: o.userId, amount: -n, reason: "ORDER_SPEND", orderId: o.id, comment: `Оплата заказа ${o.number}` });
      else problems.push("бонусы клиента уже потрачены");
    }
    await tx
      .update(s.order)
      .set({ status: "PAID", paidAt: new Date(), cancelReason: problems.length ? `Оплата пришла после отмены: ${problems.join(", ")}` : null })
      .where(eq(s.order.id, o.id));
    await tx.insert(s.auditLog).values({ actorId: null, action: "order.late_payment", entity: "order", entityId: o.id, details: { source, problems } });
  });
}

/** Применяет актуальный статус платежа из ЮKassa (уведомление, возврат с оплаты, фоновая проверка). */
export async function applyPayment(p: YkPayment, source: string) {
  const row = await db.query.payment.findFirst({ where: eq(s.payment.externalId, p.id) });
  if (!row) return null;
  if (row.status !== "REFUNDED") {
    await db.update(s.payment).set({ status: PAYMENT_STATUS[p.status], raw: p }).where(eq(s.payment.id, row.id));
  }
  if (p.status === "succeeded" && fromMoney(p.amount) >= row.amount) await markPaid(row.orderId, source);
  if (p.status === "canceled") {
    const reason = p.cancellation_details?.reason === "expired_on_confirmation" ? "Время на оплату истекло" : "Оплата не прошла";
    await cancelOrder(row.orderId, reason, null, { onlyIfAwaiting: true });
  }
  return row.orderId;
}

/** Проверить оплату заказа прямо сейчас (покупатель вернулся со страницы оплаты). */
export async function syncPayment(orderId: string) {
  if (!yookassaEnabled()) return;
  const row = await db.query.payment.findFirst({
    where: and(eq(s.payment.orderId, orderId), inArray(s.payment.status, ["PENDING", "WAITING_FOR_CAPTURE"])),
    orderBy: desc(s.payment.createdAt),
  });
  if (!row) return;
  try {
    await applyPayment(await getPayment(row.externalId), "sync");
  } catch (e) {
    console.error("[orders] syncPayment:", e);
  }
}

/** Новая ссылка на оплату, если покупатель закрыл страницу ЮKassa. */
export async function getPayUrl(orderId: string) {
  const row = await db.query.payment.findFirst({
    where: and(eq(s.payment.orderId, orderId), eq(s.payment.status, "PENDING")),
    orderBy: desc(s.payment.createdAt),
  });
  return row?.confirmationUrl ?? null;
}

// ============================================================
// Отмена, возврат, доставка
// ============================================================

export async function cancelOrder(orderId: string, reason: string, actorId: string | null, opts: { onlyIfAwaiting?: boolean } = {}) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (!o) return false;
    if (opts.onlyIfAwaiting && o.status !== "AWAITING_PAYMENT") return false;
    if (o.status === "CANCELLED" || o.status === "REFUNDED") return false;
    if (o.status !== "AWAITING_PAYMENT") throw new OrderError("Заказ уже оплачен — чтобы отменить, оформите возврат денег");
    await release(tx, o, true);
    await tx.update(s.order).set({ status: "CANCELLED", cancelReason: reason }).where(eq(s.order.id, o.id));
    await tx.insert(s.auditLog).values({ actorId, action: "order.cancel", entity: "order", entityId: o.id, details: { reason } });
    return true;
  });
}

export async function refundOrder(orderId: string, actorId: string, opts: { restock: boolean; reason: string }) {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { items: true, payments: true } });
  if (!o) throw new OrderError("Заказ не найден");
  if (!["PAID", "ASSEMBLING", "SHIPPED", "DELIVERED"].includes(o.status)) throw new OrderError("Вернуть деньги можно только по оплаченному заказу");

  const pay = o.payments.find((p) => p.status === "SUCCEEDED");
  let refunded = 0;
  if (pay) {
    const amount = pay.amount - pay.refundedAmount;
    const items = o.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity }));
    const r = await createRefund({
      paymentId: pay.externalId,
      amount,
      orderId: o.id,
      customer: { email: o.email, phone: o.phone },
      receipt: receiptLines(items, o.total - o.shippingCost, o.shippingCost),
    });
    if (r.status === "canceled") throw new OrderError("ЮKassa отклонила возврат. Проверьте баланс магазина в ЮKassa");
    refunded = amount;
  } else if (yookassaEnabled()) {
    throw new OrderError("Не найден успешный платёж по заказу");
  }

  await db.transaction(async (tx) => {
    const cur = await lockOrder(tx, o.id);
    if (!cur || cur.status === "REFUNDED") return;
    if (pay) {
      await tx
        .update(s.payment)
        .set({ status: "REFUNDED", refundedAmount: pay.refundedAmount + refunded })
        .where(eq(s.payment.id, pay.id));
    }
    await release(tx, cur, opts.restock);
    if (cur.bonusCredited && cur.userId) {
      const n = cur.bonusAccrued / 100;
      await tx
        .update(s.user)
        .set({
          bonusBalance: sql`greatest(${s.user.bonusBalance} - ${n}, 0)`,
          totalSpent: sql`greatest(${s.user.totalSpent} - ${cur.total - cur.shippingCost}, 0)`,
        })
        .where(eq(s.user.id, cur.userId));
      if (n > 0) {
        await tx.insert(s.bonusTransaction).values({
          userId: cur.userId,
          amount: -n,
          reason: "REFUND",
          orderId: cur.id,
          comment: `Списание бонусов за возвращённый заказ ${cur.number}`,
        });
      }
    }
    await tx.update(s.order).set({ status: "REFUNDED", cancelReason: opts.reason }).where(eq(s.order.id, cur.id));
    await tx.insert(s.auditLog).values({ actorId, action: "order.refund", entity: "order", entityId: cur.id, details: { amount: refunded, ...opts } });
  });
}

export async function markDelivered(orderId: string, actorId: string | null) {
  const settings = await getSettings();
  await db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (!o || o.status === "DELIVERED" || o.status === "CANCELLED" || o.status === "REFUNDED") return;
    if (o.status === "AWAITING_PAYMENT") throw new OrderError("Заказ ещё не оплачен");
    await tx.update(s.order).set({ status: "DELIVERED", deliveredAt: new Date(), bonusCredited: true }).where(eq(s.order.id, o.id));
    await tx.insert(s.auditLog).values({ actorId, action: "order.delivered", entity: "order", entityId: o.id, details: null });
    if (o.bonusCredited || !o.userId) return;

    // Бонусы и уровень — только за полученный заказ
    const n = o.bonusAccrued / 100;
    const expiresAt = settings.loyalty.expiryDays > 0 ? new Date(Date.now() + settings.loyalty.expiryDays * 86400_000) : null;
    const [u] = await tx
      .update(s.user)
      .set({ bonusBalance: sql`${s.user.bonusBalance} + ${n}`, totalSpent: sql`${s.user.totalSpent} + ${o.total - o.shippingCost}` })
      .where(eq(s.user.id, o.userId))
      .returning();
    if (n > 0) {
      await tx.insert(s.bonusTransaction).values({ userId: o.userId, amount: n, reason: "ORDER_ACCRUAL", orderId: o.id, comment: `Бонусы за заказ ${o.number}`, expiresAt });
    }
    const tier = tierProgress(Math.floor(u.totalSpent / 100), settings.loyalty).current;
    if (tier !== u.tier) await tx.update(s.user).set({ tier }).where(eq(s.user.id, u.id));

    // Приведи друга: бонус пригласившему за первый полученный заказ
    if (u.referredById && settings.loyalty.referralBonus > 0) {
      const [{ n: delivered }] = await tx
        .select({ n: count() })
        .from(s.order)
        .where(and(eq(s.order.userId, u.id), eq(s.order.status, "DELIVERED"), ne(s.order.id, o.id)));
      if (delivered === 0) {
        const bonus = settings.loyalty.referralBonus;
        await tx.update(s.user).set({ bonusBalance: sql`${s.user.bonusBalance} + ${bonus}` }).where(eq(s.user.id, u.referredById));
        await tx.insert(s.bonusTransaction).values({ userId: u.referredById, amount: bonus, reason: "REFERRAL", orderId: o.id, comment: `Друг ${u.name} получил первый заказ`, expiresAt });
      }
    }
  });
}

export async function setStatus(orderId: string, status: "PAID" | "ASSEMBLING" | "SHIPPED", actorId: string, track?: string | null) {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId) });
  if (!o) throw new OrderError("Заказ не найден");
  if (["AWAITING_PAYMENT", "CANCELLED", "REFUNDED", "DELIVERED"].includes(o.status)) throw new OrderError("Этот заказ нельзя перевести в такой статус");
  await db
    .update(s.order)
    .set({
      status,
      ...(status === "SHIPPED" ? { shippedAt: o.shippedAt ?? new Date() } : {}),
      ...(track !== undefined ? { trackNumber: track || null } : {}),
    })
    .where(eq(s.order.id, orderId));
  await auditSystem(actorId, "order.status", "order", orderId, { status, track });
}

// ============================================================
// СДЭК
// ============================================================

export async function shipWithCdek(orderId: string, actorId: string) {
  const settings = await getSettings();
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId), with: { items: { with: { product: true } } } });
  if (!o) throw new OrderError("Заказ не найден");
  if (!["PAID", "ASSEMBLING"].includes(o.status)) throw new OrderError("Отправление создаётся для оплаченного заказа");
  if (o.cdekOrderUuid) throw new OrderError("Отправление уже создано");
  if (!o.cdekCityCode) throw new OrderError("В заказе нет кода города СДЭК — создайте отправление в личном кабинете СДЭК вручную");

  const goodsTotal = o.total - o.shippingCost;
  const shares = receiptLines(
    o.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
    goodsTotal,
    0,
  );
  const uuid = await createShipment({
    number: o.number,
    tariff: o.deliveryTariff ?? (o.deliveryType === "PVZ" ? settings.delivery.tariffPvz : settings.delivery.tariffCourier),
    shipmentPoint: settings.delivery.shipmentPoint,
    pvzCode: o.cdekPvzCode,
    toCityCode: o.cdekCityCode,
    address: o.address,
    recipient: { name: o.customerName, email: o.email, phone: o.phone },
    parcel: parcelFor(
      o.items.map((i) => ({
        weightGrams: i.product?.weightGrams ?? 300,
        lengthCm: i.product?.lengthCm ?? 10,
        widthCm: i.product?.widthCm ?? 10,
        heightCm: i.product?.heightCm ?? 10,
        quantity: i.quantity,
      })),
    ),
    items: o.items.map((i) => ({
      name: i.name,
      sku: i.product?.sku ?? i.product?.slug ?? i.id,
      // Объявленная ценность — сколько клиент реально заплатил за товар
      price: Math.round(shares.filter((l) => l.name === i.name).reduce((a, l) => a + l.price * l.quantity, 0) / i.quantity) || i.price,
      weight: i.product?.weightGrams ?? 300,
      quantity: i.quantity,
    })),
  });
  await db
    .update(s.order)
    .set({ cdekOrderUuid: uuid, status: o.status === "PAID" ? "ASSEMBLING" : o.status, cdekStatus: "Отправление создано" })
    .where(eq(s.order.id, o.id));
  await auditSystem(actorId, "order.cdek_create", "order", o.id, { uuid });
}

/** Подтягивает трек-номер и статус из СДЭК. Получен — начисляем бонусы. */
export async function syncCdek(orderId: string) {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId) });
  if (!o?.cdekOrderUuid || !cdekEnabled()) return;
  const info = await getShipment(o.cdekOrderUuid);
  const patch: Partial<OrderRow> = {};
  if (info.cdekNumber && info.cdekNumber !== o.trackNumber) patch.trackNumber = info.cdekNumber;
  if (info.statusName && info.statusName !== o.cdekStatus) patch.cdekStatus = info.statusName;
  if (info.status && CDEK_IN_TRANSIT.has(info.status) && (o.status === "PAID" || o.status === "ASSEMBLING")) {
    patch.status = "SHIPPED";
    patch.shippedAt = new Date();
  }
  if (Object.keys(patch).length) await db.update(s.order).set(patch).where(eq(s.order.id, o.id));
  if (info.status === "DELIVERED") await markDelivered(o.id, null);
}

// ============================================================
// Фоновые задачи (запускаются из instrumentation.ts)
// ============================================================

export async function expireUnpaidOrders() {
  const due = await db
    .select({ id: s.order.id })
    .from(s.order)
    .where(and(eq(s.order.status, "AWAITING_PAYMENT"), isNotNull(s.order.expiresAt), lt(s.order.expiresAt, new Date())))
    .orderBy(asc(s.order.createdAt))
    .limit(50);
  for (const { id } of due) {
    try {
      await syncPayment(id); // вдруг оплатили, а уведомление не дошло
      await cancelOrder(id, "Не оплачен вовремя", null, { onlyIfAwaiting: true });
    } catch (e) {
      console.error("[jobs] expire:", e);
    }
  }
}

export async function syncShipments() {
  if (!cdekEnabled()) return;
  const list = await db
    .select({ id: s.order.id })
    .from(s.order)
    .where(and(isNotNull(s.order.cdekOrderUuid), inArray(s.order.status, ["PAID", "ASSEMBLING", "SHIPPED"])))
    .limit(200);
  for (const { id } of list) {
    try {
      await syncCdek(id);
    } catch (e) {
      console.error("[jobs] cdek sync:", e);
    }
  }
}
