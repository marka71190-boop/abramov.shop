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

/**
 * Номер для таможни СДЭК: Казахстан — ИИН (12 цифр), Киргизия — ПИН (14 цифр).
 * Без него посылку в эти страны не оформить.
 */
export const TIN_RULES: Record<string, { label: string; full: string; len: number; example: string }> = {
  KZ: { label: "ИИН", full: "ИИН — индивидуальный идентификационный номер", len: 12, example: "900101300126" },
  KG: { label: "ПИН", full: "ПИН — персональный идентификационный номер", len: 14, example: "21001199000123" },
};

export const tinRule = (code: string | null | undefined) => TIN_RULES[(code || "").toUpperCase()] ?? null;

/** ИИН Казахстана: 12 цифр, контрольная цифра по алгоритму РК */
function kzIinOk(d: string) {
  const n = d.split("").map(Number);
  const sum = (w: number[]) => w.reduce((a, x, i) => a + x * n[i], 0) % 11;
  let c = sum([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  if (c === 10) c = sum([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]);
  return c !== 10 && c === n[11];
}

/** Проверяет ИИН/ПИН для страны. Возвращает цифры или текст ошибки */
export function checkTin(country: string, raw: string): { tin: string } | { error: string } {
  const r = tinRule(country);
  if (!r) return { tin: "" };
  const d = raw.replace(/\D/g, "");
  if (!d) return { error: `Укажите ${r.label} получателя — без него таможня не пропустит посылку` };
  if (d.length !== r.len) return { error: `${r.label} — ${r.len} цифр` };
  if (country === "KZ" && !kzIinOk(d)) return { error: "Проверьте ИИН: похоже, в нём опечатка" };
  if (country === "KG" && !/^[12]/.test(d)) return { error: "ПИН начинается с 1 или 2 — проверьте номер" };
  return { tin: d };
}
