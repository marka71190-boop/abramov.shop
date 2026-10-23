"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { rub } from "@/lib/format";
import type { WholesaleItem } from "@/lib/wholesale";

const KEY = "w:";

export function WholesaleList({ items, categories }: { items: WholesaleItem[]; categories: { id: string; name: string }[] }) {
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const cart = useCart();
  const inCart = cart.items.filter((i) => i.variantId.startsWith(KEY));
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter((i) => (!cat || i.categoryId === cat) && (!n || i.name.toLowerCase().includes(n) || (i.sku ?? "").toLowerCase().includes(n)));
  }, [items, cat, q]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или артикул" style={{ maxWidth: 320 }} />
        <nav className="cchips" aria-label="Категории" style={{ margin: 0 }}>
          <button type="button" className="vchip" aria-current={!cat ? "true" : undefined} onClick={() => setCat(null)}>
            Все <span className="muted">{items.length}</span>
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" className="vchip" aria-current={cat === c.id ? "true" : undefined} onClick={() => setCat(c.id)}>
              {c.name} <span className="muted">{items.filter((i) => i.categoryId === c.id).length}</span>
            </button>
          ))}
        </nav>
      </div>
      {list.length === 0 && <p className="muted">Ничего не нашли.</p>}
      <div className="wlist">
        {list.map((i) => (
          <Row key={i.id} item={i} />
        ))}
      </div>
      {inCart.length > 0 && (
        <div className="wcart">
          <span>
            В корзине оптом: <b>{inCart.length}</b> поз.
          </span>
          <Link href="/cart" className="btn btn--gold btn--sm">
            Перейти в корзину
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({ item }: { item: WholesaleItem }) {
  const cart = useCart();
  const firstInStock = item.variants.find((v) => v.stock >= item.min) ?? item.variants[0];
  const [vid, setVid] = useState(firstInStock.id);
  const v = item.variants.find((x) => x.id === vid) ?? firstInStock;
  const [qty, setQty] = useState(item.min);
  const [open, setOpen] = useState(false);
  const key = KEY + v.id;
  const has = cart.items.find((c) => c.variantId === key)?.qty ?? 0;
  const enough = v.stock >= item.min;
  return (
    <article className="wrow">
      <div className="wrow__img">{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ph" />}</div>
      <div className="wrow__main">
        <b className="wrow__name">{item.name}</b>
        <div className="small muted">
          {item.sku ? `Арт. ${item.sku} · ` : ""}
          {enough ? `в наличии ${v.stock} шт.` : "нет нужного количества"}
          {item.min > 1 ? ` · партия от ${item.min} шт.` : ""}
        </div>
        {item.variants.length > 1 && (
          <select className="select wrow__variant" value={vid} onChange={(e) => setVid(e.target.value)}>
            {item.variants.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {x.stock} шт.
              </option>
            ))}
          </select>
        )}
        {item.description && (
          <button type="button" className="linklike small" onClick={() => setOpen(!open)}>
            {open ? "Скрыть описание" : "Описание"}
          </button>
        )}
        {open && <p className="small muted" style={{ margin: 0, whiteSpace: "pre-line" }}>{item.description}</p>}
      </div>
      <div className="wrow__price">
        <strong>{rub(v.price)}</strong>
        {item.retail && item.retail > v.price && <s className="small muted">розница {rub(item.retail)}</s>}
      </div>
      <div className="wrow__buy">
        <input
          className="input"
          type="number"
          min={item.min}
          max={v.stock}
          step={1}
          value={qty}
          onChange={(e) => setQty(Math.max(item.min, Math.min(v.stock, Math.trunc(Number(e.target.value)) || item.min)))}
          aria-label="Количество"
        />
        <button
          type="button"
          className="btn btn--gold btn--sm"
          disabled={!enough || !cart.ready}
          onClick={() => {
            cart.add(key, qty);
          }}
        >
          {has ? `+ ещё (в корзине ${has})` : "В корзину"}
        </button>
      </div>
    </article>
  );
}
