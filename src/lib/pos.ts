/**
 * Касса: продажа вживую (клуб, турнир).
 *   • CASH — наличные: сайт только учитывает продажу (остаток, выручка, прибыль), чек пробивают на своей кассе;
 *   • SBP — QR-код СБП через ЮKassa: покупатель сканирует камерой телефона, чек 54-ФЗ присылает ЮKassa;
 *   • CARD — QR со ссылкой на страницу оплаты ЮKassa: покупатель открывает её у себя и платит картой.
 * Покупателя не записываем: только товары и деньги. Контакт для чека передаётся в ЮKassa и в базе не хранится.
 */
import "server-only";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { createPaymentFor, createRefund, fromMoney, getPayment, receiptLines, yookassaEnabled, type YkPayment } from "@/lib/yookassa";

export type PosMethod = "CASH" | "SBP" | "CARD";
export const POS_METHODS: Record<PosMethod, string> = { CASH: "Наличные", SBP: "СБП (QR)", CARD: "Карта (QR-ссылка)" };
export type SaleRow = typeof s.posSale.$inferSelect;

export class PosError extends Error {}

/** Сколько ждём оплату по QR, потом продажа отменяется и товар возвращается */
const QR_MINUTES = 20;

function saleNumber() {
  const msk = new Date(Date.now() + 3 * 3600_000);
  const day = msk.toISOString().slice(2, 10).replace(/-/g, "");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join("");
  return `K-${day}-${tail}`;
}

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

export interface NewSale {
  items: { variantId: string; qty: number; price: number }[]; // price — за 1 шт., копейки (можно поменять в кассе)
  discount: number; // скидка на весь чек, копейки
  method: PosMethod;
  place: string | null;
  contact?: string | null;
}

export async function createSale(sellerId: string, input: NewSale): Promise<SaleRow> {
  if (!input.items.length) throw new PosError("Добавьте товар");
  if (input.method !== "CASH" && !yookassaEnabled()) throw new PosError("ЮKassa не подключена — принимайте наличными");
  const settings = await getSettings();
  const contact = input.method === "CASH" ? null : receiptContact(input.contact, settings.supportEmail);

  const ids = input.items.map((i) => i.variantId);
  const vars = await db
    .select({ id: s.productVariant.id, productId: s.productVariant.productId, variant: s.productVariant.name, active: s.productVariant.isActive, cost: s.productVariant.costPrice, product: s.product.name, variants: sql<number>`(select count(*)::int from product_variant v2 where v2.product_id = ${s.productVariant.productId} and v2.is_active)` })
    .from(s.productVariant)
    .innerJoin(s.product, eq(s.product.id, s.productVariant.productId))
    .where(inArray(s.productVariant.id, ids));
  const lines = input.items.map((i) => {
    const v = vars.find((x) => x.id === i.variantId);
    if (!v || !v.active) throw new PosError("Товар больше не продаётся — обновите страницу");
    return { ...i, v, name: v.variants > 1 ? `${v.product} · ${v.variant}` : v.product };
  });
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const discount = Math.min(Math.max(0, input.discount), subtotal);
  const total = subtotal - discount;
  if (total <= 0 && input.method !== "CASH") throw new PosError("Сумма к оплате — больше 0 ₽");
  const cost = lines.reduce((a, l) => a + (l.v.cost ?? 0) * l.qty, 0);
  const paidNow = input.method === "CASH";

  const sale = await db.transaction(async (tx) => {
    const [sale] = await tx
      .insert(s.posSale)
      .values({ number: saleNumber(), status: paidNow ? "PAID" : "PENDING", method: input.method, subtotal, discount, total, cost, place: input.place, sellerId, paidAt: paidNow ? new Date() : null })
      .returning();
    for (const l of lines) {
      const r = await tx
        .update(s.productVariant)
        .set({ stock: sql`${s.productVariant.stock} - ${l.qty}` })
        .where(and(eq(s.productVariant.id, l.variantId), gte(s.productVariant.stock, l.qty)))
        .returning({ stock: s.productVariant.stock });
      if (!r.length) throw new PosError(`«${l.name}»: в наличии меньше, чем ${l.qty} шт. Проверьте остаток`);
      await tx.insert(s.posSaleItem).values({ saleId: sale.id, productId: l.v.productId, variantId: l.variantId, name: l.name, price: l.price, quantity: l.qty, unitCost: l.v.cost });
      await tx.insert(s.stockMove).values({ variantId: l.variantId, productId: l.v.productId, name: l.name, type: "POS", qty: -l.qty, unitCost: l.v.cost, stockAfter: r[0].stock, posSaleId: sale.id, note: sale.number, userId: sellerId });
    }
    return sale;
  });

  if (paidNow) return sale;

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
    if (sale.status === "CANCELLED") {
      // Отменили, а покупатель всё-таки оплатил — возвращаем продажу и снова списываем товар
      await db.transaction(async (tx) => {
        const items = await tx.select().from(s.posSaleItem).where(eq(s.posSaleItem.saleId, sale.id));
        for (const i of items) {
          if (!i.variantId) continue;
          const [v] = await tx.update(s.productVariant).set({ stock: sql`${s.productVariant.stock} - ${i.quantity}` }).where(eq(s.productVariant.id, i.variantId)).returning({ stock: s.productVariant.stock });
          await tx.insert(s.stockMove).values({ variantId: i.variantId, productId: i.productId, name: i.name, type: "POS", qty: -i.quantity, unitCost: i.unitCost, stockAfter: v?.stock ?? null, posSaleId: sale.id, note: `${sale.number}: оплачено после отмены` });
        }
        await tx.update(s.posSale).set({ status: "PAID", paidAt: new Date(), cancelledAt: null, fee }).where(eq(s.posSale.id, sale.id));
      });
      void import("@/lib/telegram").then((t) => t.notifyAdmins(`⚠️ Касса: продажа <b>${sale.number}</b> была отменена, но покупатель оплатил по QR. Продажа восстановлена, товар снова списан — проверьте остаток.`)).catch(() => {});
    } else {
      await db.update(s.posSale).set({ status: "PAID", paidAt: new Date(), fee }).where(and(eq(s.posSale.id, sale.id), eq(s.posSale.status, "PENDING")));
    }
  } else if (p.status === "canceled" && sale.status === "PENDING") {
    await cancelSale(sale.id, null, { silent: true });
  }
  return (await db.query.posSale.findFirst({ where: eq(s.posSale.id, id) })) ?? null;
}

/**
 * Отмена продажи: товар возвращается на склад.
 * Оплаченную по QR — возвращаем деньги через ЮKassa; наличные отдаёте сами.
 */
export async function cancelSale(id: string, userId: string | null, opts: { silent?: boolean } = {}) {
  const sale = await db.query.posSale.findFirst({ where: eq(s.posSale.id, id), with: { items: true } });
  if (!sale || sale.status === "CANCELLED") return sale ?? null;
  if (sale.status === "PAID" && sale.method !== "CASH" && sale.paymentId) {
    const settings = await getSettings();
    await createRefund({
      paymentId: sale.paymentId,
      amount: sale.total,
      orderId: `pos-${sale.id}`,
      customer: { email: settings.supportEmail },
      receipt: receiptLines(
        sale.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        sale.total,
        0,
      ),
    });
  }
  await db.transaction(async (tx) => {
    const r = await tx
      .update(s.posSale)
      .set({ status: "CANCELLED", cancelledAt: new Date() })
      .where(and(eq(s.posSale.id, id), inArray(s.posSale.status, ["PENDING", "PAID"])))
      .returning({ id: s.posSale.id });
    if (!r.length) return;
    for (const i of sale.items) {
      if (!i.variantId) continue;
      const [v] = await tx.update(s.productVariant).set({ stock: sql`${s.productVariant.stock} + ${i.quantity}` }).where(eq(s.productVariant.id, i.variantId)).returning({ stock: s.productVariant.stock });
      await tx.insert(s.stockMove).values({ variantId: i.variantId, productId: i.productId, name: i.name, type: "POS_CANCEL", qty: i.quantity, unitCost: i.unitCost, stockAfter: v?.stock ?? null, posSaleId: sale.id, note: sale.status === "PENDING" && opts.silent ? `${sale.number}: не оплатили` : `${sale.number}: отмена`, userId });
    }
  });
  return db.query.posSale.findFirst({ where: eq(s.posSale.id, id) });
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
