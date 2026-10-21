"use client";
/**
 * Плашка «акция по таймеру»: покупатель пришёл по ссылке из письма (?promo=КОД) — показываем,
 * что даёт промокод и сколько ещё он действует. Скрывается, когда время вышло или покупатель закрыл её.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { storedPromo } from "./CartProvider";

type Info = { code: string; headline: string; endsAt: string | null; needLogin: boolean };
const HIDE_KEY = "as_promo_timer_hidden";

const pad = (n: number) => String(n).padStart(2, "0");
function left(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d ? `${d} д ${hms}` : hms;
}

export function PromoTimer() {
  const path = usePathname();
  const [info, setInfo] = useState<Info | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get("promo");
    const code = (fromUrl && /^[A-Z0-9_-]{2,40}$/i.test(fromUrl) ? fromUrl.toUpperCase() : null) ?? storedPromo();
    if (!code) return setInfo(null);
    try {
      if (sessionStorage.getItem(HIDE_KEY) === code) return setInfo(null);
    } catch {}
    let alive = true;
    fetch(`/api/promo/timer?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setInfo(d.ok ? d : null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);

  const ends = info?.endsAt ? +new Date(info.endsAt) : null;
  // Таймер показываем, когда до конца меньше 3 суток; промокод «по таймеру» без входа — с подсказкой войти
  const show = !!info && (info.needLogin || (ends != null && ends > now && ends - now < 3 * 86400_000));

  useEffect(() => {
    if (!show || !ends) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [show, ends]);

  if (!show || !info) return null;
  const hide = () => {
    try {
      sessionStorage.setItem(HIDE_KEY, info.code);
    } catch {}
    setInfo(null);
  };
  return (
    <div className="promo-timer" role="status">
      <div className="container promo-timer__inner">
        <span>
          <b>{info.headline}</b> по промокоду <code>{info.code}</code>
        </span>
        {info.needLogin ? (
          <Link href={`/login?next=${encodeURIComponent(path || "/")}`} className="promo-timer__cta">
            Войдите — покажем, сколько осталось
          </Link>
        ) : (
          <span className="promo-timer__clock" aria-label="Осталось">
            ⏱ осталось <b>{left(ends! - now)}</b>
          </span>
        )}
        {!path.startsWith("/checkout") && !path.startsWith("/cart") && (
          <Link href="/catalog" className="promo-timer__cta">
            Выбрать товары →
          </Link>
        )}
        <button type="button" className="promo-timer__x" aria-label="Скрыть" onClick={hide}>
          ×
        </button>
      </div>
    </div>
  );
}
