"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddToCart } from "@/components/cart/AddToCart";
import { rub } from "@/lib/format";

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
  const touch = useRef<number | null>(null);
  useEffect(() => setI(0), [images]);
  const cur = images[Math.min(i, images.length - 1)];
  const go = useCallback((d: number) => setI((x) => (x + d + images.length) % images.length), [images.length]);
  if (!cur) return <div className="gallery__main" style={{ aspectRatio: "1" }} />;
  const ratio = cur.w && cur.h ? `${cur.w} / ${cur.h}` : "1";

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
        <img src={cur.url} alt={cur.alt} />
        {badge && <span className="tag">{badge}</span>}
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
}: {
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
  const hasVariantPhotos = images.some((i) => i.variantId);
  const shown = useMemo(() => photosFor(images, vid, hasVariantPhotos), [images, vid, hasVariantPhotos]);
  const v = variants.find((x) => x.id === vid) ?? variants[0];
  const multi = variants.length > 1;

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
        {buyFallback ??
          (v && v.stock <= 0 ? (
            <button className="btn btn--line btn--block" disabled>
              Этого варианта нет в наличии
            </button>
          ) : (
            <AddToCart key={v?.id} variants={variants} selectedId={v?.id} showPicker={false} maxPerItem={maxPerItem} />
          ))}
        {extra}
        {body}
      </div>
    </div>
  );
}
