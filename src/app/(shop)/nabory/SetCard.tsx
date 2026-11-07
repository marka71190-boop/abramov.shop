"use client";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { rub } from "@/lib/format";
import { goal } from "@/lib/track";
import type { BundleCard } from "@/lib/bundles";
import { sized } from "@/lib/img";

/** Набор на витрине: коллаж товаров, состав, цена набора и одна кнопка «в корзину» */
export function SetCard({ set: b, level }: { set: BundleCard; level: string | null }) {
  const cart = useCart();
  const [done, setDone] = useState(false);
  const inCart = (it: BundleCard["items"][number]) => cart.items.some((c) => it.variantIds.includes(c.variantId));
  const all = cart.ready && b.items.every(inCart);
  const pics = b.items.filter((i) => i.image).slice(0, 4);

  const addAll = () => {
    for (const it of b.items) if (!inCart(it)) cart.add(it.variantId, 1);
    goal("add_to_cart", { from: "set" });
    setDone(true);
  };

  return (
    <article className="set-card">
      <div className={`set-card__pics set-card__pics--${Math.max(1, pics.length)}`} aria-hidden>
        {pics.length ? pics.map((i) => <img key={i.productId} src={sized(i.image!, 320)} alt="" loading="lazy" />) : <span className="ph" />}
        <span className="set-card__save">−{b.percent}%</span>
      </div>
      <div className="set-card__body">
        {level && <span className="label gold">{level}</span>}
        <h2 className="h4" style={{ margin: 0 }}>
          {b.name}
        </h2>
        {b.note && <p className="small muted" style={{ margin: 0 }}>{b.note}</p>}
        <ul className="set-card__items small">
          {b.items.map((i) => (
            <li key={i.productId}>
              <Link href={`/product/${i.slug}`}>{i.name}</Link> <span className="muted">· {rub(i.price)}</span>
            </li>
          ))}
        </ul>
        <div className="set-card__foot">
          <div className="set-card__price">
            <s className="muted small">{rub(b.full)}</s>
            <strong>{rub(b.price)}</strong>
            <span className="small set-card__benefit">выгода {rub(b.full - b.price)}</span>
          </div>
          {done || all ? (
            <Link href="/cart" className="btn btn--line btn--sm">
              В корзине — оформить
            </Link>
          ) : (
            <button type="button" className="btn btn--gold btn--sm" onClick={addAll} disabled={!cart.ready}>
              Набор в корзину
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
