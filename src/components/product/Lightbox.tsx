"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface LightboxImage {
  url: string;
  alt: string;
  w: number | null;
  h: number | null;
}

const MAX_ZOOM = 4; // во сколько раз можно увеличить сверх «целиком»
const LONG = 2.6; // фото длиннее — это кий во весь рост: открываем крупнее и листаем вдоль

/**
 * Фото на весь экран: увеличение щипком, колесом с Ctrl или трекпадом, двойным тапом и кнопками;
 * увеличенное фото двигается пальцем/мышью. Длинное фото кия открывается крупно — его листают вдоль.
 */
export function Lightbox({ images, start, onClose }: { images: LightboxImage[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ x: number; y: number; from: number } | null>(null);
  const img = images[i];

  // Размер окна
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const upd = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Размер фото: из базы или после загрузки
  useEffect(() => {
    setScale(0);
    if (img?.w && img?.h) setSize({ w: img.w, h: img.h });
    else setSize(null);
  }, [img]);

  const fit = size && vp.w ? Math.min(vp.w / size.w, vp.h / size.h) : 0;
  const long = !!size && size.w / size.h >= LONG;
  // Длинный кий: по высоте — половина экрана, но не мельче «целиком»
  const initial = size && vp.w ? (long ? Math.max(fit, Math.min((vp.h * 0.55) / size.h, fit * MAX_ZOOM)) : fit) : 0;
  const cur = scale || initial;
  const max = Math.max(initial, fit * MAX_ZOOM, 1);
  const zoomed = cur > fit * 1.02;

  // Первый показ длинного фото — с начала (турняк), обычного — по центру
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !initial || scale) return;
    el.scrollLeft = 0;
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  }, [initial, scale]);

  // Увеличение вокруг точки (x, y) в окне
  const zoomTo = useCallback(
    (next: number, x?: number, y?: number) => {
      const el = box.current;
      if (!el || !cur) return;
      const s1 = Math.min(max, Math.max(fit, next));
      anchor.current = { x: x ?? el.clientWidth / 2, y: y ?? el.clientHeight / 2, from: cur };
      setScale(s1);
    },
    [cur, fit, max],
  );
  useLayoutEffect(() => {
    const el = box.current;
    const a = anchor.current;
    if (!el || !a || !size) return;
    anchor.current = null;
    // Фото меньше окна стоит по центру — учитываем отступ
    const off = (s: number) => ({ x: Math.max(0, (el.clientWidth - size.w * s) / 2), y: Math.max(0, (el.clientHeight - size.h * s) / 2) });
    const o0 = off(a.from);
    const o1 = off(cur);
    const px = (el.scrollLeft + a.x - o0.x) / a.from;
    const py = (el.scrollTop + a.y - o0.y) / a.from;
    el.scrollLeft = px * cur + o1.x - a.x;
    el.scrollTop = py * cur + o1.y - a.y;
  }, [cur, size]);

  const go = useCallback((d: number) => setI((x) => (x + d + images.length) % images.length), [images.length]);

  // Клавиши, запрет прокрутки страницы под окном
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && !zoomedRef.current) go(1);
      if (e.key === "ArrowLeft" && !zoomedRef.current) go(-1);
      if (e.key === "+" || e.key === "=") zoomRef.current(curRef.current * 1.6);
      if (e.key === "-") zoomRef.current(curRef.current / 1.6);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose]);
  const zoomedRef = useRef(zoomed);
  const zoomRef = useRef(zoomTo);
  const curRef = useRef(cur);
  zoomedRef.current = zoomed;
  zoomRef.current = zoomTo;
  curRef.current = cur;

  // Щипок, трекпад и Ctrl+колесо — свои обработчики (passive: false, чтобы браузер не масштабировал страницу)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let pinch: { d: number; s: number } | null = null;
    let swipe: { x: number; y: number; t: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => {
      const r = el.getBoundingClientRect();
      return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top };
    };
    const ts = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch = { d: dist(e.touches), s: curRef.current };
        swipe = null;
      } else if (e.touches.length === 1) swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    };
    const tm = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const m = mid(e.touches);
        zoomRef.current((pinch.s * dist(e.touches)) / pinch.d, m.x, m.y);
      }
    };
    const te = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (swipe && e.changedTouches.length === 1 && !zoomedRef.current && !(el.scrollWidth > el.clientWidth + 2)) {
        const dx = e.changedTouches[0].clientX - swipe.x;
        const dy = e.changedTouches[0].clientY - swipe.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - swipe.t < 600) go(dx < 0 ? 1 : -1);
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
      }
      swipe = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(curRef.current * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te, { passive: true });
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
      el.removeEventListener("wheel", wheel);
    };
  }, [go, onClose]);

  // Мышью: тянем увеличенное фото
  const drag = useRef<{ x: number; y: number; l: number; t: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const onDouble = (x: number, y: number) => (zoomed || (long && cur > initial * 1.02) ? zoomTo(long ? initial : fit, x, y) : zoomTo(Math.max(cur * 2.5, fit * 2.5), x, y));

  if (!img) return null;
  const w = size ? Math.round(size.w * cur) : undefined;
  const h = size ? Math.round(size.h * cur) : undefined;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Фото товара">
      <div className="lightbox__bar">
        <span className="lightbox__count">{images.length > 1 ? `${i + 1} / ${images.length}` : ""}</span>
        <div className="lightbox__tools">
          <button type="button" onClick={() => zoomTo(cur / 1.6)} disabled={!zoomed && !(long && cur > fit * 1.02)} aria-label="Уменьшить">
            −
          </button>
          <button type="button" onClick={() => zoomTo(cur * 1.6)} disabled={cur >= max * 0.99} aria-label="Увеличить">
            +
          </button>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="lightbox__close">
            ✕
          </button>
        </div>
      </div>
      <div
        ref={box}
        className={`lightbox__view${zoomed ? " is-zoomed" : ""}`}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const el = box.current!;
          drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop, moved: false };
        }}
        onMouseMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          box.current!.scrollLeft = d.l - dx;
          box.current!.scrollTop = d.t - dy;
        }}
        onMouseUp={() => setTimeout(() => (drag.current = null))}
        onMouseLeave={() => (drag.current = null)}
        onClick={(e) => {
          if (drag.current?.moved) return;
          const r = box.current!.getBoundingClientRect();
          const now = Date.now();
          // Двойной клик/тап — увеличить в этой точке или вернуть
          if (now - lastTap.current < 300) {
            onDouble(e.clientX - r.left, e.clientY - r.top);
            lastTap.current = 0;
          } else lastTap.current = now;
        }}
      >
        <div className="lightbox__stage" style={w && h ? { width: Math.max(w, vp.w), height: Math.max(h, vp.h) } : undefined}>
          <img
            key={img.url}
            src={img.url}
            alt={img.alt}
            draggable={false}
            style={w && h ? { width: w, height: h } : { maxWidth: "100%", maxHeight: "100%" }}
            onLoad={(e) => {
              if (!size) setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
            }}
          />
        </div>
      </div>
      {images.length > 1 && (
        <>
          <button type="button" className="lightbox__nav lightbox__nav--prev" aria-label="Предыдущее фото" onClick={() => go(-1)}>
            ‹
          </button>
          <button type="button" className="lightbox__nav lightbox__nav--next" aria-label="Следующее фото" onClick={() => go(1)}>
            ›
          </button>
          <div className="lightbox__thumbs">
            {images.map((im, n) => (
              <button key={im.url + n} type="button" aria-label={`Фото ${n + 1}`} aria-current={n === i || undefined} onClick={() => setI(n)}>
                <img src={im.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="lightbox__hint">{long ? "Листайте вдоль кия · " : ""}Двойной тап или щипок — увеличить</div>
    </div>
  );
}
