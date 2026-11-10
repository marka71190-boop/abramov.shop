/**
 * Валюта оплаты заказа из-за рубежа через Робокассу.
 * Робокасса выставляет счёт только в долларах, евро или тенге (параметр OutSumCurrency: USD, EUR, KZT) —
 * поэтому: Казахстан — тенге, страны евро — евро, все остальные — доллары. Рубли России не касаются.
 * Модуль без сервера: используется и на оформлении заказа.
 */
export type PayCurrency = "USD" | "EUR" | "KZT";
export const PAY_CURRENCIES: PayCurrency[] = ["USD", "EUR", "KZT"];

/** Страны, где платят евро (код ISO) */
const EURO = new Set(["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK", "AD", "MC", "SM", "VA", "ME", "XK"]);
/** Те же страны по-русски — если покупатель вписал страну сам */
const EURO_NAMES = /^(австрия|бельгия|кипр|германия|эстония|испания|финляндия|франция|греция|хорватия|ирландия|италия|литва|люксембург|латвия|мальта|нидерланды|голландия|португалия|словения|словакия|андорра|монако|сан-марино|ватикан|черногория|косово)$/i;

export function payCurrency(code: string | null | undefined, name?: string | null): PayCurrency {
  const c = String(code ?? "").toUpperCase();
  if (c === "KZ" || /^казахстан$/i.test(name?.trim() ?? "")) return "KZT";
  if (EURO.has(c) || EURO_NAMES.test(name?.trim() ?? "")) return "EUR";
  return "USD";
}

export const CURRENCY_SIGN: Record<PayCurrency, string> = { USD: "$", EUR: "€", KZT: "₸" };
export const CURRENCY_WORD: Record<PayCurrency, string> = { USD: "в долларах", EUR: "в евро", KZT: "в тенге" };

/** Копейки → сумма в валюте, в центах/тиынах; округление вверх до цента — чтобы рублей пришло не меньше */
export function toCurrencyMinor(rubKop: number, rate: number, bufferPercent = 0) {
  if (!(rate > 0)) return null;
  return Math.ceil(((rubKop / 100) * (1 + Math.max(0, bufferPercent) / 100) * 100) / rate);
}

/** Центы → «125,40 $», тиыны → «60 000 ₸» (тенге без копеек, если ровно) */
export function fmtCurrency(minor: number, cur: PayCurrency) {
  const v = minor / 100;
  const s = v.toLocaleString("ru-RU", { minimumFractionDigits: cur === "KZT" && Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  return `${s} ${CURRENCY_SIGN[cur]}`;
}

/** Сумма для Робокассы: «125.40» */
export const outSumOf = (minor: number) => (minor / 100).toFixed(2);
