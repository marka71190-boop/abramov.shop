"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Обзор", exact: true },
  { href: "/admin/orders", label: "Заказы" },
  { href: "/admin/customers", label: "Клиенты" },
  { href: "/admin/consents", label: "Журнал согласий" },
  { href: "/admin/pages", label: "Страницы" },
  { href: "/admin/catalog", label: "Каталог" },
  { href: "/admin/promo", label: "Промокоды" },
  { href: "/admin/settings", label: "Настройки", owner: true },
  { href: "/admin/audit", label: "Журнал действий" },
];

export function AdminNav({ owner }: { owner: boolean }) {
  const path = usePathname();
  return (
    <>
      {LINKS.filter((l) => !l.owner || owner).map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
      <Link href="/" style={{ marginTop: "auto" }}>
        ← На сайт
      </Link>
    </>
  );
}
