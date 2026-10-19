/**
 * Кий «Чемпион» на заказ: описание конструктора, расчёт цены, код выбранной сборки и схема кия.
 * Файл общий для сервера и браузера — без обращений к базе.
 *
 * Сборка хранится в корзине как строка-«вариант»: cue:b-ab12.s-cd34.…​.e-<гравировка>.
 * Цену по ней всегда пересчитывает сервер по текущему прайсу.
 */

export type CueGroupId = "b" | "s" | "l" | "w" | "t" | "c" | "j" | "i" | "r" | "x" | "k" | "e";

export interface CueOption {
  id: string;
  name: string;
  price: number; // доплата, копейки
  color?: string; // #rrggbb — для схемы (дерево, металл, вставки, кольца)
  hidden?: boolean;
}

export interface CueGroup {
  id: CueGroupId;
  title: string;
  help?: string;
  hidden?: boolean;
  options: CueOption[];
  /** Только для гравировки: доплата и длина текста */
  price?: number;
  maxLength?: number;
}

export interface CueConfig {
  enabled: boolean;
  title: string;
  intro: string;
  basePrice: number; // копейки
  leadDays: number; // срок изготовления, дней
  groups: CueGroup[];
}

/** Что рисует каждая группа и нужен ли цвет у вариантов */
export const CUE_GROUPS: { id: CueGroupId; title: string; color: boolean; text?: boolean }[] = [
  { id: "b", title: "Турняк (порода дерева)", color: true },
  { id: "s", title: "Древко (порода дерева)", color: true },
  { id: "l", title: "Длина", color: false },
  { id: "w", title: "Вес", color: false },
  { id: "t", title: "Диаметр наклейки", color: false },
  { id: "c", title: "Конструкция", color: false },
  { id: "j", title: "Соединение", color: true },
  { id: "i", title: "Вставки на турняке", color: true },
  { id: "r", title: "Кольца", color: true },
  { id: "x", title: "Удлинитель", color: false },
  { id: "k", title: "Тубус или чехол", color: false },
  { id: "e", title: "Гравировка имени", color: false, text: true },
];

const o = (id: string, name: string, rub: number, color?: string): CueOption => ({ id, name, price: rub * 100, ...(color ? { color } : {}) });

/** Пример прайса — владелец меняет всё в админке перед включением */
export const CUE_DEFAULT: CueConfig = {
  enabled: false,
  title: "Кий «Чемпион» на заказ",
  intro: "Соберите кий под себя: породы дерева, длина, вес, отделка. Делаем вручную в нашей мастерской.",
  basePrice: 25_000_00,
  leadDays: 30,
  groups: [
    { id: "b", title: "Турняк", help: "Нижняя часть кия — за неё держит рука", options: [o("gr", "Граб", 0, "#c9a27a"), o("bb", "Бубинга", 6000, "#7a2e1f"), o("pl", "Палисандр", 8000, "#4a2a1c"), o("eb", "Эбен", 12000, "#1c1512")] },
    { id: "s", title: "Древко", help: "Верхняя часть кия, по которой скользит рука", options: [o("gr", "Граб", 0, "#d8b48a"), o("kl", "Клён", 3000, "#ecd9b4"), o("ya", "Ясень", 2000, "#e2cfa6")] },
    { id: "l", title: "Длина", options: [o("157", "157 см", 0), o("160", "160 см", 0), o("163", "163 см", 0)] },
    { id: "w", title: "Вес", options: [o("680", "680 г", 0), o("700", "700 г", 0), o("720", "720 г", 0), o("740", "740 г", 0)] },
    { id: "t", title: "Диаметр наклейки", options: [o("125", "12,5 мм", 0), o("130", "13 мм", 0), o("135", "13,5 мм", 0)] },
    { id: "c", title: "Конструкция", help: "Где кий разбирается", options: [o("12", "Разборный 1/2", 0), o("34", "Разборный 3/4", 4000)] },
    { id: "j", title: "Соединение", options: [o("br", "Латунь", 0, "#c9a54a"), o("st", "Нержавеющая сталь", 2000, "#b8bec4")] },
    { id: "i", title: "Вставки на турняке", options: [o("no", "Без вставок", 0), o("kl", "Клён", 4000, "#ecd9b4"), o("br", "Латунь", 5000, "#c9a54a"), o("pm", "Перламутр", 7000, "#e8e4f0")] },
    { id: "r", title: "Кольца", options: [o("no", "Без колец", 0), o("br", "Латунные", 1500, "#c9a54a"), o("sv", "Серебристые", 1500, "#cfd4d8")] },
    { id: "x", title: "Удлинитель", options: [o("no", "Не нужен", 0), o("ye", "Нужен", 3500)] },
    { id: "k", title: "Тубус или чехол", options: [o("no", "Без тубуса", 0), o("tb", "Тубус", 4000), o("lc", "Кожаный чехол", 6500)] },
    { id: "e", title: "Гравировка имени", help: "Латиница или кириллица, до 24 знаков", options: [], price: 1500_00, maxLength: 24 },
  ],
};

/** Конфиг из базы + умолчания: недостающие группы добавляем, лишние отбрасываем */
export function mergeCue(raw: unknown): CueConfig {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<CueConfig>;
  const groups = CUE_GROUPS.map((g) => {
    const def = CUE_DEFAULT.groups.find((x) => x.id === g.id)!;
    const got = Array.isArray(v.groups) ? v.groups.find((x) => x?.id === g.id) : undefined;
    return got ? { ...def, ...got, id: g.id, options: Array.isArray(got.options) ? got.options : def.options } : def;
  });
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : CUE_DEFAULT.enabled,
    title: typeof v.title === "string" && v.title.trim() ? v.title : CUE_DEFAULT.title,
    intro: typeof v.intro === "string" ? v.intro : CUE_DEFAULT.intro,
    basePrice: Number.isInteger(v.basePrice) ? v.basePrice! : CUE_DEFAULT.basePrice,
    leadDays: Number.isInteger(v.leadDays) ? v.leadDays! : CUE_DEFAULT.leadDays,
    groups,
  };
}

export type CueSelection = Partial<Record<CueGroupId, string>>;

export const visibleGroups = (c: CueConfig) => c.groups.filter((g) => !g.hidden && (g.id === "e" || g.options.some((x) => !x.hidden)));
export const visibleOptions = (g: CueGroup) => g.options.filter((x) => !x.hidden);

/** Выбор по умолчанию — первый вариант в каждой группе, без гравировки */
export function defaultSelection(c: CueConfig): CueSelection {
  const sel: CueSelection = {};
  for (const g of visibleGroups(c)) if (g.id !== "e") sel[g.id] = visibleOptions(g)[0]?.id;
  return sel;
}

/** Только то, что можно выгравировать: буквы, цифры, пробел и простая пунктуация */
export function cleanEngraving(text: string, max = 24) {
  return text
    .replace(/[^\p{L}\p{N} .,'«»"&№#-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const ID_RE = /^[a-z0-9]{1,8}$/;

export function cueKey(sel: CueSelection) {
  const parts: string[] = [];
  for (const g of CUE_GROUPS) {
    const v = sel[g.id];
    if (!v) continue;
    // точка — разделитель частей, поэтому в гравировке её тоже кодируем
    parts.push(g.id === "e" ? `e-${encodeURIComponent(v).replace(/\./g, "%2E")}` : `${g.id}-${v}`);
  }
  return `cue:${parts.join(".")}`;
}

export const isCueKey = (k: string) => k.startsWith("cue:");

export function parseCueKey(key: string): CueSelection | null {
  if (!isCueKey(key) || key.length > 400) return null;
  const sel: CueSelection = {};
  for (const part of key.slice(4).split(".")) {
    if (!part) continue;
    const id = part[0] as CueGroupId;
    if (part[1] !== "-" || !CUE_GROUPS.some((g) => g.id === id)) return null;
    const val = part.slice(2);
    if (id === "e") {
      try {
        sel.e = decodeURIComponent(val);
      } catch {
        return null;
      }
    } else if (ID_RE.test(val)) sel[id] = val;
    else return null;
  }
  return sel;
}

export interface CueResolved {
  price: number;
  /** Строки для заказа и мастерской: «Турняк: Бубинга» */
  spec: { group: string; value: string; price: number }[];
  /** Коротко для корзины и чека */
  summary: string;
  colors: { butt: string; shaft: string; joint: string; inlay: string | null; rings: string | null };
  joint34: boolean;
  extension: boolean;
  engraving: string | null;
}

/** Проверка сборки по текущему прайсу. Строка — понятная ошибка для покупателя. */
export function resolveCue(c: CueConfig, sel: CueSelection): CueResolved | string {
  let price = c.basePrice;
  let engraving: string | null = null;
  const spec: CueResolved["spec"] = [];
  const pick: Partial<Record<CueGroupId, CueOption>> = {};
  for (const g of visibleGroups(c)) {
    if (g.id === "e") {
      const text = cleanEngraving(sel.e ?? "", g.maxLength ?? 24);
      if (sel.e && text !== sel.e.trim().replace(/\s+/g, " ")) return "В гравировке недопустимые символы";
      if (text) {
        engraving = text;
        price += g.price ?? 0;
        spec.push({ group: g.title, value: `«${text}»`, price: g.price ?? 0 });
      }
      continue;
    }
    const opt = visibleOptions(g).find((x) => x.id === sel[g.id]);
    if (!opt) return `Выберите: ${g.title.toLowerCase()}`;
    pick[g.id] = opt;
    price += opt.price;
    spec.push({ group: g.title, value: opt.name, price: opt.price });
  }
  const short = [pick.b && pick.s ? `${pick.b.name} / ${pick.s.name.toLowerCase()}` : pick.b?.name ?? pick.s?.name, pick.l?.name, pick.w?.name]
    .filter(Boolean)
    .join(", ");
  return {
    price,
    spec,
    summary: short,
    colors: {
      butt: pick.b?.color ?? "#6b3b22",
      shaft: pick.s?.color ?? "#e2c9a0",
      joint: pick.j?.color ?? "#c9a54a",
      inlay: pick.i?.color ?? null,
      rings: pick.r?.color ?? null,
    },
    joint34: /3\s*\/\s*4/.test(pick.c?.name ?? ""),
    // «Не нужен» / «Без …» — удлинителя нет
    extension: !!pick.x && pick.x.id !== "no" && !/^(не|без)(\s|$)/i.test(pick.x.name.trim()),
    engraving,
  };
}

/** Спецификация одним текстом — для заказа, письма и мастерской */
export const specText = (r: CueResolved) => r.spec.map((x) => `${x.group}: ${x.value}`).join("\n");

const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

function shade(hex: string, k: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Схема кия (SVG). Горизонтально: слева торец турняка, справа наклейка.
 * thumb — квадратная миниатюра для корзины (кий по диагонали).
 */
export function cueSvg(r: Pick<CueResolved, "colors" | "joint34" | "extension" | "engraving">, opts: { thumb?: boolean; id?: string } = {}) {
  const id = (opts.id ?? "c").replace(/[^a-z0-9]/gi, "");
  const W = 1000;
  const x0 = 20; // торец
  const x1 = 980; // наклейка
  const cy = 46;
  const half = (x: number) => 15 - ((x - x0) / (x1 - x0)) * 9.5; // от 15 до 5.5 — толщина
  // Турняк — нижняя половина кия; разъём посередине (1/2) или в нижней четверти (3/4)
  const buttX = x0 + (x1 - x0) * 0.5;
  const jointX = r.joint34 ? x0 + (x1 - x0) * 0.27 : buttX;
  const seg = (a: number, b: number) => `M${a},${cy - half(a)} L${b},${cy - half(b)} L${b},${cy + half(b)} L${a},${cy + half(a)} Z`;
  const { butt, shaft, joint, inlay, rings } = r.colors;
  const buttEnd = x0 + 14; // резиновый торец
  const wrapA = x0 + 70;
  const wrapB = x0 + 250; // зона хвата
  const ferrule = x1 - 14;
  const g = (name: string, color: string) =>
    `<linearGradient id="${id}${name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(color, 0.35)}"/><stop offset=".45" stop-color="${color}"/><stop offset="1" stop-color="${shade(color, -0.45)}"/></linearGradient>`;
  const grain = `<pattern id="${id}grain" width="46" height="6" patternUnits="userSpaceOnUse"><path d="M0,2 C12,1 22,4 46,2.5" stroke="#000" stroke-opacity=".14" fill="none" stroke-width=".8"/><path d="M0,5 C18,4.2 30,5.8 46,4.6" stroke="#fff" stroke-opacity=".08" fill="none" stroke-width=".7"/></pattern>`;
  const shine = `<linearGradient id="${id}shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>`;

  // Вставки: «пики» от зоны хвата к соединению
  let points = "";
  if (inlay) {
    const n = 4;
    const from = wrapB + 10;
    const to = buttX - 30;
    if (to - from > 60) {
      for (let k = 0; k < n; k++) {
        const y = k % 2 ? cy + half(from) * 0.35 : cy - half(from) * 0.35;
        const tipX = from + (to - from) * (0.55 + 0.1 * (k % 2));
        points += `<path d="M${from},${y - 3.2} L${tipX},${y} L${from},${y + 3.2} Z" fill="${inlay}" opacity=".95"/>`;
      }
    }
  }
  const ring = (x: number, w = 4) => (rings ? `<rect x="${x}" y="${cy - half(x) - 0.3}" width="${w}" height="${2 * half(x) + 0.6}" fill="${rings}"/>` : "");
  const text = r.engraving
    ? `<text x="${(wrapA + wrapB) / 2}" y="${cy + 3.6}" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="10" fill="#e8d3a0" fill-opacity=".9">${esc(r.engraving)}</text>`
    : "";
  const ext = r.extension
    ? `<g transform="translate(${x0 - 6},${cy + 26})"><path d="M0,${-10} L150,${-9} L150,9 L0,10 Z" fill="url(#${id}butt)"/><path d="M0,${-10} L150,${-9} L150,9 L0,10 Z" fill="url(#${id}shine)"/><rect x="0" y="-10" width="9" height="20" fill="#151515"/><rect x="150" y="-4" width="12" height="8" fill="${joint}"/><text x="176" y="4" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" fill-opacity=".6">удлинитель</text></g>`
    : "";

  const body = `
<defs>${g("butt", butt)}${g("shaft", shaft)}${grain}${shine}</defs>
<path d="${seg(buttEnd, buttX)}" fill="url(#${id}butt)"/>
<path d="${seg(buttEnd, buttX)}" fill="url(#${id}grain)"/>
<path d="${seg(buttX, ferrule)}" fill="url(#${id}shaft)"/>
<path d="${seg(buttX, ferrule)}" fill="url(#${id}grain)" opacity=".6"/>
<path d="${seg(wrapA, wrapB)}" fill="#000" fill-opacity=".18"/>
${points}
${ring(wrapA - 6)}${ring(wrapB + 2)}${ring(buttX - 6)}
<rect x="${jointX - 3}" y="${cy - half(jointX) - 0.6}" width="9" height="${2 * half(jointX) + 1.2}" fill="${joint}"/>
<path d="${seg(x0, buttEnd)}" fill="#141414"/>
<path d="${seg(ferrule, x1 - 4)}" fill="#f2efe8"/>
<path d="${seg(x1 - 4, x1)}" fill="#2f5d8a"/>
<path d="${seg(x0, x1)}" fill="url(#${id}shine)"/>
${text}${ext}`;

  if (opts.thumb) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" fill="#141416"/><g transform="translate(60 60) rotate(-45) scale(0.155) translate(-500 -46)">${body.replace(ext, "")}</g></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${r.extension ? 92 : 64}" role="img" aria-label="Схема кия">${body}</svg>`;
}
