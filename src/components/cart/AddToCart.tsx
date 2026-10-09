"use client";
import Link from "next/link";
import { useState } from "react";
import { rub } from "@/lib/format";
import { useCart } from "./CartProvider";

interface Variant {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export function QtyStepper({ value, max, onChange, size = "md" }: { value: number; max: number; onChange: (n: number) => void; size?: "sm" | "md" }) {
  return (
    <div className={`qty qty--${size}`}>
      <button type="button" aria-label="Меньше" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="Больше" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

export function AddToCart({ variants, maxPerItem }: { variants: Variant[]; maxPerItem: number }) {
  const cart = useCart();
  const firstInStock = variants.find((v) => v.stock > 0) ?? variants[0];
  const [vid, setVid] = useState(firstInStock?.id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const v = variants.find((x) => x.id === vid);

  if (!v) return <button className="btn btn--line btn--block" disabled>Нет в наличии</button>;

  const inCart = cart.items.find((i) => i.variantId === v.id)?.qty ?? 0;
  const max = Math.max(0, Math.min(v.stock, maxPerItem) - inCart);

  return (
    <div className="stack" style={{ gap: 14 }}>
      {variants.length > 1 && (
        <div className="variants" role="radiogroup" aria-label="Вариант">
          {variants.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === v.id}
              disabled={x.stock <= 0}
              className="variant"
              onClick={() => {
                setVid(x.id);
                setQty(1);
                setAdded(false);
              }}
            >
              {x.name}
            </button>
          ))}
        </div>
      )}
      {variants.length > 1 && v.price !== variants[0].price && <div className="price-big">{rub(v.price)}</div>}
      {v.stock <= 0 ? (
        <button className="btn btn--line btn--block" disabled>
          Нет в наличии
        </button>
      ) : added ? (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <Link href="/cart" className="btn btn--gold" style={{ flex: 1 }}>
            В корзине · оформить
          </Link>
          <button type="button" className="btn btn--line" onClick={() => setAdded(false)}>
            Ещё
          </button>
        </div>
      ) : max <= 0 ? (
        <Link href="/cart" className="btn btn--line btn--block">
          Уже в корзине — максимум
        </Link>
      ) : (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <QtyStepper value={Math.min(qty, max)} max={max} onChange={setQty} />
          <button
            type="button"
            className="btn btn--gold"
            style={{ flex: 1 }}
            onClick={() => {
              cart.add(v.id, Math.min(qty, max));
              setAdded(true);
              setQty(1);
            }}
          >
            В корзину
          </button>
        </div>
      )}
      {v.stock > 0 && v.stock <= 5 && <div className="small gold">Осталось {v.stock} шт.</div>}
    </div>
  );
}
