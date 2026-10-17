"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { rub } from "@/lib/format";
import { goal } from "@/lib/track";
import { useCart } from "./CartProvider";
import { cartUpsellAction } from "./upsell-action";

type Item = Awaited<ReturnType<typeof cartUpsellAction>>[number];

export function CartUpsell() {
  const cart = useCart();
  const [items, setItems] = useState<Item[]>([]);
  const key = cart.items
    .map((i) => i.variantId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!key) return setItems([]);
    let alive = true;
    cartUpsellAction(key.split(","))
      .then((r) => alive && setItems(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  if (!items.length) return null;
  return (
    <div className="stack" style={{ gap: 12, marginTop: 8 }}>
      <div className="label">Добавьте к заказу</div>
      <div className="upsell">
        {items.map((it) => (
          <div key={it.id} className="upsell__item">
            <Link href={`/product/${it.slug}`}>{it.image ? <img src={it.image} alt="" /> : <span className="ph" />}</Link>
            <div className="stack" style={{ gap: 6, minWidth: 0 }}>
              <Link href={`/product/${it.slug}`} className="upsell__name">
                {it.name}
              </Link>
              <div className="row small" style={{ gap: 8, justifyContent: "space-between" }}>
                <strong>{rub(it.price)}</strong>
                {it.variantId ? (
                  <button
                    type="button"
                    className="linklike"
                    onClick={() => {
                      cart.add(it.variantId!, 1);
                      goal("add_to_cart", { from: "upsell" });
                    }}
                  >
                    + В корзину
                  </button>
                ) : (
                  <Link href={`/product/${it.slug}`}>Выбрать</Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
