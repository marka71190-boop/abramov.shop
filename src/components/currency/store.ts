/**
 * Валюта показа цен для покупателей из-за рубежа: ₽ (по умолчанию), $, €, ₸.
 * Хранится в cookie ab_cur на год. Меняется переключателем в шапке или сама — при выборе страны доставки.
 */
import { payCurrency, type PayCurrency } from "@/lib/currency";

export type ShowCurrency = PayCurrency | "RUB";
export const COOKIE = "ab_cur";
const EVENT = "ab:currency";

let current: ShowCurrency = "RUB";
let enabled = false;

export const currencyEnabled = () => enabled;
export const getCurrency = () => current;

/** Вызывает слой валют при запуске: доступны ли курсы и что было выбрано */
export function initCurrency(cur: ShowCurrency, on: boolean) {
  enabled = on;
  current = on ? cur : "RUB";
}

export function setCurrency(cur: ShowCurrency) {
  if (!enabled || cur === current) return;
  current = cur;
  try {
    document.cookie = `${COOKIE}=${cur}; path=/; max-age=${365 * 86400}; samesite=lax`;
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: cur }));
}

/** Выбрали страну доставки — цены в её валюте (Россия — рубли) */
export function setCurrencyForCountry(code: string, name?: string | null) {
  if (!code) return;
  setCurrency(code.toUpperCase() === "RU" ? "RUB" : payCurrency(code, name));
}

export function onCurrency(fn: (c: ShowCurrency) => void) {
  const h = (e: Event) => fn((e as CustomEvent<ShowCurrency>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
