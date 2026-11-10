/**
 * Валюта показа цен для покупателей из-за рубежа: рубли (по умолчанию), доллары, евро или валюта страны.
 * Только показ — платят из-за рубежа всё равно в долларах. Хранится в cookie ab_cur на год.
 * Меняется переключателем в шапке или сама — при выборе страны доставки.
 */
import { countryCurrency } from "@/lib/currency";

export type ShowCurrency = string; // код ISO: RUB, USD, KZT…
export const COOKIE = "ab_cur";
const EVENT = "ab:currency";

let current: ShowCurrency = "RUB";
let enabled = false;
let known = new Set<string>(["RUB"]);

export const currencyEnabled = () => enabled;
export const getCurrency = () => current;

/** Вызывает слой валют при запуске: доступны ли курсы и что было выбрано */
export function initCurrency(cur: ShowCurrency, rates: Record<string, number> | null) {
  enabled = !!rates;
  known = new Set(["RUB", ...Object.keys(rates ?? {})]);
  current = enabled && known.has(cur) ? cur : "RUB";
}

export function setCurrency(cur: ShowCurrency) {
  if (!enabled || cur === current) return;
  if (!known.has(cur)) cur = "USD"; // курса валюты страны у ЦБ нет — в долларах
  current = cur;
  try {
    document.cookie = `${COOKIE}=${cur}; path=/; max-age=${365 * 86400}; samesite=lax`;
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: cur }));
}

/** Выбрали страну доставки — цены в её валюте (Россия — рубли) */
export function setCurrencyForCountry(code: string, name?: string | null) {
  if (!code) return;
  setCurrency(countryCurrency(code, name));
}

export function onCurrency(fn: (c: ShowCurrency) => void) {
  const h = (e: Event) => fn((e as CustomEvent<ShowCurrency>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
