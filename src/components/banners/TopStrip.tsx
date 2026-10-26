"use client";
import { useEffect, useState } from "react";
import { STRIP_COOKIE, type PublicBanner } from "@/lib/banners-shared";
import { BannerLink } from "./BannerLink";
import { Countdown } from "./Countdown";

/** Тонкая полоса над шапкой. Несколько объявлений сменяют друг друга; крестик скрывает их на неделю */
export function TopStrip({ items }: { items: PublicBanner[] }) {
  const [list, setList] = useState(items);
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (list.length < 2 || hover) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % list.length), 5000);
    return () => clearInterval(t);
  }, [list.length, hover]);

  if (!list.length) return null;
  const b = list[i % list.length];

  const close = () => {
    const prev = document.cookie.match(new RegExp(`(?:^|; )${STRIP_COOKIE}=([^;]*)`))?.[1] ?? "";
    const ids = [...new Set([...decodeURIComponent(prev).split(".").filter(Boolean), ...list.map((x) => x.id)])].slice(-20);
    document.cookie = `${STRIP_COOKIE}=${encodeURIComponent(ids.join("."))}; path=/; max-age=${7 * 86400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    setList([]);
  };

  const body = (
    <>
      {b.label && <b className="strip__label">{b.label}</b>}
      <span className="strip__text">
        {b.title || b.text}
        {b.title && b.text && <span className="strip__extra"> — {b.text}</span>}
      </span>
      {b.countdown && b.endsAt && <Countdown until={b.endsAt} className="strip__timer" prefix="Осталось" />}
      {b.url && (
        <span className="strip__more">
          <span className="strip__more-t">{b.buttonText || "Подробнее"} </span>→
        </span>
      )}
    </>
  );

  return (
    <div
      className={`strip strip--${b.tone === "red" ? "red" : b.tone === "dark" ? "dark" : "gold"}`}
      role="region"
      aria-label="Объявление"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="strip__inner" key={b.id}>
        {b.url ? (
          <BannerLink id={b.id} title={b.title || b.text} url={b.url} className="strip__link">
            {body}
          </BannerLink>
        ) : (
          <span className="strip__link">{body}</span>
        )}
      </div>
      {list.length > 1 && (
        <span className="strip__count" aria-hidden>
          {(i % list.length) + 1}/{list.length}
        </span>
      )}
      <button type="button" className="strip__close" onClick={close} aria-label="Скрыть объявление">
        ×
      </button>
    </div>
  );
}
