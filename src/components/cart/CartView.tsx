"use client";
import Link from "next/link";
import { rub } from "@/lib/format";
import { QtyStepper } from "./AddToCart";
import { useCart } from "./CartProvider";
import { useQuote } from "./useQuote";
import { CartUpsell } from "./CartUpsell";

export function CartView({ signedIn, maxPerItem }: { signedIn: boolean; maxPerItem: number }) {
  const cart = useCart();
  const { quote, error, loading } = useQuote({}, []);

  if (!cart.ready) return <div className="cart-skeleton" aria-busy />;

  if (!cart.items.length) {
    return (
      <div className="panel empty-cart">
        <p className="h3">Корзина пуста</p>
        <p className="muted">Загляните в каталог — там лимитированная серия Kamui × Iosif Abramov.</p>
        <Link href="/#catalog" className="btn btn--gold">
          В каталог
        </Link>
      </div>
    );
  }

  const lines = quote?.lines ?? [];
  const messages = [
    ...(quote?.removed.map((r) => r.reason) ?? []),
    ...(quote?.adjusted.map((a) => `«${a.name}»: осталось ${a.qty} шт., количество уменьшено`) ?? []),
  ];

  return (
    <div className="cart">
      <div className="cart__lines">
        {messages.map((m) => (
          <div key={m} className="notice notice--muted" style={{ margin: 0 }}>
            {m}
          </div>
        ))}
        {error && <div className="form-error">{error}</div>}
        {!quote && loading
          ? cart.items.map((i) => <div key={i.variantId} className="cart-line cart-line--ghost" />)
          : lines.map((l) => (
              <div key={l.variantId} className="cart-line">
                <Link href={l.href ?? `/product/${l.slug}`} className="cart-line__img">
                  {l.image ? <img src={l.image} alt="" /> : null}
                </Link>
                <div className="cart-line__info">
                  <Link href={l.href ?? `/product/${l.slug}`} className="cart-line__name">
                    {l.name}
                  </Link>
                  {l.variantName && <div className="muted small">{l.variantName}</div>}
                  {l.wholesale && (
                    <div className="small gold">
                      Оптовая цена{l.minQty && l.minQty > 1 ? ` · партия от ${l.minQty} шт.` : ""}
                    </div>
                  )}
                  <div className="muted small">{rub(l.price)} за шт.</div>
                  {l.madeToOrder ? <div className="small gold">Изготовим за {l.madeToOrder} дн. после оплаты</div> : null}
                </div>
                <QtyStepper
                  size="sm"
                  value={cart.items.find((i) => i.variantId === l.variantId)?.qty ?? l.qty}
                  max={l.wholesale ? l.stock : Math.min(l.stock, maxPerItem)}
                  onChange={(n) => cart.setQty(l.variantId, n)}
                />
                <div className="cart-line__sum">{rub(l.lineTotal)}</div>
                <button type="button" className="cart-line__remove" aria-label={`Убрать ${l.name}`} onClick={() => cart.remove(l.variantId)}>
                  ×
                </button>
              </div>
            ))}
        {quote?.bundleHints.map((h) => (
          <div key={h.id} className="notice notice--muted bundle-hint" style={{ margin: 0 }}>
            <b>Скидка {h.percent}% на комплект «{h.name}».</b> Добавьте{" "}
            {h.missing.map((m, i) => (
              <span key={m.slug}>
                {i > 0 ? " и " : ""}
                <Link href={`/product/${m.slug}`}>{m.name}</Link>
              </span>
            ))}{" "}
            — скидка применится сама.
          </div>
        ))}
        <CartUpsell />
      </div>

      <aside className="summary" aria-busy={loading}>
        <div className="label">Итого</div>
        <div className="summary__row">
          <span>Товары, {cart.count} шт.</span>
          <span>{quote ? rub(quote.subtotal) : "…"}</span>
        </div>
        {quote?.bundles.map((b) => (
          <div key={b.id} className="summary__row good">
            <span>
              Комплект «{b.name}»{b.sets > 1 ? ` × ${b.sets}` : ""}
            </span>
            <span>−{rub(b.discount)}</span>
          </div>
        ))}
        <div className="summary__row muted">
          <span>Доставка СДЭК</span>
          <span>при оформлении</span>
        </div>
        <div className="summary__total">
          <span>К оплате</span>
          <span>{quote ? rub(quote.subtotal - quote.bundleDiscount) : "…"}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Промокод и бонусы — на следующем шаге.
        </p>
        <Link href={signedIn ? "/checkout" : "/login?next=/checkout"} className="btn btn--gold btn--block" aria-disabled={!lines.length}>
          {signedIn ? "Оформить заказ" : "Войти и оформить"}
        </Link>
        {!signedIn && (
          <p className="muted small" style={{ margin: 0 }}>
            Нет аккаунта? <Link href="/register?next=/checkout">Регистрация за минуту</Link> — и бонусы с этого заказа ваши.
          </p>
        )}
      </aside>
    </div>
  );
}
