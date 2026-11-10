/**
 * Валюты для покупателей из-за рубежа.
 *
 * Оплата картой через Робокассу из-за рубежа — всегда в долларах (OutSumCurrency=USD, по курсу ЦБ).
 * Цены на сайте можно смотреть в валюте своей страны (тенге, белорусские рубли, драмы…) — только
 * для удобства: сайт считает в рублях, платят в долларах. Если курса валюты страны у ЦБ нет — в долларах.
 * Модуль без сервера: используется и на страницах в браузере.
 */

/** Валюта, в которой Робокасса выставляет счёт покупателю из-за рубежа */
export const PAY_CURRENCY = "USD";

/** Страна → её валюта (код ISO). Страны евро — EUR. Нет в списке — доллары */
const BY_COUNTRY: Record<string, string> = {
  RU: "RUB", BY: "BYN", KZ: "KZT", AM: "AMD", KG: "KGS", UZ: "UZS", TJ: "TJS", AZ: "AZN", GE: "GEL", MD: "MDL", TM: "TMT",
  UA: "UAH", CN: "CNY", HK: "HKD", TR: "TRY", AE: "AED", QA: "QAR", IN: "INR", ID: "IDR", TH: "THB", VN: "VND", SG: "SGD",
  KR: "KRW", JP: "JPY", EG: "EGP", ZA: "ZAR", BR: "BRL", US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD", GB: "GBP", CH: "CHF",
  NO: "NOK", SE: "SEK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", RS: "RSD",
};
const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK", "AD", "MC", "SM", "VA", "ME", "XK"];
for (const c of EURO) BY_COUNTRY[c] = "EUR";

/** Если покупатель вписал страну сам — по названию */
const BY_NAME: [RegExp, string][] = [
  [/беларус|белорус/i, "BYN"], [/казахстан/i, "KZT"], [/армени/i, "AMD"], [/киргиз|кыргыз/i, "KGS"], [/узбекистан/i, "UZS"],
  [/таджикистан/i, "TJS"], [/азербайджан/i, "AZN"], [/грузи/i, "GEL"], [/молдов/i, "MDL"], [/туркмен/i, "TMT"], [/китай/i, "CNY"],
  [/турци/i, "TRY"], [/эмират|оаэ/i, "AED"], [/индия/i, "INR"], [/таиланд/i, "THB"], [/вьетнам/i, "VND"], [/сша|америк/i, "USD"],
  [/британ|англи/i, "GBP"], [/швейцари/i, "CHF"], [/польш/i, "PLN"], [/чехи/i, "CZK"], [/сербия/i, "RSD"], [/израил/i, "USD"],
  [/германи|франци|итали|испани|нидерланд|голланд|австри|бельги|финлянд|греци|португал|латви|литв|эстони|кипр|ирланд|словени|словаки|хорвати|черногори|мальт|люксембург/i, "EUR"],
];

/** Валюта страны для показа цен (без проверки, есть ли курс) */
export function countryCurrency(code: string | null | undefined, name?: string | null) {
  const c = String(code ?? "").toUpperCase();
  if (BY_COUNTRY[c]) return BY_COUNTRY[c];
  const n = name?.trim() ?? "";
  for (const [re, cur] of BY_NAME) if (re.test(n)) return cur;
  return "USD";
}

/** Знак или короткое название валюты */
export const CURRENCY_SIGN: Record<string, string> = {
  RUB: "₽", USD: "$", EUR: "€", KZT: "₸", BYN: "Br", AMD: "֏", KGS: "сом", UZS: "сум", TJS: "сомони", AZN: "₼", GEL: "₾",
  MDL: "лей", TMT: "ман.", UAH: "₴", CNY: "¥", HKD: "HK$", TRY: "₺", AED: "дирх.", QAR: "риал", INR: "₹", IDR: "Rp", THB: "฿",
  VND: "₫", SGD: "S$", KRW: "₩", JPY: "¥", EGP: "E£", ZAR: "R", BRL: "R$", CAD: "C$", AUD: "A$", NZD: "NZ$", GBP: "£",
  CHF: "CHF", NOK: "kr", SEK: "kr", DKK: "kr", PLN: "zł", CZK: "Kč", HUF: "Ft", RON: "lei", BGN: "лв", RSD: "дин.",
};
export const signOf = (cur: string) => CURRENCY_SIGN[cur] ?? cur;

/** «в тенге» — для пояснений */
const WORD: Record<string, string> = {
  RUB: "в рублях", USD: "в долларах", EUR: "в евро", KZT: "в тенге", BYN: "в белорусских рублях", AMD: "в драмах", KGS: "в сомах",
  UZS: "в сумах", TJS: "в сомони", AZN: "в манатах", GEL: "в лари", MDL: "в леях", TMT: "в манатах", UAH: "в гривнах",
  CNY: "в юанях", TRY: "в лирах", AED: "в дирхамах", GBP: "в фунтах", CHF: "во франках", PLN: "в злотых", CZK: "в кронах",
};
export const currencyWord = (cur: string) => WORD[cur] ?? `в ${cur}`;

/** Короткое название для переключателя */
const NAME: Record<string, string> = {
  RUB: "Рубли", USD: "Доллары", EUR: "Евро", KZT: "Тенге", BYN: "Белорусские рубли", AMD: "Драмы", KGS: "Сомы", UZS: "Сумы",
  TJS: "Сомони", AZN: "Манаты", GEL: "Лари", MDL: "Леи", TMT: "Манаты", UAH: "Гривны", CNY: "Юани", TRY: "Лиры",
  AED: "Дирхамы", GBP: "Фунты", CHF: "Франки", PLN: "Злотые", CZK: "Кроны",
};
export const currencyName = (cur: string) => NAME[cur] ?? cur;

/** Мелкие валюты показываем без копеек */
const WHOLE = new Set(["KZT", "AMD", "KGS", "UZS", "TJS", "JPY", "KRW", "VND", "IDR", "HUF", "RSD", "INR", "TMT"]);
export const isWhole = (cur: string) => WHOLE.has(cur);

/** Копейки → сумма в валюте, в сотых; вверх до цента — чтобы рублей пришло не меньше. rate — рублей за 1 единицу */
export function toCurrencyMinor(rubKop: number, rate: number | undefined, bufferPercent = 0) {
  if (!rate || !(rate > 0)) return null;
  return Math.ceil(((rubKop / 100) * (1 + Math.max(0, bufferPercent) / 100) * 100) / rate);
}

/** Сотые → «125,40 $», «60 000 ₸» */
export function fmtCurrency(minor: number, cur: string) {
  const whole = isWhole(cur);
  const v = whole ? Math.ceil(minor / 100) : minor / 100;
  const s = v.toLocaleString("ru-RU", { minimumFractionDigits: whole || Number.isInteger(v) ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return `${s} ${signOf(cur)}`;
}
