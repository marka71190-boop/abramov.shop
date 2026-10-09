"use client";
import { useEffect, useRef, useState } from "react";
import { quoteAction } from "@/app/(shop)/checkout/actions";
import type { Quote } from "@/lib/pricing";
import { useCart } from "./CartProvider";

/** Пересчитывает заказ на сервере при каждом изменении (с небольшой задержкой). */
export function useQuote(extra: Record<string, unknown>, deps: unknown[]) {
  const cart = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    if (!cart.ready) return;
    if (!cart.items.length) {
      setQuote(null);
      setLoading(false);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await quoteAction({ lines: cart.items, ...extra }).catch(() => ({ error: "Нет связи с сервером" }) as const);
      if (my !== seq.current) return;
      setLoading(false);
      if ("quote" in r && r.quote) {
        setQuote(r.quote);
        setError(null);
        // Убираем из корзины то, что больше нельзя купить, и уменьшаем количество до остатка
        const q = r.quote;
        if (q.removed.length || q.adjusted.length) {
          cart.replace(
            cart.items
              .filter((i) => !q.removed.some((x) => x.variantId === i.variantId))
              .map((i) => ({ ...i, qty: q.adjusted.find((a) => a.variantId === i.variantId)?.qty ?? i.qty })),
          );
        }
      } else setError(r.error ?? "Ошибка");
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.ready, JSON.stringify(cart.items), ...deps]);

  return { quote, error, loading, setQuote };
}
