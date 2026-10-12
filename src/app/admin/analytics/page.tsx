import { and, desc, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { num, rub } from "@/lib/format";
import { BarChart } from "./BarChart";

const PAID = ["PAID", "ASSEMBLING", "SHIPPED", "DELIVERED"] as const;
const PERIODS = [7, 30, 90, 365];

/** Дни периода по Москве: ["2026-10-01", …] */
function days(n: number) {
  const out: string[] = [];
  const now = Date.now() + 3 * 3600_000;
  for (let i = n - 1; i >= 0; i--) out.push(new Date(now - i * 86400_000).toISOString().slice(0, 10));
  return out;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const period = PERIODS.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const list = days(period);
  const from = new Date(`${list[0]}T00:00:00+03:00`);
  const prevFrom = new Date(+from - period * 86400_000);
  const paidIn = (a: Date, b?: Date) =>
    and(inArray(s.order.status, [...PAID]), isNotNull(s.order.paidAt), gte(s.order.paidAt, a), b ? lt(s.order.paidAt, b) : undefined);
  const mskDay = sql<string>`to_char(${s.order.paidAt} at time zone 'Europe/Moscow', 'YYYY-MM-DD')`;

  const [byDay, [totals], [prev], top, cities, promos, [newBuyers], [repeat], [liability], [abandoned]] = await Promise.all([
    db
      .select({ day: mskDay, revenue: sql<number>`sum(${s.order.total})::int`, orders: sql<number>`count(*)::int` })
      .from(s.order)
      .where(paidIn(from))
      .groupBy(mskDay),
    db
      .select({
        revenue: sql<number>`coalesce(sum(${s.order.total}), 0)::int`,
        orders: sql<number>`count(*)::int`,
        discount: sql<number>`coalesce(sum(${s.order.discount}), 0)::int`,
        bonus: sql<number>`coalesce(sum(${s.order.bonusSpent}), 0)::int`,
        shipping: sql<number>`coalesce(sum(${s.order.shippingCost}), 0)::int`,
      })
      .from(s.order)
      .where(paidIn(from)),
    db
      .select({ revenue: sql<number>`coalesce(sum(${s.order.total}), 0)::int`, orders: sql<number>`count(*)::int` })
      .from(s.order)
      .where(paidIn(prevFrom, from)),
    db
      .select({
        name: s.orderItem.name,
        qty: sql<number>`sum(${s.orderItem.quantity})::int`,
        revenue: sql<number>`sum(${s.orderItem.price} * ${s.orderItem.quantity})::int`,
      })
      .from(s.orderItem)
      .innerJoin(s.order, sql`${s.order.id} = ${s.orderItem.orderId}`)
      .where(paidIn(from))
      .groupBy(s.orderItem.name)
      .orderBy(desc(sql`sum(${s.orderItem.price} * ${s.orderItem.quantity})`))
      .limit(10),
    db
      .select({ city: s.order.city, orders: sql<number>`count(*)::int`, revenue: sql<number>`sum(${s.order.total})::int` })
      .from(s.order)
      .where(paidIn(from))
      .groupBy(s.order.city)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db
      .select({ code: s.promoCode.code, uses: sql<number>`count(*)::int`, discount: sql<number>`sum(${s.order.discount})::int` })
      .from(s.order)
      .innerJoin(s.promoCode, sql`${s.promoCode.id} = ${s.order.promoCodeId}`)
      .where(paidIn(from))
      .groupBy(s.promoCode.code)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    // Новые покупатели: первая оплата — в этом периоде
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select user_id, min(paid_at) as first from "order"
        where status in ('PAID','ASSEMBLING','SHIPPED','DELIVERED') and paid_at is not null and user_id is not null
        group by user_id
      ) t where t.first >= ${from}`).then((r) => r.rows),
    // Доля заказов периода от тех, кто уже покупал раньше
    db.execute<{ n: number; total: number }>(sql`
      select count(*) filter (where exists (
        select 1 from "order" p where p.user_id = o.user_id and p.id <> o.id and p.paid_at < o.paid_at
          and p.status in ('PAID','ASSEMBLING','SHIPPED','DELIVERED')
      ))::int as n, count(*)::int as total
      from "order" o
      where o.status in ('PAID','ASSEMBLING','SHIPPED','DELIVERED') and o.paid_at >= ${from}`).then((r) => r.rows),
    db.select({ bonus: sql<number>`coalesce(sum(${s.user.bonusBalance}), 0)::int` }).from(s.user),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.order)
      .where(and(inArray(s.order.status, ["CANCELLED"]), gte(s.order.createdAt, from), sql`${s.order.paidAt} is null`)),
  ]);

  const map = new Map(byDay.map((d) => [d.day, d]));
  const revenueSeries = list.map((d) => ({ day: d, value: map.get(d)?.revenue ?? 0 }));
  const ordersSeries = list.map((d) => ({ day: d, value: map.get(d)?.orders ?? 0 }));
  const avg = totals.orders ? Math.round(totals.revenue / totals.orders / 100) * 100 : 0;
  const delta = (cur: number, was: number) => (was ? Math.round(((cur - was) / was) * 100) : null);
  const dRev = delta(totals.revenue, prev.revenue);
  const dOrd = delta(totals.orders, prev.orders);
  const repeatPct = repeat?.total ? Math.round((repeat.n / repeat.total) * 100) : 0;
  const trend = (d: number | null) =>
    d === null ? "нет данных за прошлый период" : `${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${Math.abs(d)}% к прошлым ${period} дн.`;

  const kpi = [
    { label: "Выручка", value: rub(totals.revenue), sub: trend(dRev) },
    { label: "Оплаченных заказов", value: num(totals.orders), sub: trend(dOrd) },
    { label: "Средний чек", value: rub(avg), sub: "с доставкой" },
    { label: "Новых покупателей", value: num(newBuyers?.n ?? 0), sub: `повторные заказы — ${repeatPct}%` },
    { label: "Скидки и бонусы", value: rub(totals.discount + totals.bonus), sub: `промокоды ${rub(totals.discount)} · бонусы ${rub(totals.bonus)}` },
    { label: "Бонусов на счетах", value: num(liability.bonus), sub: "1 бонус = 1 ₽ скидки для клиента" },
  ];

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Аналитика</h1>
        <div className="row">
          <nav className="tabs" aria-label="Период" style={{ margin: 0 }}>
            {PERIODS.map((p) => (
              <Link key={p} href={`?days=${p}`} aria-current={p === period ? "page" : undefined}>
                {p === 365 ? "Год" : `${p} дн.`}
              </Link>
            ))}
          </nav>
          <a className="btn btn--line btn--sm" href={`/admin/orders/export?days=${period}`}>
            Скачать заказы (Excel)
          </a>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {kpi.map((k) => (
          <div key={k.label} className="stat">
            <div className="muted small">{k.label}</div>
            <div className="stat__value">{k.value}</div>
            <div className="kpi__sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Выручка по дням</h2>
        <BarChart data={revenueSeries} unit="rub" label="Выручка по дням" />
      </div>
      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Заказы по дням</h2>
        <BarChart data={ordersSeries} unit="count" label="Оплаченные заказы по дням" />
        {abandoned.n > 0 && (
          <p className="muted small" style={{ margin: 0 }}>
            Не оплачено и отменено за период: {num(abandoned.n)} — <Link href="/admin/orders?status=CANCELLED">посмотреть</Link>
          </p>
        )}
      </div>

      <div className="grid-2">
        <div className="panel stack">
          <h2 style={{ marginBottom: 0 }}>Лучшие товары</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Шт.</th>
                <th>Выручка</th>
              </tr>
            </thead>
            <tbody>
              {top.map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td>{num(t.qty)}</td>
                  <td>{rub(t.revenue)}</td>
                </tr>
              ))}
              {!top.length && (
                <tr>
                  <td colSpan={3} className="muted">
                    Продаж за период нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="panel stack">
          <h2 style={{ marginBottom: 0 }}>Города</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Город</th>
                <th>Заказов</th>
                <th>Выручка</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <tr key={c.city ?? "—"}>
                  <td>{c.city ?? "—"}</td>
                  <td>{num(c.orders)}</td>
                  <td>{rub(c.revenue)}</td>
                </tr>
              ))}
              {!cities.length && (
                <tr>
                  <td colSpan={3} className="muted">
                    Нет данных
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {promos.length > 0 && (
        <div className="panel stack">
          <h2 style={{ marginBottom: 0 }}>Промокоды</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Заказов</th>
                <th>Скидка</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.code}>
                  <td>{p.code}</td>
                  <td>{num(p.uses)}</td>
                  <td>{rub(p.discount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
