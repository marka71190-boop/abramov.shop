/**
 * Разбор страниц поставщика «Фортуна» (fortu.ru) и сопоставление с нашими товарами.
 * Берём только факты: название, код, характеристики «имя — значение», рекомендованную цену.
 * Тексты описаний и фотографии не трогаем — на них у поставщика авторское право.
 * Без server-only: чистые функции, проверяются тестами.
 */

export interface Spec {
  name: string;
  value: string;
}

export interface FortuProduct {
  title: string;
  code: string | null;
  rrp: number | null; // копейки
  specs: Spec[];
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", ndash: "–", mdash: "—", plusmn: "±", reg: "®", trade: "™", deg: "°", sup2: "²", times: "×", oslash: "ø", Oslash: "Ø", ldquo: "“", rdquo: "”", hellip: "…" };

/** HTML → текст одной строкой */
export function plain(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENT[n] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Страница товара. null — это не страница товара (нет заголовка) */
export function parseFortuProduct(html: string): FortuProduct | null {
  const h1 = html.match(/<div class="product-name">\s*<h1>([\s\S]*?)<\/h1>/) ?? html.match(/<h1>([\s\S]*?)<\/h1>/);
  if (!h1) return null;
  const title = plain(h1[1]).slice(0, 300);
  if (!title) return null;
  const code = html.match(/class="product_code_by_font">\s*([^<\s][^<]*?)\s*</)?.[1] ?? null;
  const rrpRaw = html.match(/Рекомендованная розничная цена:[\s\S]{0,200}?>\s*([\d\s.,]+)\s*</)?.[1];
  const rrpNum = rrpRaw ? Number(rrpRaw.replace(/\s/g, "").replace(",", ".")) : NaN;
  const specs: Spec[] = [];
  const re = /key-propertys-name">([\s\S]*?)<\/span>\s*<span class="key-propertys-value">([\s\S]*?)<\/span>/g;
  for (let m = re.exec(html); m && specs.length < 80; m = re.exec(html)) {
    const name = plain(m[1]).slice(0, 80);
    const value = plain(m[2]).slice(0, 200);
    if (name && value && !specs.some((x) => x.name === name)) specs.push({ name, value });
  }
  return { title, code: code ? code.slice(0, 32) : null, rrp: Number.isFinite(rrpNum) && rrpNum > 0 ? Math.round(rrpNum * 100) : null, specs };
}

/** Список товаров из выдачи поиска (страница или кусок из search.php) */
export function parseFortuList(html: string) {
  const out: { path: string; title: string }[] = [];
  const re = /<a href="(\/product\/[^"?#]+)"\s+title="([^"]+)"\s+class="product-image"/g;
  for (let m = re.exec(html); m && out.length < 200; m = re.exec(html)) {
    if (!out.some((x) => x.path === m![1])) out.push({ path: m[1], title: plain(m[2]) });
  }
  return out;
}

/** Адрес или код, который вставил человек: «https://fortu.ru/product/abc», «/product/abc» или «01851» */
export function parseFortuRef(raw: string): { path: string } | { code: string } | null {
  const v = raw.trim();
  const m = v.match(/(?:^|fortu\.ru)(\/product\/[A-Za-z0-9_.~%()+-]+)/);
  if (m) return { path: m[1] };
  if (/^[A-Za-zА-Яа-я0-9-]{3,20}$/.test(v)) return { code: v };
  return null;
}

// ---------- Сопоставление названий ----------

const STOP = new Set(["для", "кия", "киев", "шт", "мм", "см", "и", "с", "в", "на", "по", "от", "из", "the", "oz", "г", "кг", "фт"]);
// Одно и то же разными словами: у нас «M», у поставщика «Medium»
const SYN: Record<string, string> = { m: "medium", med: "medium", s: "soft", h: "hard", ss: "supersoft", sh: "superhard", mh: "mediumhard", hm: "mediumhard", средняя: "medium", мягкая: "soft", жесткая: "hard", черный: "black", черная: "black", синий: "blue", красный: "red", зеленый: "green", белый: "white" };

const HARD = new Set(["soft", "medium", "hard", "supersoft", "superhard", "mediumhard"]);

/** Название → значимые слова: без регистра, «ø14мм» → «14», «Super Soft» → «supersoft» */
export function tokens(name: string) {
  const t = name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[®™©ø]/g, " ")
    .replace(/super\s+soft/g, "supersoft")
    .replace(/super\s+hard/g, "superhard")
    .replace(/medium\s*[/-]?\s*hard|hard\s*[/-]\s*medium/g, "mediumhard")
    .replace(/(\d)[.,](\d)/g, "$1_$2") // 12,75 — одно число
    .replace(/(\d)(?=[a-zа-я])|([a-zа-я])(?=\d)/g, "$1$2 ") // 14мм → 14 мм
    .split(/[^a-zа-я0-9_]+/)
    .filter((w) => w && !STOP.has(w) && !/^1$/.test(w));
  return [...new Set(t.map((w) => SYN[w] ?? w))];
}

/**
 * Насколько название поставщика похоже на наше, 0–100. Числа (диаметр, вес, номер модели) важнее слов:
 * «13 мм» и «14 мм» — разные товары, даже если всё остальное совпало.
 */
export function similarity(ours: string, theirs: string) {
  const a = tokens(ours);
  const b = new Set(tokens(theirs));
  if (!a.length || !b.size) return 0;
  const w = (t: string) => (/\d/.test(t) ? 2 : t.length <= 2 ? 0.5 : 1);
  let hit = 0;
  let all = 0;
  for (const t of a) {
    all += w(t);
    if (b.has(t)) hit += w(t);
  }
  let extra = 0;
  // Лишнее латинское слово у поставщика — скорее другая модель («Clear Black» против «Black»)
  for (const t of b) if (!a.includes(t)) extra += /\d/.test(t) ? 1.5 : /^[a-z]/.test(t) ? 1 : 0.35;
  // Наше число, которого нет у поставщика, — другой размер; разная жёсткость — другой товар
  const numsA = a.filter((t) => /^\d/.test(t));
  const hardA = a.filter((t) => HARD.has(t));
  const hardB = [...b].filter((t) => HARD.has(t));
  const clash = numsA.some((t) => !b.has(t)) || (hardA.length && hardB.length && !hardA.some((t) => b.has(t))) ? 0.5 : 1;
  return Math.round((100 * hit * clash) / (all + extra));
}

/** Что спрашивать у поиска поставщика: от точного к общему. Поиск там — по куску названия подряд */
export function searchQueries(name: string) {
  const clean = name.replace(/[«»"()]/g, " ").replace(/\s+/g, " ").trim();
  const out = [clean];
  // Подряд идущие латинские слова — обычно бренд и модель: «Kamui Black», «Predator Victory»
  const runs = clean.match(/[A-Za-z][A-Za-z0-9'’-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'’-]*)*/g) ?? [];
  const best = [...runs].sort((x, y) => y.length - x.length)[0];
  if (best) {
    const w = best.split(/\s+/);
    for (let n = Math.min(w.length, 3); n >= 1; n--) out.push(w.slice(0, n).join(" "));
  }
  // Названия без латиницы: первые слова подряд, затем первое значимое слово
  if (!best) {
    const w = clean.split(" ");
    if (w.length > 2) out.push(w.slice(0, 2).join(" "));
    const first = w.find((x) => /^[А-Яа-яЁё]{4,}$/.test(x));
    if (first) out.push(first);
  }
  return [...new Set(out.filter((q) => q.length >= 3))].slice(0, 5);
}

// ---------- Характеристики поставщика → наши ----------

export type Group = "cues" | "tips" | "chalk" | "balls" | "cloth" | "tables" | "gloves" | "merch" | "cases" | "other";

const num = (v: string) => {
  const m = v.replace(/\s/g, "").match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : null;
};
/** «3,610 кг» → 3610; «19 oz (535-545 г)» → 535; «58 г» → 58 */
export function grams(v: string) {
  const g = v.match(/(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(кг|г)(?![а-я])/i);
  if (!g) return null;
  const n = Number(g[1].replace(",", "."));
  return Math.round(g[2].toLowerCase() === "кг" ? n * 1000 : n);
}
const cm = (v: string) => {
  const n = num(v);
  if (n == null) return null;
  return /мм/i.test(v) ? n / 10 : /(^|[^с])м(\s|$)/i.test(v) && !/см/i.test(v) ? n * 100 : n;
};
const mm = (v: string) => {
  const n = num(v);
  return n == null ? null : /см/i.test(v) ? n * 10 : n;
};
const cap = (v: string) => (v ? v[0].toUpperCase() + v.slice(1) : v);
/** «Purple (фиолетовый)» → «Фиолетовый»; «Kamui (Япония)» → «Kamui» */
const inParens = (v: string) => v.match(/\(([^)]+)\)/)?.[1]?.trim() ?? null;
const noParens = (v: string) => v.replace(/\s*\([^)]*\)/g, "").trim();

function hardness(v: string) {
  const t = v.toLowerCase();
  if (/super\s*soft|\bss\b|очень мягк/.test(t)) return "Мягкая";
  if (/medium\s*[/-]?\s*hard|\bmh\b|средне-ж/.test(t)) return "Средне-жёсткая";
  if (/super\s*hard|\bxh\b|\bsh\b|очень ж/.test(t)) return "Очень жёсткая";
  if (/soft|мягк/.test(t)) return "Мягкая";
  if (/medium|средн/.test(t)) return "Средняя";
  if (/hard|ж[её]стк/.test(t)) return "Жёсткая";
  return null;
}
function game(v: string) {
  const t = v.toLowerCase();
  const hits = [/пирамид|русск/.test(t), /пул/.test(t), /снукер/.test(t)].filter(Boolean).length;
  if (hits > 1) return "Универсальный";
  return /пирамид|русск/.test(t) ? "Русский бильярд" : /пул/.test(t) ? "Пул" : /снукер/.test(t) ? "Снукер" : null;
}
function parts(v: string) {
  const n = num(v);
  return n === 1 ? "Цельный" : n === 2 ? "Разборный 1/2" : n === 3 ? "Трёхсоставной" : null;
}
const COUNTRY: Record<string, string> = { кнр: "Китай", "сша": "США", рф: "Россия", "российская федерация": "Россия", "великобритания": "Великобритания" };

/** Вес для расчёта доставки: брутто, иначе нетто */
export function shippingGrams(specs: Spec[]) {
  const s = specs.find((x) => /^вес брутто$/i.test(x.name)) ?? specs.find((x) => /^вес( нетто)?$/i.test(x.name));
  const g = s ? grams(s.value) : null;
  return g && g > 0 && g < 500_000 ? g : null;
}

/**
 * Какие наши характеристики (по ключу) можно заполнить из характеристик поставщика.
 * from — имя характеристики у поставщика: её потом не повторяем в описании.
 */
export function mapSpecs(specs: Spec[], group: Group): { key: string; value: string; from: string }[] {
  const out: { key: string; value: string; from: string }[] = [];
  const put = (key: string, value: string | number | null | undefined, from: string) => {
    if (value == null || value === "" || out.some((o) => o.key === key)) return;
    out.push({ key, value: typeof value === "number" ? String(Math.round(value * 100) / 100) : value, from });
  };
  for (const { name, value } of specs) {
    const n = name.toLowerCase().replace(/ё/g, "е");
    if (n === "бренд") put("brand", noParens(value), name);
    else if (n === "страна производства") put("country", COUNTRY[value.toLowerCase()] ?? cap(value), name);
    else if (/^вес( нетто| кия| шара)?$/.test(n) && group !== "tips" && group !== "chalk") put("weight", grams(value), name);
    else if (n === "длина" || n === "длина кия") put("length", cm(value), name);
    else if (n === "диаметр наклейки" || (group === "tips" && n === "диаметр")) put("tip", mm(value), name);
    else if (n === "диаметр шаров" || n === "диаметр шара" || (group === "balls" && n === "диаметр")) put("ball_diameter", mm(value), name);
    else if (n === "жесткость") put("hardness", hardness(value), name);
    else if (n === "количество слоев" || n === "кол-во слоев") put("layers", num(value), name);
    else if (/^кол(ичест|-)во .*в упаковке$/.test(n) && group === "chalk") put("pack", num(value), name);
    else if (n === "ширина рулона") put("cloth_width", cm(value), name);
    else if (n === "плотность") put("cloth_density", num(value), name);
    else if (n === "состав" && /шерст/i.test(value)) put("wool", num(value.match(/(\d+)\s*%\s*шерст/i)?.[1] ?? value.match(/шерст[а-я]*\s*(\d+)/i)?.[1] ?? ""), name);
    else if (n === "материал") put("material", cap(value), name);
    else if (n === "цвет" || n === "цветовая гамма") put("color", cap(inParens(value) ?? value), name);
    else if (n === "тип игры") put("game", game(value), name);
    else if (n === "кол-во частей" || n === "количество частей") put("construction", parts(value), name);
    else if (n === "материал шафта") put("shaft", cap(value.replace(/^канадский\s+/i, "").replace(/клен/i, "клён")), name);
    else if (n === "материал турняка") put("butt", cap(value), name);
    else if (n === "кол-во киев" || n === "количество киев") put("cue_slots", num(value), name);
    else if (n === "размер" && /^(xs|s|m|l|xl|xxl)$/i.test(value.trim())) put("size", value.trim().toUpperCase(), name);
  }
  return out;
}

/** То, что покупателю не интересно: упаковка, габариты коробки, юрлицо производителя */
export const isLogistics = (name: string) => /упаковк|упаковано|вес брутто|^производитель$|крепежн/i.test(name);
