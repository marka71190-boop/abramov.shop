"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CONSENT_EVENT, CONSENT_KEY, readConsent } from "./Analytics";

/** Баннер о cookie: аналитика (Метрика) включается только после «Принять». */
export function CookieBanner({ analytics }: { analytics: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (analytics && !readConsent()) setShow(true);
  }, [analytics]);
  if (!show) return null;

  const choose = (v: "all" | "necessary") => {
    try {
      localStorage.setItem(CONSENT_KEY, v);
    } catch {}
    window.dispatchEvent(new Event(CONSENT_EVENT));
    setShow(false);
  };

  return (
    <div className="cookie" role="dialog" aria-label="Файлы cookie">
      <p>
        Мы используем cookie: необходимые — чтобы работали вход и корзина, аналитические (Яндекс Метрика) — чтобы делать магазин удобнее.
        Подробнее — в <Link href="/p/privacy">политике конфиденциальности</Link>.
      </p>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button type="button" className="btn btn--line btn--sm" onClick={() => choose("necessary")}>
          Только необходимые
        </button>
        <button type="button" className="btn btn--gold btn--sm" onClick={() => choose("all")}>
          Принять
        </button>
      </div>
    </div>
  );
}
