/**
 * Касса: продажа вживую (клуб, турнир).
 *   • CASH — наличные: сайт только учитывает продажу (остаток, выручка, прибыль), чек пробивают на своей кассе;
 *   • SBP — QR-код СБП через ЮKassa: покупатель сканирует камерой телефона, чек 54-ФЗ присылает ЮKassa;
 *   • CARD — QR со ссылкой на страницу оплаты ЮKassa: покупатель открывает её у себя и платит картой.
 *
 * Товар списывается из остатка клуба, если у клуба включён свой учёт, иначе — со склада.
 * Покупатель по желанию называет телефон: тогда покупка идёт в бонусную программу (списание и начисление).
 * Контакт для чека ЮKassa в базе не хранится.
 * total — сколько заплатили деньгами (после скидки, бонусов и сертификата); bonusSpent — бонусами; giftCardAmount — сертификатом.
 * kind GIFT — продажа подарочного сертификата (без товаров): сертификат начинает действовать, когда чек оплачен.
 */
import "server-only";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { putStock, saleLocation, takeStock, type Tx } from "@/lib/club-stock";
import { tierProgress } from "@/lib/loyalty";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { createPaymentFor, createRefund, fromMoney, getPayment, receiptLines, yookassaEnabled, type YkPayment } from "@/lib/yookassa";

export type PosMethod = "CASH" | "SBP" | "CARD";
export const POS_METHODS: Record<PosMethod, string> = { CASH: "Наличные", SBP: "СБП (QR)", CARD: "Карта (QR-ссылка)" };
/** Подписи для списков: GIFT — покупку целиком оплатили сертификатом */
export const methodLabel = (m: string) => (m === "GIFT" ? "Сертификат" : (POS_METHODS as Record<string, string>)[m] ?? m);
export type SaleRow = typeof s.posSale.$inferSelect;

export class PosError extends Error {}

/** Сколько ждём оплату по QR, потом продажа отменяется и товар возвращается */
const QR_MINUTES = 20;

const code = (prefix: string) => {
  const msk = new Date(Date.now() + 3 * 3600_000);
  const day = msk.toISOString().slice(2, 10).replace(/-/g, "");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join("");
  return `${prefix}-${day}-${tail}`;
};

/** Почта или телефон покупателя для чека; пусто — чек уходит на почту магазина */
function receiptContact(raw: string | null | undefined, shopEmail: string) {
  const v = (raw ?? "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { email: v };
  const digits = v.replace(/\D/g, "");
  if (digits.length === 11 && /^[78]/.test(digits)) return { email: shopEmail, phone: `7${digits.slice(1)}` };
  if (digits.length === 10) return { email: shopEmail, phone: `7${digits}` };
  if (v) throw new PosError("Контакт для чека: почта или телефон +7…");
  return { email: shopEmail };
}

const floorRub = (kop: number) => Math.floor(kop / 100) * 100;

// ---------------------------------------------------------------- бонусы покупателя

/** Покупатель по телефону: имя для сверки и сколько бонусов можно списать с этого чека */
export async function findCustomer(phoneRaw: string) {
  const { normalizePhone } = await import("@/lib/format");
  const phone = normalizePhone(phoneRaw);
  if (!phone) throw new PosError("Телефон покупателя: +7 900 123-45-67");
  const u = await db.query.user.findFirst({ where: and(eq(s.user.phone, phone), eq(s.user.isDevice, false)) });
  if (!u || (u.bannedAt && (!u.bannedUntil || u.bannedUntil > new Date()))) return null;
  const settings = await getSettings();
  const tier = tierProgress(Math.floor(u.totalSpent / 100), settings.loyalty).current;
  const first = (u.callName || u.name).trim().split(/\s+/)[0] ?? "";
  return {
    id: u.id,
    name: first,
    phone: `+7 ••• •••-${phone.slice(-4, -2)}-${phone.slice(-2)}`,
    balance: u.bonusBalance,
    tierPercent: settings.loyalty.tiers[tier].percent,
    maxSpendPercent: settings.loyalty.maxSpendPercent,
  };
}
export type PosCustomer = NonNullable<Awaited<ReturnType<typeof findCustomer>>>;

/** Сколько бонусов (в копейках) можно списать с чека: лимит программы и хотя бы 1 ₽ деньгами */
export function bonusAvailable(total: number, balance: number, maxSpendPercent: number) {
  return Math.max(0, Math.min(balance * 100, floorRub((total * maxSpendPercent) / 100), floorRub(total - 100)));
}

/** Начислить бонусы и засчитать покупку в уровень — когда продажа оплачена */
/** settings читаем до транзакции: внутри неё — только tx (одно соединение с базой) */
async function creditSaleBonuses(tx: Tx, saleId: string, settings: Awaited<ReturnType<typeof getSettings>>) {
  const [sale] = await tx.select().from(s.posSale).where(eq(s.posSale.id, saleId)).for("update");
  if (!sale?.customerId || sale.bonusCredited || sale.status !== "PAID") return;
  const n = Math.floor(sale.bonusAccrued / 100);
  const expiresAt = settings.loyalty.expiryDays > 0 ? new Date(Date.now() + settings.loyalty.expiryDays * 86400_000) : null;
  const [u] = await tx
    .update(s.user)
    .set({ bonusBalance: sql`${s.user.bonusBalance} + ${n}`, totalSpent: sql`${s.user.totalSpent} + ${sale.total}` })
    .where(eq(s.user.id, sale.customerId))
    .returning();
  if (!u) return;
  if (n > 0) await tx.insert(s.bonusTransaction).values({ userId: u.id, amount: n, reason: "ORDER_ACCRUAL", posSaleId: sale.id, comment: `Покупка в клубе ${sale.number}`, expiresAt });
  const tier = tierProgress(Math.floor(u.totalSpent / 100), settings.loyalty).current;
  if (tier !== u.tier) await tx.update(s.user).set({ tier }).where(eq(s.user.id, u.id));
  await tx.update(s.posSale).set({ bonusCredited: true }).where(eq(s.posSale.id, sale.id));
}

/** Неоплаченная продажа отменена — списанные бонусы возвращаем */
async function refundSpentBonuses(tx: Tx, sale: SaleRow) {
  const n = Math.floor(sale.bonusSpent / 100);
  if (!sale.customerId || n <= 0) return;
  await tx.update(s.user).set({ bonusBalance: sql`${s.user.bonusBalance} + ${n}` }).where(eq(s.user.id, sale.customerId));
  await tx.insert(s.bonusTransaction).values({ userId: sale.customerId, amount: n, reason: "REFUND", posSaleId: sale.id, comment: `Отмена покупки ${sale.number}` });
}

// ---------------------------------------------------------------- продажа

export interface NewSale {
  items: { variantId: string; qty: number; price: number }[]; // price — за 1 шт., копейки (можно поменять в кассе)
  discount: number; // скидка на весь чек, копейки
  method: PosMethod;
  place: string | null;
  contact?: string | null;
  shiftId?: string | null;
  clubId?: string | null;
  customerPhone?: string | null; // бонусная программа
  useBonus?: boolean;
  giftCode?: string | null; // подарочный сертификат: часть или всё оплатить им
}

/** Кассир: цены — как в каталоге, скидка на чек — не больше maxDiscountPct % (сверх — по PIN менеджера) */
export interface SaleLimits {
  lockPrices: boolean;
  maxDiscountPct: number | null;
  discountById?: string | null; // скидку сверх лимита подтвердил менеджер
}

/** Проверка скидки до PIN: превышает ли она лимит кассира */
export function discountOverLimit(subtotal: number, discount: number, maxPct: number | null) {
  return maxPct != null && discount > Math.round((subtotal * maxPct) / 100);
}

export async function createSale(sellerId: string, input: NewSale, limits: SaleLimits = { lockPrices: false, maxDiscountPct: null }): Promise<SaleRow> {
  if (!input.items.length) throw new PosError("Добавьте товар");
  if (input.method !== "CASH" && !yookassaEnabled()) throw new PosError("ЮKassa не подключена — принимайте наличными");
  const settings = await getSettings();
  const contact = input.method === "CASH" ? null : receiptContact(input.contact, settings.supportEmail);

  const ids = input.items.map((i) => i.variantId);
  const vars = await db
    .select({ id: s.productVariant.id, productId: s.productVariant.productId, variant: s.productVariant.name, active: s.productVariant.isActive, cost: s.productVariant.costPrice, product: s.product.name, catalogPrice: sql<number>`coalesce(${s.productVariant.price}, ${s.product.price})`, variants: sql<number>`(select count(*)::int from product_variant v2 where v2.product_id = ${s.productVariant.productId} and v2.is_active)` })
    .from(s.productVariant)
    .innerJoin(s.product, eq(s.product.id, s.productVariant.productId))
    .where(inArray(s.productVariant.id, ids));
  const lines = input.items.map((i) => {
    const v = vars.find((x) => x.id === i.variantId);
    if (!v || !v.active) throw new PosError("Товар больше не продаётся — обновите страницу");
    const price = limits.lockPrices ? Number(v.catalogPrice) : i.price;
    return { ...i, price, v, name: v.variants > 1 ? `${v.product} · ${v.variant}` : v.product };
  });
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const discount = Math.min(Math.max(0, input.discount), subtotal);
  if (discountOverLimit(subtotal, discount, limits.maxDiscountPct)) {
    throw new PosError(limits.maxDiscountPct! > 0 ? `Скидка кассира — не больше ${limits.maxDiscountPct} %. Бо́льшую подтверждает менеджер своим PIN` : "Скидку подтверждает менеджер своим PIN");
  }
  const afterDiscount = subtotal - discount;

  // Бонусная программа: покупатель назвал телефон
  const customer = input.customerPhone?.trim() ? await findCustomer(input.customerPhone) : null;
  if (input.customerPhone?.trim() && !customer) throw new PosError("Покупатель с таким телефоном не найден — продайте без бонусов или пусть зарегистрируется на сайте");
  const bonusSpent = customer && input.useBonus ? bonusAvailable(afterDiscount, customer.balance, customer.maxSpendPercent) : 0;
  const afterBonus = afterDiscount - bonusSpent;

  // Подарочный сертификат: списываем, сколько есть на нём (не больше чека)
  let giftAmount = 0;
  let giftCode: string | null = null;
  if (input.giftCode?.trim()) {
    const { checkGiftCode } = await import("@/lib/giftcards");
    const chk = await checkGiftCode(input.giftCode, { ip: null, userId: sellerId });
    if ("error" in chk) throw new PosError(chk.error);
    giftCode = chk.card.code;
    giftAmount = Math.min(chk.card.balance, afterBonus);
    // Остаток по QR меньше 1 ₽ ЮKassa не примет — сертификат покрывает всё, кроме 1 ₽
    if (input.method !== "CASH" && afterBonus - giftAmount > 0 && afterBonus - giftAmount < 100) giftAmount = Math.max(0, afterBonus - 100);
  }
  const total = afterBonus - giftAmount;
  const method: string = total === 0 && giftAmount > 0 ? "GIFT" : input.method;
  if (total <= 0 && method !== "CASH" && method !== "GIFT") throw new PosError("Сумма к оплате — больше 0 ₽");
  const bonusAccrued = customer ? floorRub((total * customer.tierPercent) / 100) : 0;
  const cost = lines.reduce((a, l) => a + (l.v.cost ?? 0) * l.qty, 0);
  const paidNow = method === "CASH" || method === "GIFT";
  const loc = await saleLocation(input.clubId);

  const sale = await db.transaction(async (tx) => {
    const [sale] = await tx
      .insert(s.posSale)
      .values({
        number: code("K"),
        status: paidNow ? "PAID" : "PENDING",
        method,
        subtotal,
        discount,
        total,
        giftCardAmount: giftAmount,
        cost,
        place: input.place,
        sellerId,
        shiftId: input.shiftId ?? null,
        clubId: input.clubId ?? null,
        stockClubId: loc,
        customerId: customer?.id ?? null,
        bonusSpent,
        bonusAccrued,
        discountById: limits.discountById ?? null,
        paidAt: paidNow ? new Date() : null,
      })
      .returning();
    for (const l of lines) {
      const left = await takeStock(tx, loc, l.variantId, l.qty);
      if (left == null) throw new PosError(`«${l.name}»: ${loc ? "в клубе" : "в наличии"} меньше, чем ${l.qty} шт. Проверьте остаток`);
      await tx.insert(s.posSaleItem).values({ saleId: sale.id, productId: l.v.productId, variantId: l.variantId, name: l.name, price: l.price, quantity: l.qty, unitCost: l.v.cost });
      await tx.insert(s.stockMove).values({ variantId: l.variantId, productId: l.v.productId, name: l.name, type: "POS", qty: -l.qty, unitCost: l.v.cost, stockAfter: left, posSaleId: sale.id, clubId: loc, note: sale.number, userId: sellerId });
    }
    if (bonusSpent > 0 && customer) {
      const n = bonusSpent / 100;
      const r = await tx
        .update(s.user)
        .set({ bonusBalance: sql`${s.user.bonusBalance} - ${n}` })
        .where(and(eq(s.user.id, customer.id), gte(s.user.bonusBalance, n)))
        .returning({ id: s.user.id });
      if (!r.length) throw new PosError("Бонусов у покупателя стало меньше — проверьте ещё раз");
      await tx.insert(s.bonusTransaction).values({ userId: customer.id, amount: -n, reason: "ORDER_SPEND", posSaleId: sale.id, comment: `Оплата покупки в клубе ${sale.number}` });
    }
    if (giftCode && giftAmount > 0) {
      const { chargeGiftPos } = await import("@/lib/giftcards");
      if (!(await chargeGiftPos(tx, giftCode, sale.id, giftAmount))) throw new PosError("На сертификате стало меньше денег — проверьте ещё раз");
    }
    if (paidNow) await creditSaleBonuses(tx, sale.id, settings);
    return sale;
  });

  if (paidNow) return (await db.query.posSale.findFirst({ where: eq(s.posSale.id, sale.id) }))!;

  // Оплата через ЮKassa: товар уже отложен; не получилось создать платёж — отменяем продажу
  try {
    const p = await createPaymentFor({
      key: `pos-${sale.id}`,
      amount: total,
      returnUrl: `${SITE.url}/`,
      description: `Покупка ${sale.number} в Abramov Shop`,
      metadata: { shop: "abramov.shop", posSaleId: sale.id, number: sale.number },
      customer: contact!,
      receipt: receiptLines(
        lines.map((l) => ({ name: l.name, price: l.price, quantity: l.qty })),
        total,
        0,
      ),
      method: input.method === "SBP" ? "sbp" : undefined,
    });
    const qrUrl = p.confirmation?.confirmation_data ?? p.confirmation?.confirmation_url ?? null;
    const [row] = await db.update(s.posSale).set({ paymentId: p.id, qrUrl }).where(eq(s.posSale.id, sale.id)).returning();
    return row;
  } catch (e) {
    await cancelSale(sale.id, sellerId, { silent: true }).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[pos] ЮKassa:", msg);
    throw new PosError(
      input.method === "SBP" && /sbp|payment_method/i.test(msg)
        ? "ЮKassa не приняла оплату по СБП — проверьте, что СБП подключён в личном кабинете ЮKassa"
        : "ЮKassa не создала платёж. Попробуйте ещё раз или примите наличными",
    );
  }
}

// ---------------------------------------------------------------- продажа подарочного сертификата

export interface GiftSaleInput {
  amount: number; // номинал, копейки
  method: PosMethod;
  contact?: string | null; // для чека ЮKassa (QR)
  recipientEmail?: string | null; // прислать сертификат письмом
  place: string | null;
  shiftId?: string | null;
  clubId?: string | null;
}

/**
 * Продать сертификат в кассе: чек без товаров (kind GIFT). Наличными — сертификат действует сразу;
 * по QR — когда покупатель оплатит (чек ЮKassa: «иной предмет расчёта», как при покупке на сайте).
 */
export async function createGiftSale(sellerId: string, input: GiftSaleInput) {
  const amount = Math.trunc(input.amount);
  if (!(amount >= 100_00) || amount > 500_000_00 || amount % 100) throw new PosError("Номинал — целые рубли, от 100 ₽");
  if (input.method !== "CASH" && !yookassaEnabled()) throw new PosError("ЮKassa не подключена — принимайте наличными");
  const email = input.recipientEmail?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PosError("Почта получателя — например name@mail.ru");
  const settings = await getSettings();
  const contact = input.method === "CASH" ? null : receiptContact(input.contact || email, settings.supportEmail);
  const paidNow = input.method === "CASH";
  const { createPosGiftCard, certificateLine, mailRecipient } = await import("@/lib/giftcards");
  const { sale, card } = await db.transaction(async (tx) => {
    const [sale] = await tx
      .insert(s.posSale)
      .values({
        number: code("K"),
        kind: "GIFT",
        status: paidNow ? "PAID" : "PENDING",
        method: input.method,
        subtotal: amount,
        total: amount,
        place: input.place,
        sellerId,
        shiftId: input.shiftId ?? null,
        clubId: input.clubId ?? null,
        paidAt: paidNow ? new Date() : null,
      })
      .returning();
    const card = await createPosGiftCard(tx, { saleId: sale.id, amount, sellerId, recipientEmail: email, paid: paidNow, validityDays: settings.giftCards.validityDays });
    return { sale, card };
  });
  if (paidNow) {
    if (card.recipientEmail) await mailRecipient(card).catch((e) => console.error("[pos] сертификат письмом:", e));
    return { sale, card };
  }
  try {
    const p = await createPaymentFor({
      key: `pos-${sale.id}`,
      amount,
      returnUrl: `${SITE.url}/`,
      description: `Подарочный сертификат ${sale.number} — Abramov Shop`,
      metadata: { shop: "abramov.shop", posSaleId: sale.id, number: sale.number },
      customer: contact!,
      receipt: [certificateLine(amount)],
      method: input.method === "SBP" ? "sbp" : undefined,
    });
    const qrUrl = p.confirmation?.confirmation_data ?? p.confirmation?.confirmation_url ?? null;
    const [row] = await db.update(s.posSale).set({ paymentId: p.id, qrUrl }).where(eq(s.posSale.id, sale.id)).returning();
    return { sale: row, card };
  } catch (e) {
    await cancelSale(sale.id, sellerId, { silent: true }).catch(() => {});
    console.error("[pos] ЮKassa (сертификат):", e instanceof Error ? e.message : e);
    throw new PosError("ЮKassa не создала платёж. Попробуйте ещё раз или примите наличными");
  }
}

/** Комиссия: по факту из ЮKassa, если она прислала сумму к зачислению, иначе — по проценту из настроек */
async function feeOf(sale: SaleRow, p: YkPayment | null) {
  if (p?.income_amount) return Math.max(0, sale.total - fromMoney(p.income_amount));
  const f = (await getSettings()).finance;
  const pct = sale.method === "SBP" ? f.feeSbp : sale.method === "CARD" ? f.feeYookassa : 0;
  return Math.round((sale.total * pct) / 100);
}

/** Проверить оплату по QR (кнопка в кассе, опрос с экрана и фоновая задача) */
export async function refreshSale(id: string): Promise<SaleRow | null> {
  const sale = await db.query.posSale.findFirst({ where: eq(s.posSale.id, id) });
  if (!sale?.paymentId || sale.status === "PAID" || (sale.status === "CANCELLED" && sale.paidAt)) return sale ?? null;
  const p = await getPayment(sale.paymentId);
  if (p.status === "succeeded") {
    const fee = await feeOf(sale, p);
    const settings = await getSettings();
    if (sale.status === "CANCELLED") {
      // Отменили, а покупатель всё-таки оплатил — возвращаем продажу и снова списываем товар (и бонусы)
      await db.transaction(async (tx) => {
        const items = await tx.select().from(s.posSaleItem).where(eq(s.posSaleItem.saleId, sale.id));
        for (const i of items) {
          if (!i.variantId) continue;
          const after = await putStock(tx, sale.stockClubId, i.variantId, -i.quantity);
          await tx.insert(s.stockMove).values({ variantId: i.variantId, productId: i.productId, name: i.name, type: "POS", qty: -i.quantity, unitCost: i.unitCost, stockAfter: after, posSaleId: sale.id, clubId: sale.stockClubId, note: `${sale.number}: оплачено после отмены` });
        }
        if (sale.customerId && sale.bonusSpent > 0) {
          const n = Math.floor(sale.bonusSpent / 100);
          await tx.update(s.user).set({ bonusBalance: sql`greatest(${s.user.bonusBalance} - ${n}, 0)` }).where(eq(s.user.id, sale.customerId));
          await tx.insert(s.bonusTransaction).values({ userId: sale.customerId, amount: -n, reason: "ORDER_SPEND", posSaleId: sale.id, comment: `Оплата покупки в клубе ${sale.number}` });
        }
        await tx.update(s.posSale).set({ status: "PAID", paidAt: new Date(), cancelledAt: null, fee }).where(eq(s.posSale.id, sale.id));
        await creditSaleBonuses(tx, sale.id, settings);
      });
      void import("@/lib/telegram").then((t) => t.notifyAdmins(`⚠️ Касса: продажа <b>${sale.number}</b> была отменена, но покупатель оплатил по QR. Продажа восстановлена, товар снова списан — проверьте остаток.`)).catch(() => {});
    } else {
      await db.transaction(async (tx) => {
        await tx.update(s.posSale).set({ status: "PAID", paidAt: new Date(), fee }).where(and(eq(s.posSale.id, sale.id), eq(s.posSale.status, "PENDING")));
        await creditSaleBonuses(tx, sale.id, settings);
      });
    }
    // Продажа сертификата: оплачен — сертификат действует (в т. ч. если оплатили после отмены)
    if (sale.kind === "GIFT") {
      if (sale.status === "CANCELLED") await db.update(s.giftCard).set({ status: "PENDING" }).where(and(eq(s.giftCard.posSaleId, sale.id), eq(s.giftCard.status, "VOID")));
      await import("@/lib/giftcards").then((m) => m.activatePosGift(sale.id));
    }
  } else if (p.status === "canceled" && sale.status === "PENDING") {
    await cancelSale(sale.id, null, { silent: true });
  }
  return (await db.query.posSale.findFirst({ where: eq(s.posSale.id, id) })) ?? null;
}

/**
 * Отмена НЕоплаченной продажи (QR не оплатили): товар возвращается, бонусы — тоже.
 * Оплаченную продажу не отменяют, а оформляют возврат — returnSale.
 */
export async function cancelSale(id: string, userId: string | null, opts: { silent?: boolean } = {}) {
  const sale = await db.query.posSale.findFirst({ where: eq(s.posSale.id, id), with: { items: true } });
  if (!sale || sale.status === "CANCELLED") return sale ?? null;
  if (sale.status === "PAID") throw new PosError("Продажа уже оплачена — оформите возврат");
  await db.transaction(async (tx) => {
    const r = await tx
      .update(s.posSale)
      .set({ status: "CANCELLED", cancelledAt: new Date() })
      .where(and(eq(s.posSale.id, id), eq(s.posSale.status, "PENDING")))
      .returning({ id: s.posSale.id });
    if (!r.length) return;
    for (const i of sale.items) {
      if (!i.variantId) continue;
      const after = await putStock(tx, sale.stockClubId, i.variantId, i.quantity);
      await tx.insert(s.stockMove).values({ variantId: i.variantId, productId: i.productId, name: i.name, type: "POS_CANCEL", qty: i.quantity, unitCost: i.unitCost, stockAfter: after, posSaleId: sale.id, clubId: sale.stockClubId, note: opts.silent ? `${sale.number}: не оплатили` : `${sale.number}: отмена`, userId });
    }
    await refundSpentBonuses(tx, sale);
    if (sale.giftCardAmount > 0) await import("@/lib/giftcards").then((m) => m.releaseGiftPos(tx, sale.id));
  });
  if (sale.kind === "GIFT") await import("@/lib/giftcards").then((m) => m.voidPosGift(sale.id));
  return db.query.posSale.findFirst({ where: eq(s.posSale.id, id) });
}

// ---------------------------------------------------------------- возврат

export interface ReturnInput {
  items: { saleItemId: string; qty: number }[];
  reason?: string | null;
  sellerId: string;
  approverId: string | null; // менеджер, подтвердивший PIN (или сам менеджер)
  shiftId: string | null; // смена, из кассы которой отдают наличные
}

/** Сколько вернуть: деньгами, бонусами на счёт и сколько начисленных бонусов списать — по доле позиций */
export function returnShares(
  sale: Pick<SaleRow, "subtotal" | "total" | "refunded" | "bonusSpent" | "bonusAccrued" | "bonusCredited"> & { giftCardAmount?: number },
  items: { price: number; quantity: number; returnedQty: number }[],
  take: number[],
  already: { bonusBack: number; accruedBack: number; giftBack?: number },
) {
  const value = items.reduce((a, it, i) => a + it.price * take[i], 0);
  const left = items.reduce((a, it, i) => a + it.price * (it.quantity - it.returnedQty - take[i]), 0);
  const share = value / Math.max(1, sale.subtotal);
  // Возвращаем всё оставшееся — без копеек «на округление»
  const all = left === 0;
  const money = all ? sale.total - sale.refunded : Math.min(sale.total - sale.refunded, Math.round(sale.total * share));
  const bonusBack = all ? sale.bonusSpent - already.bonusBack : floorRub(sale.bonusSpent * share);
  const accruedBack = sale.bonusCredited ? (all ? sale.bonusAccrued - already.accruedBack : floorRub(sale.bonusAccrued * share)) : 0;
  const gift = sale.giftCardAmount ?? 0;
  const giftBack = all ? gift - (already.giftBack ?? 0) : Math.round(gift * share);
  return { value, money: Math.max(0, money), bonusBack: Math.max(0, bonusBack), accruedBack: Math.max(0, accruedBack), giftBack: Math.max(0, giftBack) };
}

export async function returnSale(saleId: string, input: ReturnInput) {
  const sale = await db.query.posSale.findFirst({ where: eq(s.posSale.id, saleId), with: { items: true, returns: true } });
  if (!sale) throw new PosError("Продажа не найдена");
  if (sale.status !== "PAID") throw new PosError(sale.status === "PENDING" ? "Продажа ещё не оплачена — её можно просто отменить" : "Продажа отменена");
  if (sale.kind === "GIFT") throw new PosError("Это продажа подарочного сертификата — вернуть деньги за него можно у менеджера");
  const items = sale.items;
  const take = items.map((it) => {
    const q = Math.trunc(input.items.find((x) => x.saleItemId === it.id)?.qty ?? 0);
    if (q < 0 || q > it.quantity - it.returnedQty) throw new PosError(`«${it.name}»: вернуть можно не больше ${it.quantity - it.returnedQty} шт`);
    return q;
  });
  if (!take.some((q) => q > 0)) throw new PosError("Отметьте, что возвращают");
  const already = {
    bonusBack: sale.returns.reduce((a, r) => a + r.bonusBack, 0),
    accruedBack: sale.returns.reduce((a, r) => a + r.accruedBack, 0),
    giftBack: sale.returns.reduce((a, r) => a + r.giftBack, 0),
  };
  const sh = returnShares(sale, items, take, already);
  // Наличными часть чека — до целого рубля (копейки не отдать); весь остаток чека — точно
  const leftAfter = items.some((it, i) => it.quantity - it.returnedQty - take[i] > 0);
  if (sale.method === "CASH" && leftAfter) sh.money = Math.min(sale.total - sale.refunded, Math.round(sh.money / 100) * 100);
  const method = sh.money <= 0 ? "NONE" : sale.method === "CASH" ? "CASH" : "YOOKASSA";
  const number = code("V");

  // Деньги по QR — через ЮKassa (до записи в базу: не вернулось — возврата нет)
  let refundId: string | null = null;
  if (method === "YOOKASSA") {
    if (!sale.paymentId) throw new PosError("У продажи нет платежа ЮKassa — верните деньги вручную и отметьте возврат у менеджера");
    const settings = await getSettings();
    const r = await createRefund({
      paymentId: sale.paymentId,
      amount: sh.money,
      orderId: `pos-${sale.id}`,
      idempotenceKey: `pos-return-${number}`,
      customer: { email: settings.supportEmail },
      receipt: receiptLines(
        items.map((it, i) => ({ name: it.name, price: it.price, quantity: take[i] })).filter((l) => l.quantity > 0),
        sh.money,
        0,
      ),
    });
    if (r.status === "canceled") throw new PosError("ЮKassa отклонила возврат — проверьте баланс магазина в ЮKassa");
    refundId = r.id;
  }

  const cost = items.reduce((a, it, i) => a + (it.unitCost ?? 0) * take[i], 0);
  const ret = await db.transaction(async (tx) => {
    const [ret] = await tx
      .insert(s.posReturn)
      .values({ number, saleId: sale.id, shiftId: method === "CASH" ? input.shiftId : null, sellerId: input.sellerId, approverId: input.approverId, method, amount: sh.money, cost, bonusBack: sh.bonusBack, giftBack: sh.giftBack, accruedBack: sh.accruedBack, refundId, reason: input.reason?.trim().slice(0, 300) || null })
      .returning();
    let rest = sh.money;
    const lastIdx = take.map((q, i) => (q > 0 ? i : -1)).filter((i) => i >= 0).pop()!;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const q = take[i];
      if (!q) continue;
      // Деньги по позициям — пропорционально, остаток округления — последней позиции
      const part = i === lastIdx ? rest : Math.round((sh.money * it.price * q) / Math.max(1, sh.value));
      rest -= part;
      await tx.insert(s.posReturnItem).values({ returnId: ret.id, saleItemId: it.id, name: it.name, quantity: q, amount: part });
      await tx.update(s.posSaleItem).set({ returnedQty: sql`${s.posSaleItem.returnedQty} + ${q}` }).where(eq(s.posSaleItem.id, it.id));
      if (it.variantId) {
        const after = await putStock(tx, sale.stockClubId, it.variantId, q);
        await tx.insert(s.stockMove).values({ variantId: it.variantId, productId: it.productId, name: it.name, type: "POS_RETURN", qty: q, unitCost: it.unitCost, stockAfter: after, posSaleId: sale.id, clubId: sale.stockClubId, note: `${number} по чеку ${sale.number}`, userId: input.sellerId });
      }
    }
    await tx.update(s.posSale).set({ refunded: sql`${s.posSale.refunded} + ${sh.money}` }).where(eq(s.posSale.id, sale.id));
    // Часть, оплаченная сертификатом, — обратно на сертификат
    if (sh.giftBack > 0) await import("@/lib/giftcards").then((m) => m.returnToGiftPos(tx, sale.id, sh.giftBack));
    // Бонусы: списанные — обратно на счёт, начисленные за возвращённое — списываем; сумма покупок уменьшается
    if (sale.customerId) {
      const back = Math.floor(sh.bonusBack / 100);
      const minus = Math.floor(sh.accruedBack / 100);
      await tx
        .update(s.user)
        .set({
          bonusBalance: sql`greatest(${s.user.bonusBalance} + ${back} - ${minus}, 0)`,
          ...(sale.bonusCredited ? { totalSpent: sql`greatest(${s.user.totalSpent} - ${sh.money}, 0)` } : {}),
        })
        .where(eq(s.user.id, sale.customerId));
      if (back > 0) await tx.insert(s.bonusTransaction).values({ userId: sale.customerId, amount: back, reason: "REFUND", posSaleId: sale.id, comment: `Возврат ${number}: бонусы, которыми платили` });
      if (minus > 0) await tx.insert(s.bonusTransaction).values({ userId: sale.customerId, amount: -minus, reason: "REFUND", posSaleId: sale.id, comment: `Возврат ${number}: начисленные за покупку` });
    }
    return ret;
  });
  return { ret, sale, money: sh.money, method, bonusBack: sh.bonusBack };
}

/** Продажа для возврата — по номеру чека (K-…) */
export async function saleForReturn(numberRaw: string) {
  const number = numberRaw.trim().toUpperCase().replace(/\s/g, "");
  if (!/^K-\d{6}-[A-Z0-9]{4}$/.test(number)) return null;
  return db.query.posSale.findFirst({ where: eq(s.posSale.number, number), with: { items: true, returns: true } });
}

/** Фоновая задача: оплаты по QR и отмена неоплаченных через 20 минут */
export async function pollPosSales() {
  if (!yookassaEnabled()) return;
  const pending = await db.select({ id: s.posSale.id, createdAt: s.posSale.createdAt }).from(s.posSale).where(eq(s.posSale.status, "PENDING")).orderBy(asc(s.posSale.createdAt)).limit(50);
  for (const p of pending) {
    const row = await refreshSale(p.id).catch((e) => {
      console.error("[pos] проверка оплаты:", e instanceof Error ? e.message : e);
      return null;
    });
    if (row?.status === "PENDING" && Date.now() - +p.createdAt > QR_MINUTES * 60_000) await cancelSale(p.id, null, { silent: true });
  }
  // Отменённые за последние сутки: вдруг заплатили по старому QR
  const recent = await db
    .select({ id: s.posSale.id })
    .from(s.posSale)
    .where(and(eq(s.posSale.status, "CANCELLED"), sql`${s.posSale.paymentId} is not null`, sql`${s.posSale.paidAt} is null`, gte(s.posSale.cancelledAt, new Date(Date.now() - 86400_000)), lt(s.posSale.cancelledAt, new Date(Date.now() - 60_000))))
    .limit(20);
  for (const r of recent) await refreshSale(r.id).catch(() => null);
}
