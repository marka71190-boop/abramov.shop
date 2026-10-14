"use client";
import Link from "next/link";
import { useState } from "react";
import { rub } from "@/lib/format";
import type { RatingInfo } from "@/lib/reviews";
import { FavoriteButton } from "./FavoriteButton";
import { Stars } from "./Stars";

interface CardVariant {
  id: string;
  name: string;
  stock: number;
  price: number;
  image: string | null;
}

interface CardProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  oldPrice: number | null;
  stock: number;
  image: { url: string; alt: string } | null;
  variants?: CardVariant[];
}

const MAX_CHIPS = 6;

export function ProductCard({ p, rating, favorite }: { p: CardProduct; rating?: RatingInfo; favorite: boolean }) {
  const variants = p.variants ?? [];
  const multi = variants.length > 1;
  const [hover, setHover] = useState<CardVariant | null>(null);
  const prices = variants.map((v) => v.price);
  const min = prices.length ? Math.min(...prices) : p.price;
  const max = prices.length ? Math.max(...prices) : p.price;
  const shown = hover?.image ?? p.image?.url ?? null;
  const href = (v?: CardVariant) => `/product/${p.slug}${v ? `?v=${v.id}` : ""}`;
  const inStock = variants.filter((v) => v.stock > 0).length;

  return (
    <div className="pcard-wrap">
      <div className="pcard">
        <Link href={href(hover ?? undefined)} className="pcard__link" aria-label={p.name}>
          {shown ? <img className="pcard__img" src={shown} alt={p.image?.alt ?? p.name} /> : <div className="pcard__img" />}
        </Link>
        <div className="pcard__body">
          <Link href={href()} className="pcard__name">
            {p.name}
          </Link>
          {rating && (
            <div className="row small" style={{ gap: 6 }}>
              <Stars value={rating.avg} size={14} /> <span className="muted">{rating.count}</span>
            </div>
          )}
          <div className="pcard__price">
            {multi && min !== max ? `от ${rub(min)}` : rub(hover?.price ?? min)}
            {p.oldPrice && p.oldPrice > min ? <span className="old-price">{rub(p.oldPrice)}</span> : null}
          </div>
          {multi && (
            <div className="pcard__variants" onMouseLeave={() => setHover(null)}>
              {variants.slice(0, MAX_CHIPS).map((v) => (
                <Link
                  key={v.id}
                  href={href(v)}
                  className="vchip"
                  data-out={v.stock <= 0 || undefined}
                  title={v.stock <= 0 ? `${v.name} — нет в наличии` : v.name}
                  onMouseEnter={() => setHover(v)}
                  onFocus={() => setHover(v)}
                >
                  {v.image && <img src={v.image} alt="" />}
                  <span>{v.name}</span>
                </Link>
              ))}
              {variants.length > MAX_CHIPS && (
                <Link href={href()} className="vchip vchip--more">
                  +{variants.length - MAX_CHIPS}
                </Link>
              )}
            </div>
          )}
          {p.stock <= 0 ? (
            <div className="muted small">Нет в наличии</div>
          ) : multi && inStock < variants.length ? (
            <div className="muted small">
              В наличии {inStock} из {variants.length} вариантов
            </div>
          ) : null}
        </div>
      </div>
      <FavoriteButton productId={p.id} initial={favorite} />
    </div>
  );
}
