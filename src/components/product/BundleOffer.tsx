"use client";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { rub } from "@/lib/format";
import { goal } from "@/lib/track";
import type { BundleCard } from "@/lib/bundles";

/** «Вместе дешевле»: комплект в карточке товара */
export function BundleOffer({ bundle: b }: { bundle: BundleCard }) {
  const cart = useCart();
  const [done, setDone] = useState(false);
  const inCart = (it: BundleCard["items"][number]) => cart.items.some((c) => it.variantIds.includes(c.variantId));
  const all = cart.ready && b.items.every(inCart);

  const addAll = () => {
    for (const it of b.items) if (!inCart(it)) cart.add(it.variantId, 1);
    goal("add_to_cart", { from: "bundle" });
    setDone(true);
  };

  return (
    <section className="bundle" aria-label={`Комплект: ${b.name}`}>
      <div className="bundle__head">
        <div>
          <div className="label gold">Вместе дешевле · −{b.percent}%</div>
          <h2 className="h3" style={{ margin: "6px 0 0" }}>
            {b.name}
          </h2>
          {b.note && <p className="muted small" style={{ margin: "6px 0 0" }}>{b.note}</p>}
        </div>
      </div>
      <div className="bundle__items">
        {b.items.map((it, i) => (
          <div key={it.productId} className="bundle__cell">
            {i > 0 && (
              <span className="bundle__plus" aria-hidden>
                +
              </span>
            )}
            <Link href={`/product/${it.slug}`} className="bundle__item">
              {it.image ? <img src={it.image} alt="" loading="lazy" /> : <span className="ph" />}
              <span className="bundle__name">{it.name}</span>
              <span className="small muted">{rub(it.price)}</span>
            </Link>
          </div>
        ))}
      </div>
      <div className="bundle__foot">
        <div className="bundle__price">
          <s className="muted">{rub(b.full)}</s>
          <strong>{rub(b.price)}</strong>
          <span className="small bundle__save">выгода {rub(b.full - b.price)}</span>
        </div>
        {done || all ? (
          <Link href="/cart" className="btn btn--line">
            Комплект в корзине — оформить
          </Link>
        ) : (
          <button type="button" className="btn btn--gold" onClick={addAll} disabled={!cart.ready}>
            Добавить комплект
          </button>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Скидка применится в корзине сама, когда там будут все товары комплекта. Вариант (цвет, размер) можно выбрать любой.
      </p>
    </section>
  );
}
