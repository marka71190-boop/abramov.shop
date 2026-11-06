/**
 * Таможенные данные товара по умолчанию — по названию и категории.
 * Используются, если в карточке товара поля «Для таможни» пустые: в инвойсе Почты России
 * и в международных отправлениях СДЭК. Сид дописывает их в пустые поля товаров при запуске.
 *
 * Код ТН ВЭД 9504 20 000 0 — «изделия и принадлежности для бильярда всех типов» (кии, мел,
 * наклейки, шары, треугольники, удлинители). Для чехлов, перчаток и одежды код зависит от материала —
 * его не угадываем, а оставляем заполнить в карточке товара.
 */

const BILLIARDS = "9504200000";

type Rule = { re: RegExp; en: string; hs: string | null };

// Граница слова, которая понимает кириллицу (\b в JS — только для латиницы)
const word = (stem: string, tail = "") => new RegExp(`(?<![\\p{L}\\d])${stem}${tail}(?![\\p{L}\\d])`, "u");

// Порядок важен: сначала более точные правила («чехол для мела» — раньше «мела»)
const RULES: Rule[] = [
  { re: /чехол для мела|мелодерж|держатель для мела/u, en: "Billiard chalk holder", hs: BILLIARDS },
  { re: /тубус|кейс|футляр|чехол|сумк/u, en: "Billiard cue case", hs: null },
  { re: /наклейк|(?<![\p{L}])tips?(?![\p{L}])/u, en: "Billiard cue tips", hs: BILLIARDS },
  { re: /удлинител/u, en: "Billiard cue extension", hs: BILLIARDS },
  { re: /шафт|(?<![\p{L}])shaft/u, en: "Billiard cue shaft", hs: BILLIARDS },
  { re: word("ки", "(й|и|я|ев|ю)"), en: "Billiard cue", hs: BILLIARDS },
  { re: word("cues?"), en: "Billiard cue", hs: BILLIARDS },
  { re: word("мел", "(а|ок|ки|у|ом)?"), en: "Billiard chalk", hs: BILLIARDS },
  { re: /chalk/u, en: "Billiard chalk", hs: BILLIARDS },
  { re: word("шар", "(ы|ов|а)?"), en: "Billiard balls", hs: BILLIARDS },
  { re: word("balls?"), en: "Billiard balls", hs: BILLIARDS },
  { re: /треугольник|(?<![\p{L}])rack(?![\p{L}])/u, en: "Billiard ball rack", hs: BILLIARDS },
  { re: /подставк|машинк|(?<![\p{L}])bridge/u, en: "Billiard cue bridge", hs: BILLIARDS },
  { re: /перчатк|glove/u, en: "Billiard glove", hs: null },
  { re: /футболк|t-shirt/u, en: "T-shirt", hs: null },
  { re: /худи|толстовк|свитшот|hoodie/u, en: "Hoodie", hs: null },
  { re: /кепк|бейсболк|(?<![\p{L}])cap(?![\p{L}])/u, en: "Cap", hs: null },
];

const BY_CATEGORY: Record<string, { en: string; hs: string | null }> = {
  cues: { en: "Billiard cue", hs: BILLIARDS },
  chalk: { en: "Billiard chalk", hs: BILLIARDS },
  gloves: { en: "Billiard glove", hs: null },
};

export function guessCustoms(name: string, categorySlug?: string | null): { nameEn: string | null; hsCode: string | null } {
  const n = ` ${name.toLowerCase().replace(/ё/g, "е")} `;
  const r = RULES.find((x) => x.re.test(n)) ?? (categorySlug ? BY_CATEGORY[categorySlug] : undefined);
  return r ? { nameEn: r.en, hsCode: r.hs } : { nameEn: null, hsCode: null };
}

/** Страна из характеристики «Страна» (по-русски) → код: «Япония» → JP */
const KNOWN: Record<string, string> = {
  россия: "RU",
  япония: "JP",
  сша: "US",
  тайвань: "TW",
  китай: "CN",
  бельгия: "BE",
  италия: "IT",
  германия: "DE",
  англия: "GB",
  великобритания: "GB",
  корея: "KR",
  "южная корея": "KR",
  вьетнам: "VN",
  таиланд: "TH",
  испания: "ES",
  франция: "FR",
  финляндия: "FI",
  польша: "PL",
  беларусь: "BY",
  казахстан: "KZ",
  украина: "UA",
};

export function countryCodeByRuName(name: string | null | undefined): string | null {
  const v = (name ?? "").trim().toLowerCase().replace(/ё/g, "е");
  if (!v) return null;
  if (KNOWN[v]) return KNOWN[v];
  try {
    const ru = new Intl.DisplayNames(["ru"], { type: "region" });
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const c = String.fromCharCode(a, b);
        const n = ru.of(c);
        if (n && n !== c && n.toLowerCase().replace(/ё/g, "е") === v) return c;
      }
  } catch {}
  return null;
}
