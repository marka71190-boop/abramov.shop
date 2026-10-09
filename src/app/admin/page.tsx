import { and, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { num, rub } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export default async function AdminHome() {
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600_000);
  const PAID_STATES = ["PAID", "ASSEMBLING", "SHIPPED", "DELIVERED"] as const;
  const [toShip, paidToday, [revenue], awaiting] = await Promise.all([
    db.$count(s.order, inArray(s.order.status, ["PAID", "ASSEMBLING"])),
    db.$count(s.order, and(inArray(s.order.status, [...PAID_STATES]), gte(s.order.paidAt, dayAgo))),
    db
      .select({ sum: sql<number>`coalesce(sum(${s.order.total}), 0)::int` })
      .from(s.order)
      .where(and(inArray(s.order.status, [...PAID_STATES]), gte(s.order.paidAt, monthAgo))),
    db.$count(s.order, eq(s.order.status, "AWAITING_PAYMENT")),
  ]);
  const [users, usersToday, consentsToday, banned, hiddenPages, hiddenCats, settings] = await Promise.all([
    db.$count(s.user),
    db.$count(s.user, gte(s.user.createdAt, dayAgo)),
    db.$count(s.consent, gte(s.consent.createdAt, dayAgo)),
    db.$count(s.user, isNotNull(s.user.bannedAt)),
    db.$count(s.page, ne(s.page.visibility, "PUBLISHED")),
    db.$count(s.category, and(ne(s.category.visibility, "PUBLISHED"))),
    getSettings(),
  ]);

  const orderStats = [
    { label: "Отправить", value: num(toShip), href: "/admin/orders?status=PAID" },
    { label: "Оплачено за сутки", value: num(paidToday), href: "/admin/orders" },
    { label: "Выручка за 30 дней", value: rub(revenue.sum), href: "/admin/orders" },
    { label: "Ждут оплату", value: num(awaiting), href: "/admin/orders?status=AWAITING_PAYMENT" },
  ];
  const stats = [
    { label: "Клиентов", value: users, href: "/admin/customers" },
    { label: "Новых за сутки", value: usersToday, href: "/admin/customers" },
    { label: "Согласий за сутки", value: consentsToday, href: "/admin/consents" },
    { label: "Заблокировано", value: banned, href: "/admin/customers?status=banned" },
    { label: "Скрытых страниц", value: hiddenPages, href: "/admin/pages" },
    { label: "Скрытых категорий", value: hiddenCats, href: "/admin/catalog" },
  ];

  return (
    <>
      <h1>Обзор</h1>
      {settings.maintenance && (
        <div className="form-error">
          Включён режим техработ — покупатели видят заглушку. <Link href="/admin/settings">Настройки</Link>
        </div>
      )}
      <div className="stats">
        {orderStats.map((x) => (
          <Link key={x.label} href={x.href} className="stat" style={{ color: "inherit", textDecoration: "none" }}>
            <div className="muted small">{x.label}</div>
            <div className="stat__value">{x.value}</div>
          </Link>
        ))}
      </div>
      <div className="stats">
        {stats.map((x) => (
          <Link key={x.label} href={x.href} className="stat" style={{ color: "inherit", textDecoration: "none" }}>
            <div className="muted small">{x.label}</div>
            <div className="stat__value">{num(x.value)}</div>
          </Link>
        ))}
      </div>

    </>
  );
}
