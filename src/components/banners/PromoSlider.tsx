"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicBanner } from "@/lib/banners-shared";
import { BannerLink } from "./BannerLink";
import { Countdown } from "./Countdown";

const AUTOPLAY_MS = 6500;

/** Слайдер акций вверху главной: листается пальцем, стрелками, точками и сам по себе */
export function PromoSlider({ slides }: { slides: PublicBanner[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const many = slides.length > 1;

  const go = useCallback(
    (i: number, smooth = true) => {
      const el = track.current;
      if (!el) return;
      const n = (i + slides.length) % slides.length;
      el.scrollTo({ left: n * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
    },
    [slides.length],
  );

  // Текущий слайд — по положению прокрутки (работает и для свайпа)
  useEffect(() => {
    const el = track.current;
    if (!el || !many) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [many]);

  // Автопрокрутка: не при наведении, фокусе, скрытой вкладке и «уменьшить движение»
  useEffect(() => {
    if (!many || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") go(idx + 1);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [many, paused, idx, go]);

  return (
    <section
      className="promo"
      aria-roledescription="карусель"
      aria-label="Акции и новинки"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === "ArrowRight") go(idx + 1);
        if (e.key === "ArrowLeft") go(idx - 1);
      }}
    >
      <div className="promo__track" ref={track}>
        {slides.map((b, i) => {
          const copy = !!(b.title || b.text || b.label);
          return (
            <div
              key={b.id}
              className={`promo__slide promo__slide--${b.tone === "light" ? "light" : "dark"}${b.image ? "" : " promo__slide--plain"}${b.imageMobile ? " promo__slide--sq" : ""}`}
              role="group"
              aria-roledescription="слайд"
              aria-label={`${i + 1} из ${slides.length}${b.title ? `: ${b.title}` : ""}`}
              aria-hidden={many && i !== idx ? true : undefined}
              inert={many && i !== idx ? true : undefined}
            >
              {b.image && (
                <picture>
                  {b.imageMobile && <source media="(max-width: 640px)" srcSet={b.imageMobile} />}
                  <img
                    className="promo__img"
                    src={b.image}
                    alt={copy ? "" : b.buttonText || "Акция"}
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "auto"}
                    decoding="async"
                  />
                </picture>
              )}
              {b.url && <BannerLink id={b.id} title={b.title} url={b.url} className="promo__hit" hidden={copy && !!b.buttonText} label={b.title || b.buttonText || "Подробнее"} />}
              {copy && (
                <div className="container promo__body">
                  <div className="promo__copy">
                    {b.label && <div className="eyebrow promo__label">{b.label}</div>}
                    {b.title && <p className="promo__title">{b.title}</p>}
                    {b.text && <p className="promo__text">{b.text}</p>}
                    {b.countdown && b.endsAt && <Countdown until={b.endsAt} className="promo__timer" />}
                    {b.url && b.buttonText && (
                      <BannerLink id={b.id} title={b.title} url={b.url} className={`btn btn--cut ${b.tone === "light" ? "btn--dark" : "btn--gold"}`}>
                        {b.buttonText} <span aria-hidden>→</span>
                      </BannerLink>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {many && (
        <>
          <button type="button" className="promo__arrow promo__arrow--prev" onClick={() => go(idx - 1)} aria-label="Предыдущий слайд">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <button type="button" className="promo__arrow promo__arrow--next" onClick={() => go(idx + 1)} aria-label="Следующий слайд">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <div className="promo__dots">
            {slides.map((b, i) => (
              <button
                key={b.id}
                type="button"
                className="promo__dot"
                aria-label={`Слайд ${i + 1}`}
                aria-current={i === idx ? "true" : undefined}
                onClick={() => go(i)}
              >
                {i === idx && !paused && <span className="promo__progress" style={{ animationDuration: `${AUTOPLAY_MS}ms` }} key={idx} />}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
