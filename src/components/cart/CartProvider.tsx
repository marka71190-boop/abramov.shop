"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * Корзина хранится в браузере покупателя (localStorage): работает и без входа,
 * переживает перезагрузку и синхронизируется между вкладками.
 * Цены и остатки здесь не храним — их всегда считает сервер.
 *
 * У вошедшего покупателя корзина ещё и копируется на сервер: она появится на другом
 * устройстве, а магазин сможет напомнить о брошенной корзине.
 */
export interface CartItem {
  variantId: string;
  qty: number;
}

interface CartApi {
  items: CartItem[];
  count: number;
  ready: boolean;
  add: (variantId: string, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  replace: (items: CartItem[]) => void;
  clear: () => void;
}

const KEY = "as_cart_v1";
const Ctx = createContext<CartApi | null>(null);

function read(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((i) => typeof i?.variantId === "string" && Number.isInteger(i?.qty) && i.qty > 0).slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children, signedIn = false }: { children: React.ReactNode; signedIn?: boolean }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const synced = useRef(false); // первая сверка с сервером начата
  const [syncDone, setSyncDone] = useState(false); // и закончена — до этого ничего не отправляем
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    setItems(read());
    setReady(true);
    const onStorage = (e: StorageEvent) => e.key === KEY && setItems(read());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Первая сверка: на этом устройстве корзина пустая — берём сохранённую на сервере
  useEffect(() => {
    if (!ready || !signedIn || synced.current) return;
    synced.current = true;
    if (read().length) return setSyncDone(true); // локальная корзина главнее — отправится ниже
    fetch("/api/cart", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: CartItem[] } | null) => {
        const server = (d?.items ?? []).filter((i) => typeof i?.variantId === "string" && Number.isInteger(i?.qty) && i.qty > 0);
        lastSent.current = JSON.stringify(server);
        if (server.length && !read().length) {
          try {
            localStorage.setItem(KEY, JSON.stringify(server));
          } catch {}
          setItems(server);
        }
      })
      .catch(() => {})
      .finally(() => setSyncDone(true));
  }, [ready, signedIn]);

  // Каждое изменение — на сервер (с паузой, чтобы не слать запрос на каждый клик «+»)
  useEffect(() => {
    if (!ready || !signedIn || !syncDone) return;
    const body = JSON.stringify(items);
    if (body === lastSent.current) return;
    const t = setTimeout(() => {
      lastSent.current = body;
      fetch("/api/cart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }), keepalive: true }).catch(
        () => {
          lastSent.current = null;
        },
      );
    }, 1200);
    return () => clearTimeout(t);
  }, [items, ready, signedIn, syncDone]);

  const commit = useCallback((fn: (prev: CartItem[]) => CartItem[]) => {
    setItems((prev) => {
      const next = fn(prev).filter((i) => i.qty > 0);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* приватный режим — корзина живёт до закрытия вкладки */
      }
      return next;
    });
  }, []);

  const api = useMemo<CartApi>(
    () => ({
      items,
      ready,
      count: items.reduce((a, i) => a + i.qty, 0),
      add: (variantId, qty = 1) =>
        commit((prev) =>
          prev.some((i) => i.variantId === variantId)
            ? prev.map((i) => (i.variantId === variantId ? { ...i, qty: i.qty + qty } : i))
            : [...prev, { variantId, qty }],
        ),
      setQty: (variantId, qty) => commit((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, qty } : i))),
      remove: (variantId) => commit((prev) => prev.filter((i) => i.variantId !== variantId)),
      replace: (next) => commit(() => next),
      clear: () => commit(() => []),
    }),
    [items, ready, commit],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart вне CartProvider");
  return c;
}

export function CartBadge() {
  const { count } = useCart();
  if (!count) return null;
  return (
    <span className="badge-count" aria-label={`В корзине: ${count}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Запоминает код друга из ссылки вида abramov.shop/?ref=AS-XXXXXX */
export const PROMO_KEY = "as_promo";

/** Промокод, пришедший по ссылке из рассылки (действует 30 дней с перехода). */
export function storedPromo(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(PROMO_KEY) || "null") as { code?: string; at?: number } | null;
    if (v?.code && v.at && Date.now() - v.at < 30 * 86400_000) return v.code;
  } catch {}
  return null;
}

export function forgetPromo() {
  try {
    localStorage.removeItem(PROMO_KEY);
  } catch {}
}

export function RefCatcher() {
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get("ref");
    if (ref && /^AS-[A-Z0-9]{6}$/i.test(ref)) {
      try {
        localStorage.setItem("as_ref", ref.toUpperCase());
      } catch {}
    }
    // Промокод из письма рассылки (?promo=CODE) — подставится при оформлении заказа
    const promo = params.get("promo");
    if (promo && /^[A-Z0-9_-]{2,40}$/i.test(promo)) {
      try {
        localStorage.setItem(PROMO_KEY, JSON.stringify({ code: promo.toUpperCase(), at: Date.now() }));
      } catch {}
    }
  }, []);
  return null;
}
