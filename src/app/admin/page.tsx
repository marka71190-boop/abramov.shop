import { and, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { num, rub } from "@/lib/format";
import { openReturnsCount } from "@/lib/returns";
import { lowStockCount } from "@/lib/low-stock";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import { PushToggle } from "@/components/pwa/PushToggle";
import { pushPublicKey } from "@/lib/push";

export default async function AdminHome() {
  const me = await requireAdmin();
  const owner = me.role === "OWNER";
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600_000);
  const PAID_STATES = ["PAID", "ASSEMBLING", "SHIPPED", "DELIVERED"] as const;
  const [toShip, paidToday, [revenue], awaiting, returnsOpen, lowStock, questionsNew] = await Promise.all([
    db.$count(s.order, inArray(s.order.status, ["PAID", "ASSEMBLING"])),
    db.$count(s.order, and(inArray(s.order.status, [...PAID_STATES]), gte(s.order.paidAt, dayAgo))),
    db
      .select({ sum: sql<number>`coalesce(sum(${s.order.total}), 0)::int` })
      .from(s.order)
      .where(and(inArray(s.order.status, [...PAID_STATES]), gte(s.order.paidAt, monthAgo))),
    db.$count(s.order, eq(s.order.status, "AWAITING_PAYMENT")),
    openReturnsCount(),
    lowStockCount(),
    db.$count(s.productQuestion, eq(s.productQuestion.status, "NEW")),
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
    // Выручку видит только владелец
    ...(owner ? [{ label: "Выручка за 30 дней", value: rub(revenue.sum), href: "/admin/analytics" }] : []),
    { label: "Ждут оплату", value: num(awaiting), href: "/admin/orders?status=AWAITING_PAYMENT" },
    { label: "Заявки на возврат", value: num(returnsOpen), href: "/admin/returns" },
    { label: "Заканчивается товаров", value: num(lowStock), href: "/admin/stock?f=low" },
    { label: "Вопросы без ответа", value: num(questionsNew), href: "/admin/questions" },
  ];
  const stats = [
    { label: "Клиентов", value: users, href: "/admin/customers" },
    { label: "Новых за сутки", value: usersToday, href: "/admin/customers" },
    ...(owner ? [{ label: "Согласий за сутки", value: consentsToday, href: "/admin/consents" }] : []),
    { label: "Заблокировано", value: banned, href: "/admin/customers?status=banned" },
    ...(owner ? [{ label: "Скрытых страниц", value: hiddenPages, href: "/admin/pages" }] : []),
    { label: "Скрытых категорий", value: hiddenCats, href: "/admin/catalog" },
  ];

  return (
    <>
      <h1>Обзор</h1>
      {pushPublicKey() && (
        <details className="panel" style={{ marginBottom: 16 }}>
          <summary>Уведомления о новых заказах на этот телефон или компьютер</summary>
          <div className="stack" style={{ marginTop: 12, gap: 8 }}>
            <p className="small muted" style={{ margin: 0 }}>
              Придут оплаченные заказы, возвраты, заявки в мастерскую и «Клуб под ключ» — то же, что в Telegram. На телефоне удобнее из установленного
              приложения: <Link href="/app">как установить</Link>.
            </p>
            <PushToggle publicKey={pushPublicKey()} signedIn what="новые заказы и заявки" />
          </div>
        </details>
      )}
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
