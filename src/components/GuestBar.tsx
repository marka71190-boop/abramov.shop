"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GUEST_BAR_COOKIE } from "@/lib/guest-bar";

/** Полоса для гостей: заказ оформляется в личном кабинете — сразу видно, что нужна регистрация */
export function GuestBar({ welcome }: { welcome: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(true);
  if (!open || path.startsWith("/checkout")) return null;
  const next = encodeURIComponent(path === "/" ? "/catalog" : path);
  const close = () => {
    document.cookie = `${GUEST_BAR_COOKIE}=0; path=/; max-age=${3 * 86400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    setOpen(false);
  };
  return (
    <div className="guest-bar" role="region" aria-label="Регистрация">
      <span className="guest-bar__text">
        Заказы оформляются в личном кабинете. <b>Регистрация — 1 минута</b>
        <span className="guest-bar__more">{welcome > 0 ? `, и ${welcome.toLocaleString("ru-RU")} бонусов сразу в подарок` : ", бонусы с первой покупки"}</span>
      </span>
      <span className="guest-bar__actions">
        <Link href={`/register?next=${next}`} className="guest-bar__btn">
          Зарегистрироваться
        </Link>
        <Link href={`/login?next=${next}`} className="guest-bar__link">
          Войти
        </Link>
      </span>
      <button type="button" className="guest-bar__close" aria-label="Скрыть" onClick={close}>
        ×
      </button>
    </div>
  );
}
