"use client";
/**
 * Нижнее меню, как в приложениях: только когда сайт открыт с экрана «Домой» (установленное приложение).
 * В обычном браузере его нет — там своя шапка и адресная строка.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { isStandalone } from "./pwa";

const HIDE = ["/checkout", "/pay"];

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  catalog: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  cart: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zM17 20.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z",
  card: "M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM3 10h18M7 15h4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5",
};

export function AppTabbar() {
  const path = usePathname();
  const { count } = useCart();
  const [app, setApp] = useState(false);

  useEffect(() => {
    const on = isStandalone();
    setApp(on);
    document.documentElement.classList.toggle("is-app", on);
  }, []);

  if (!app || HIDE.some((p) => path.startsWith(p))) return null;

  const tabs: { href: string; label: string; icon: keyof typeof ICONS; on: boolean; badge?: number }[] = [
    { href: "/", label: "Главная", icon: "home", on: path === "/" },
    { href: "/catalog", label: "Каталог", icon: "catalog", on: path.startsWith("/catalog") || path.startsWith("/product") },
    { href: "/cart", label: "Корзина", icon: "cart", on: path.startsWith("/cart"), badge: count },
    { href: "/account/card", label: "Карта", icon: "card", on: path.startsWith("/account/card") },
    { href: "/account", label: "Профиль", icon: "user", on: path.startsWith("/account") && !path.startsWith("/account/card") },
  ];

  return (
    <nav className="tabbar" aria-label="Меню приложения">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`tabbar__item${t.on ? " is-on" : ""}`} aria-current={t.on ? "page" : undefined}>
          <span className="tabbar__icon">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS[t.icon]} />
            </svg>
            {!!t.badge && <span className="tabbar__badge">{t.badge > 99 ? "99+" : t.badge}</span>}
          </span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
