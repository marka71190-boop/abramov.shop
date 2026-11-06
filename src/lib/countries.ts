/**
 * Страны доставки. Россия — как обычно (ЮKassa). Страны СДЭК — доставка СДЭК, оплата через Робокассу
 * или переводом со сбором. Остальные (покупатель вписал сам) — доставку считает менеджер, оплата переводом.
 * Общий файл для сервера и браузера.
 */

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
}

export type CountryMode = "RU" | "CDEK" | "MANUAL";

export const RUSSIA: Country = { code: "RU", name: "Россия" };
/** Страны нет в списке СДЭК — покупатель вписал её сам */
export const MANUAL_CODE = "XX";

/** «BY Беларусь» по строке → список стран (Россию и мусор пропускаем) */
export function parseCountries(text: string): Country[] {
  const out: Country[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Za-z]{2})\s+(.{2,60})$/);
    if (!m) continue;
    const code = m[1].toUpperCase();
    if (code === "RU" || code === MANUAL_CODE || out.some((c) => c.code === code)) continue;
    out.push({ code, name: m[2].trim() });
  }
  return out;
}

export function countryMode(code: string | null | undefined, cdek: Country[]): CountryMode {
  const c = (code || "RU").toUpperCase();
  if (c === "RU") return "RU";
  return cdek.some((x) => x.code === c) ? "CDEK" : "MANUAL";
}

/** Название страны для показа: из списка или то, что вписал покупатель */
export function countryLabel(code: string | null | undefined, name: string | null | undefined, cdek: Country[]) {
  const c = (code || "RU").toUpperCase();
  if (c === "RU") return RUSSIA.name;
  return cdek.find((x) => x.code === c)?.name ?? (name?.trim() || "Другая страна");
}

/** Название страны, вписанное вручную: только буквы, пробелы и дефис */
export function cleanCountryName(v: string) {
  return v
    .replace(/[^\p{L}\s'().-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Сбор за заказ из-за рубежа: процент от суммы (товары + доставка), округляем до рубля вверх */
export function foreignFeeOf(base: number, percent: number) {
  if (!percent || base <= 0) return 0;
  return Math.ceil((base * percent) / 100 / 100) * 100;
}

export type ForeignPay = "ROBOKASSA" | "TRANSFER";
