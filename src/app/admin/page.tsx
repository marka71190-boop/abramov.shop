import { and, gte, isNotNull, ne } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { num } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export default async function AdminHome() {
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const [users, usersToday, consentsToday, banned, hiddenPages, hiddenCats, settings] = await Promise.all([
    db.$count(s.user),
    db.$count(s.user, gte(s.user.createdAt, dayAgo)),
    db.$count(s.consent, gte(s.consent.createdAt, dayAgo)),
    db.$count(s.user, isNotNull(s.user.bannedAt)),
    db.$count(s.page, ne(s.page.visibility, "PUBLISHED")),
    db.$count(s.category, and(ne(s.category.visibility, "PUBLISHED"))),
    getSettings(),
  ]);

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
        {stats.map((x) => (
          <Link key={x.label} href={x.href} className="stat" style={{ color: "inherit", textDecoration: "none" }}>
            <div className="muted small">{x.label}</div>
            <div className="stat__value">{num(x.value)}</div>
          </Link>
        ))}
      </div>
      <div className="panel">
        <h2>Что дальше</h2>
        <p className="muted" style={{ margin: 0 }}>
          Заказы, промокоды, товары с фото и вариантами, оплата ЮKassa и доставка СДЭК появятся здесь на следующих этапах.
        </p>
      </div>
    </>
  );
}
