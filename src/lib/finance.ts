/**
 * Финансы: выручка, себестоимость, комиссии, доставка, расходы и чистая прибыль за период.
 * Все суммы — в копейках. Период — [from, to) по времени оплаты.
 *
 * Выручка — деньги за оплаченные заказы сайта (минус возвраты), продажи в кассе и оплаченные работы мастерской.
 * Себестоимость — закупочная цена проданных товаров (на момент продажи, а если её тогда не было — текущая).
 * Комиссии — по факту из ЮKassa, если она прислала сумму к зачислению, иначе — по процентам из настроек.
 * Доставка — сколько СДЭК стоит магазину (тариф без наценки), даже если покупателю она была бесплатной.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSettings } from "@/lib/settings";

export const EXPENSE_CATEGORIES = ["Реклама", "Аренда", "Зарплата", "Налоги и взносы", "Упаковка и расходники", "Сервисы и связь", "Транспорт", "Банк и эквайринг", "Прочее"];

const n = (v: unknown) => Number(v ?? 0) || 0;

export interface FinanceReport {
  from: Date;
  to: Date;
  site: { revenue: number; orders: number; refunds: number; cogs: number; fees: number; delivery: number; invoiceRevenue: number; invoiceOrders: number };
  pos: { revenue: number; sales: number; cogs: number; fees: number; cash: number; sbp: number; card: number };
  service: { revenue: number; count: number; fees: number };
  losses: number; // списания и недостачи по закупке
  expenses: { total: number; byCategory: { category: string; amount: number }[] };
  tax: number;
  taxPercent: number;
  revenue: number;
  cogs: number;
  fees: number;
  gross: number; // валовая прибыль: выручка − себестоимость
  net: number; // чистая прибыль
  missingCost: number; // проданных позиций без закупочной цены
  customCues: number; // кии на заказ — их себестоимость не считается
  top: { name: string; qty: number; revenue: number; cost: number | null }[];
}

export async function financeReport(from: Date, to: Date): Promise<FinanceReport> {
  const f = (await getSettings()).finance;

  const [siteQ, feesQ, itemsQ, posQ, posCogsQ, svcQ, lossQ, expQ, topQ] = await Promise.all([
    db.execute<{ revenue: number; orders: number; refunds: number; delivery: number; inv_revenue: number; inv_orders: number }>(sql`
      select coalesce(sum(o.total), 0)::bigint as revenue, count(*)::int as orders,
        coalesce(sum((select coalesce(sum(p.refunded_amount), 0) from payment p where p.order_id = o.id)), 0)::bigint as refunds,
        coalesce(sum(coalesce(o.delivery_cost, case when o.delivery_type in ('PVZ', 'COURIER') then o.shipping_cost else 0 end)), 0)::bigint as delivery,
        coalesce(sum(o.total) filter (where o.payment_method = 'INVOICE'), 0)::bigint as inv_revenue,
        (count(*) filter (where o.payment_method = 'INVOICE'))::int as inv_orders
      from "order" o
      where o.status in ('PAID', 'ASSEMBLING', 'SHIPPED', 'DELIVERED') and o.paid_at >= ${from} and o.paid_at < ${to}`),
    db.execute<{ provider: string; amount: number; income: string | null }>(sql`
      select p.provider, p.amount, p.raw -> 'income_amount' ->> 'value' as income
      from payment p join "order" o on o.id = p.order_id
      where p.status = 'SUCCEEDED' and o.status in ('PAID', 'ASSEMBLING', 'SHIPPED', 'DELIVERED') and o.paid_at >= ${from} and o.paid_at < ${to}`),
    db.execute<{ cogs: number; missing: number; custom: number }>(sql`
      select coalesce(sum(coalesce(i.unit_cost, v.cost_price) * i.quantity) filter (where i.spec is null), 0)::bigint as cogs,
        (count(*) filter (where i.spec is null and i.unit_cost is null and v.cost_price is null))::int as missing,
        (count(*) filter (where i.spec is not null))::int as custom
      from order_item i join "order" o on o.id = i.order_id left join product_variant v on v.id = i.variant_id
      where o.status in ('PAID', 'ASSEMBLING', 'SHIPPED', 'DELIVERED') and o.paid_at >= ${from} and o.paid_at < ${to}`),
    db.execute<{ revenue: number; sales: number; fees: number; cash: number; sbp: number; card: number }>(sql`
      select coalesce(sum(total), 0)::bigint as revenue, count(*)::int as sales, coalesce(sum(fee), 0)::bigint as fees,
        coalesce(sum(total) filter (where method = 'CASH'), 0)::bigint as cash,
        coalesce(sum(total) filter (where method = 'SBP'), 0)::bigint as sbp,
        coalesce(sum(total) filter (where method = 'CARD'), 0)::bigint as card
      from pos_sale where status = 'PAID' and paid_at >= ${from} and paid_at < ${to}`),
    db.execute<{ cogs: number; missing: number }>(sql`
      select coalesce(sum(coalesce(i.unit_cost, v.cost_price) * i.quantity), 0)::bigint as cogs,
        (count(*) filter (where i.unit_cost is null and v.cost_price is null))::int as missing
      from pos_sale_item i join pos_sale ps on ps.id = i.sale_id left join product_variant v on v.id = i.variant_id
      where ps.status = 'PAID' and ps.paid_at >= ${from} and ps.paid_at < ${to}`),
    db.execute<{ revenue: number; count: number; online: number }>(sql`
      select coalesce(sum(price), 0)::bigint as revenue, count(*)::int as count,
        coalesce(sum(price) filter (where payment_status = 'SUCCEEDED'), 0)::bigint as online
      from service_request where payment_status in ('SUCCEEDED', 'OFFLINE') and price is not null and paid_at >= ${from} and paid_at < ${to}`),
    db.execute<{ losses: number }>(sql`
      select coalesce(sum(-qty * coalesce(unit_cost, 0)), 0)::bigint as losses
      from stock_move where created_at >= ${from} and created_at < ${to} and qty < 0 and type in ('WRITE_OFF', 'INVENTORY')`),
    db.execute<{ category: string; amount: number }>(sql`
      select category, sum(amount)::bigint as amount from expense
      where day >= (${from}::timestamptz at time zone 'Europe/Moscow')::date and day < (${to}::timestamptz at time zone 'Europe/Moscow')::date
      group by category order by sum(amount) desc`),
    db.execute<{ name: string; qty: number; revenue: number; cost: number | null; known: number }>(sql`
      select name, sum(qty)::int as qty, sum(revenue)::bigint as revenue, sum(cost)::bigint as cost, min(known)::int as known from (
        select coalesce(p.name, i.name) as name, i.quantity as qty, i.price * i.quantity as revenue,
          coalesce(i.unit_cost, v.cost_price) * i.quantity as cost, case when coalesce(i.unit_cost, v.cost_price) is null then 0 else 1 end as known
        from order_item i join "order" o on o.id = i.order_id left join product_variant v on v.id = i.variant_id left join product p on p.id = i.product_id
        where o.status in ('PAID', 'ASSEMBLING', 'SHIPPED', 'DELIVERED') and o.paid_at >= ${from} and o.paid_at < ${to} and i.spec is null
        union all
        select coalesce(p.name, i.name), i.quantity, i.price * i.quantity, coalesce(i.unit_cost, v.cost_price) * i.quantity,
          case when coalesce(i.unit_cost, v.cost_price) is null then 0 else 1 end
        from pos_sale_item i join pos_sale ps on ps.id = i.sale_id left join product_variant v on v.id = i.variant_id left join product p on p.id = i.product_id
        where ps.status = 'PAID' and ps.paid_at >= ${from} and ps.paid_at < ${to}
      ) x group by name order by sum(revenue) desc limit 15`),
  ]);

  const site0 = siteQ.rows[0];
  const items0 = itemsQ.rows[0];
  const pos0 = posQ.rows[0];
  const posCogs0 = posCogsQ.rows[0];
  const svc0 = svcQ.rows[0];

  // Комиссии сайта: по факту из ЮKassa или по процентам
  let siteFees = 0;
  for (const p of feesQ.rows) {
    const amount = n(p.amount);
    if (p.income != null && p.provider === "yookassa") siteFees += Math.max(0, amount - Math.round(Number(p.income) * 100));
    else if (p.provider === "yookassa") siteFees += Math.round((amount * f.feeYookassa) / 100);
    else if (p.provider === "robokassa") siteFees += Math.round((amount * f.feeRobokassa) / 100);
  }

  const site = {
    revenue: n(site0.revenue) - n(site0.refunds),
    orders: n(site0.orders),
    refunds: n(site0.refunds),
    cogs: n(items0.cogs),
    fees: siteFees,
    delivery: n(site0.delivery),
    invoiceRevenue: n(site0.inv_revenue),
    invoiceOrders: n(site0.inv_orders),
  };
  const pos = { revenue: n(pos0.revenue), sales: n(pos0.sales), cogs: n(posCogs0.cogs), fees: n(pos0.fees), cash: n(pos0.cash), sbp: n(pos0.sbp), card: n(pos0.card) };
  const service = { revenue: n(svc0.revenue), count: n(svc0.count), fees: Math.round((n(svc0.online) * f.feeYookassa) / 100) };
  const byCategory = expQ.rows.map((r) => ({ category: r.category, amount: n(r.amount) }));
  const expenses = { total: byCategory.reduce((a, r) => a + r.amount, 0), byCategory };
  const losses = n(lossQ.rows[0]?.losses);

  const revenue = site.revenue + pos.revenue + service.revenue;
  const cogs = site.cogs + pos.cogs;
  const fees = site.fees + pos.fees + service.fees;
  const tax = Math.round((revenue * (f.taxPercent || 0)) / 100);
  const gross = revenue - cogs;
  const net = gross - fees - site.delivery - losses - expenses.total - tax;

  return {
    from,
    to,
    site,
    pos,
    service,
    losses,
    expenses,
    tax,
    taxPercent: f.taxPercent || 0,
    revenue,
    cogs,
    fees,
    gross,
    net,
    missingCost: n(items0.missing) + n(posCogs0.missing),
    customCues: n(items0.custom),
    top: topQ.rows.map((r) => ({ name: r.name, qty: n(r.qty), revenue: n(r.revenue), cost: n(r.known) ? n(r.cost) : null })),
  };
}

// ============================================================
// Периоды (по Москве)
// ============================================================

/** «2026-11-06» — сегодняшняя дата по Москве */
export const mskDate = (d = new Date()) => new Date(+d + 3 * 3600_000).toISOString().slice(0, 10);
export const mskStart = (day: string) => new Date(`${day}T00:00:00+03:00`);
const addDays = (day: string, k: number) => mskDate(new Date(+mskStart(day) + k * 86400_000 + 3600_000));

export type PeriodKey = "today" | "yesterday" | "week" | "month" | "prev-month" | "year" | "custom";

export function periodRange(key: string, a?: string, b?: string): { key: PeriodKey; from: Date; to: Date; label: string; fromDay: string; toDay: string } {
  const today = mskDate();
  const [y, m] = today.split("-").map(Number);
  const pad = (x: number) => String(x).padStart(2, "0");
  const re = /^\d{4}-\d{2}-\d{2}$/;
  let fromDay = today;
  let toDay = today; // включительно
  let label = "Сегодня";
  let k: PeriodKey = "today";
  if (key === "yesterday") {
    fromDay = toDay = addDays(today, -1);
    label = "Вчера";
    k = "yesterday";
  } else if (key === "week") {
    fromDay = addDays(today, -6);
    label = "7 дней";
    k = "week";
  } else if (key === "month") {
    fromDay = `${y}-${pad(m)}-01`;
    label = "Этот месяц";
    k = "month";
  } else if (key === "prev-month") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    fromDay = `${py}-${pad(pm)}-01`;
    toDay = addDays(`${y}-${pad(m)}-01`, -1);
    label = "Прошлый месяц";
    k = "prev-month";
  } else if (key === "year") {
    fromDay = `${y}-01-01`;
    label = `${y} год`;
    k = "year";
  } else if (key === "custom" && a && re.test(a)) {
    fromDay = a;
    toDay = b && re.test(b) && b >= a ? b : a;
    label = fromDay === toDay ? fromDay.split("-").reverse().join(".") : `${fromDay.split("-").reverse().join(".")} — ${toDay.split("-").reverse().join(".")}`;
    k = "custom";
  }
  return { key: k, from: mskStart(fromDay), to: mskStart(addDays(toDay, 1)), label, fromDay, toDay };
}
