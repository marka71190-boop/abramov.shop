/**
 * Нормализация текста для поиска по товарам. Работает и в браузере, и на сервере.
 * Ищем без учёта регистра и «ё», с грубым отсечением окончаний («наклейки» найдёт «наклейка»)
 * и с исправлением раскладки («rbq» → «кий»).
 */

export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

const RU_ENDINGS =
  /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|ия|ие|ий|ый|ой|ая|яя|ое|ее|ые|ие|ов|ев|ей|ам|ям|ах|ях|ом|ем|ую|юю|а|я|ы|и|е|у|ю|о|ь)$/;

/** Основа слова: отрезаем русское окончание у слов от 5 букв, у английских — «s». */
export function stem(w: string) {
  if (/^[а-я]+$/.test(w) && w.length >= 5) {
    const cut = w.replace(RU_ENDINGS, "");
    return cut.length >= 3 ? cut : w;
  }
  if (/^[a-z]+$/.test(w) && w.length >= 4 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

export function tokens(q: string) {
  return normalize(q)
    .split(" ")
    .filter((w) => w.length > 0)
    .slice(0, 8)
    .map(stem);
}

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = "йцукенгшщзхъфывапролджэячсмитьбюё";

/** Набор в неправильной раскладке: «rbq» → «кий», «лфьгш» → «kamui». */
export function swapLayout(q: string) {
  const lower = q.toLowerCase();
  const toRu = [...lower].map((ch) => (EN.includes(ch) ? RU[EN.indexOf(ch)] : ch)).join("");
  if (toRu !== lower) return toRu;
  const toEn = [...lower].map((ch) => (RU.includes(ch) ? EN[RU.indexOf(ch)] : ch)).join("");
  return toEn !== lower ? toEn.replace(/[^a-z0-9 ]/g, "") : null;
}

export interface Searchable {
  name: string;
  extra: string; // артикулы, варианты, категория, описание
}

/**
 * Оценка совпадения: 0 — не подходит. Каждое слово запроса должно найтись
 * в названии или в остальных полях; совпадения в названии весят больше.
 */
export function score(item: Searchable, qTokens: string[]) {
  if (!qTokens.length) return 1;
  const name = " " + normalize(item.name) + " ";
  const extra = " " + normalize(item.extra) + " ";
  let total = 0;
  for (const t of qTokens) {
    if (name.includes(" " + t)) total += 10;
    else if (name.includes(t)) total += 6;
    else if (extra.includes(" " + t)) total += 3;
    else if (t.length >= 3 && extra.includes(t)) total += 1;
    else return 0;
  }
  if (name.trim().startsWith(qTokens[0])) total += 5;
  return total;
}
