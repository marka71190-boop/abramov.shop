"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AddToCart } from "@/components/cart/AddToCart";
import { useCart } from "@/components/cart/CartProvider";
import { goal } from "@/lib/track";
import { rub } from "@/lib/format";
import { ecommerce } from "@/lib/track";
import { Lightbox } from "./Lightbox";

export interface GalleryImage {
  url: string;
  alt: string;
  variantId: string | null;
  w: number | null;
  h: number | null;
}
interface Variant {
  id: string;
  name: string;
  price: number;
  stock: number;
}

/** Фото: сначала фото выбранного варианта, потом общие. Если у варианта своих нет — все фото товара. */
function photosFor(images: GalleryImage[], variantId: string | null, hasVariantPhotos: boolean) {
  if (!hasVariantPhotos || !variantId) return images.filter((i) => !i.variantId).length ? images.filter((i) => !i.variantId) : images;
  const own = images.filter((i) => i.variantId === variantId);
  const common = images.filter((i) => !i.variantId);
  return own.length ? [...own, ...common] : common.length ? common : images;
}

export function Gallery({ images, badge }: { images: GalleryImage[]; badge?: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const touch = useRef<number | null>(null);
  useEffect(() => setI(0), [images]);
  const cur = images[Math.min(i, images.length - 1)];
  const go = useCallback((d: number) => setI((x) => (x + d + images.length) % images.length), [images.length]);
  if (!cur) return <div className="gallery__main" style={{ aspectRatio: "1" }} />;
  // Кий во весь рост — очень длинное фото: рамка не ниже 2,2:1, а фото рассматривают в увеличении
  const long = !!(cur.w && cur.h && cur.w / cur.h > 2.2);
  const ratio = cur.w && cur.h ? (long ? "2.2" : `${cur.w} / ${cur.h}`) : "1";

  return (
    <div className="gallery">
      <div
        className="gallery__main"
        style={{ aspectRatio: ratio }}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
        tabIndex={images.length > 1 ? 0 : -1}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        aria-label={images.length > 1 ? `Фото ${i + 1} из ${images.length}` : undefined}
      >
        <img src={cur.url} alt={cur.alt} onClick={() => setOpen(true)} style={{ cursor: "zoom-in" }} />
        {badge && <span className="tag">{badge}</span>}
        {long && (
          <button type="button" className="gallery__long" onClick={() => setOpen(true)}>
            Рассмотреть кий целиком
          </button>
        )}
        <button type="button" className="gallery__zoom" aria-label="Открыть фото на весь экран" onClick={() => setOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
          </svg>
        </button>
        {images.length > 1 && (
          <>
            <button type="button" className="gallery__nav gallery__nav--prev" aria-label="Предыдущее фото" onClick={() => go(-1)}>
              ‹
            </button>
            <button type="button" className="gallery__nav gallery__nav--next" aria-label="Следующее фото" onClick={() => go(1)}>
              ›
            </button>
            <span className="gallery__count">
              {i + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="gallery__thumbs" role="tablist" aria-label="Фото товара">
          {images.map((im, n) => (
            <button key={im.url + n} type="button" role="tab" aria-selected={n === i} onClick={() => setI(n)}>
              <img src={im.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {open && <Lightbox images={images} start={Math.min(i, images.length - 1)} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function ProductView({
  images,
  variants,
  initialVariantId,
  basePrice,
  oldPrice,
  maxPerItem,
  badge,
  head,
  buyFallback,
  extra,
  body,
  track,
}: {
  track: { id: string; name: string };
  images: GalleryImage[];
  variants: Variant[];
  initialVariantId: string | null;
  basePrice: number;
  oldPrice: number | null;
  maxPerItem: number;
  badge?: string;
  head: React.ReactNode;
  /** Что показать вместо кнопки покупки, если товара нет совсем */
  buyFallback: React.ReactNode | null;
  extra: React.ReactNode;
  body: React.ReactNode;
}) {
  const [vid, setVid] = useState<string | null>(initialVariantId);
  const buyRef = useRef<HTMLDivElement>(null);
  const [sticky, setSticky] = useState(false);
  const hasVariantPhotos = images.some((i) => i.variantId);
  const shown = useMemo(() => photosFor(images, vid, hasVariantPhotos), [images, vid, hasVariantPhotos]);
  const v = variants.find((x) => x.id === vid) ?? variants[0];
  const multi = variants.length > 1;

  // Метрика: просмотр товара (и смена варианта)
  useEffect(() => {
    if (v) ecommerce("detail", [{ id: track.id, name: track.name, price: v.price / 100, variant: multi ? v.name : undefined }]);
  }, [v, track.id, track.name, multi]);

  // Кнопка покупки ушла вверх за экран — показываем полосу «В корзину» внизу (на телефоне)
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setSticky(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const canBuy = !buyFallback && !!v && v.stock > 0;
  useEffect(() => {
    document.body.classList.toggle("has-buybar", sticky && canBuy);
    return () => document.body.classList.remove("has-buybar");
  }, [sticky, canBuy]);

  const pick = (id: string) => {
    setVid(id);
    // Ссылка на выбранный вариант — её можно скопировать и отправить
    const url = new URL(window.location.href);
    url.searchParams.set("v", id);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="pp">
      <Gallery images={shown} badge={badge} />
      <div className="pp__info">
        {head}
        <div className="price-big">
          {rub(v?.price ?? basePrice)}
          {oldPrice && (v?.price ?? basePrice) < oldPrice ? <span className="old-price">{rub(oldPrice)}</span> : null}
        </div>
        {multi && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="label">
              Вариант: <span style={{ color: "var(--c-text)" }}>{v?.name}</span>
            </div>
            <div className="variants" role="radiogroup" aria-label="Вариант">
              {variants.map((x) => {
                const thumb = images.find((i) => i.variantId === x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={x.id === v?.id}
                    className={`variant${thumb ? " variant--photo" : ""}`}
                    onClick={() => pick(x.id)}
                    title={x.stock <= 0 ? "Нет в наличии" : undefined}
                    data-out={x.stock <= 0 || undefined}
                  >
                    {thumb && <img src={thumb.url} alt="" />}
                    <span>{x.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div ref={buyRef}>
        {buyFallback ??
          (v && v.stock <= 0 ? (
            <button className="btn btn--line btn--block" disabled>
              Этого варианта нет в наличии
            </button>
          ) : (
            <AddToCart key={v?.id} variants={variants} selectedId={v?.id} showPicker={false} maxPerItem={maxPerItem} track={track} />
          ))}
        </div>
        {extra}
        {body}
      </div>
      {canBuy && v && <BuyBar show={sticky} name={track.name} variant={multi ? v.name : null} price={v.price} variantId={v.id} stock={v.stock} maxPerItem={maxPerItem} track={track} multi={multi} />}
    </div>
  );
}

/** Полоса внизу экрана на телефоне: цена и «В корзину», когда основная кнопка уехала вверх */
function BuyBar({
  show,
  name,
  variant,
  price,
  variantId,
  stock,
  maxPerItem,
  track,
  multi,
}: {
  show: boolean;
  name: string;
  variant: string | null;
  price: number;
  variantId: string;
  stock: number;
  maxPerItem: number;
  track: { id: string; name: string };
  multi: boolean;
}) {
  const cart = useCart();
  const inCart = cart.items.find((i) => i.variantId === variantId)?.qty ?? 0;
  const left = Math.min(stock, maxPerItem) - inCart;
  return (
    <div className={`buybar${show ? " is-on" : ""}`} aria-hidden={!show}>
      <div className="buybar__info">
        <span className="buybar__name">{variant ? `${name} · ${variant}` : name}</span>
        <b className="buybar__price">{rub(price)}</b>
      </div>
      {inCart > 0 ? (
        <Link href="/cart" className="btn btn--gold btn--sm" tabIndex={show ? 0 : -1}>
          В корзине · оформить
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn--gold btn--sm"
          tabIndex={show ? 0 : -1}
          disabled={left <= 0}
          onClick={() => {
            cart.add(variantId, 1);
            goal("add_to_cart");
            ecommerce("add", [{ id: track.id, name: track.name, price: price / 100, quantity: 1, variant: multi ? (variant ?? undefined) : undefined }]);
          }}
        >
          В корзину
        </button>
      )}
    </div>
  );
}
