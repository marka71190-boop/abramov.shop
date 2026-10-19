/**
 * Кий «Чемпион» на заказ: описание конструктора, расчёт цены, код выбранной сборки и схема кия.
 * Файл общий для сервера и браузера — без обращений к базе.
 *
 * Сборка хранится в корзине как строка-«вариант»: cue:b-ab12.s-cd34.…​.e-<гравировка>.
 * Цену по ней всегда пересчитывает сервер по текущему прайсу.
 */

export type CueGroupId = "b" | "s" | "l" | "w" | "t" | "c" | "j" | "i" | "v" | "n" | "p" | "u" | "m" | "g" | "r" | "x" | "k" | "e";

/** Рисунок запила на схеме */
export const SPLICE_PATTERNS = {
  classic: "Классика (венский, ёлочка)",
  crown: "Корона",
  tulip: "Тюльпан",
  saturn: "Сатурн",
  web: "Паутина",
  parrot: "Попугай (Марс)",
  dovetail: "Ласточкин хвост",
  spike: "Колосок",
  flower: "Цветок",
} as const;
export type SplicePattern = keyof typeof SPLICE_PATTERNS;

export interface CueOption {
  id: string;
  name: string;
  price: number; // доплата, копейки
  color?: string; // #rrggbb — для схемы (дерево, металл, вставки, кольца)
  pattern?: SplicePattern; // вид запила — как рисовать
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
export const CUE_GROUPS: { id: CueGroupId; title: string; color: boolean; text?: boolean; pattern?: boolean }[] = [
  { id: "b", title: "Турняк (порода дерева)", color: true },
  { id: "s", title: "Древко (порода дерева)", color: true },
  { id: "l", title: "Длина", color: false },
  { id: "w", title: "Вес", color: false },
  { id: "t", title: "Диаметр наклейки", color: false },
  { id: "c", title: "Конструкция", color: false },
  { id: "j", title: "Соединение", color: true },
  { id: "i", title: "Запилы на турняке (порода)", color: true },
  { id: "v", title: "Запилы на турняке (вид)", color: false, pattern: true },
  { id: "n", title: "Запилы на турняке (количество)", color: false },
  { id: "p", title: "Запилы на шафте (порода)", color: true },
  { id: "u", title: "Запилы на шафте (вид)", color: false, pattern: true },
  { id: "m", title: "Запилы на шафте (количество)", color: false },
  { id: "g", title: "Длина запилов", color: false },
  { id: "r", title: "Кольца", color: true },
  { id: "x", title: "Удлинитель", color: false },
  { id: "k", title: "Тубус или чехол", color: false },
  { id: "e", title: "Гравировка имени", color: false, text: true },
];

const o = (id: string, name: string, rub: number, color?: string): CueOption => ({ id, name, price: rub * 100, ...(color ? { color } : {}) });
const sp = (pattern: SplicePattern, rub: number): CueOption => ({ id: pattern.slice(0, 8), name: SPLICE_PATTERNS[pattern], price: rub * 100, pattern });
const styles = (k: number) => [sp("classic", 0), sp("crown", 8000 * k), sp("tulip", 6000 * k), sp("saturn", 7000 * k), sp("web", 6000 * k), sp("parrot", 6000 * k), sp("dovetail", 5000 * k), sp("spike", 5000 * k), sp("flower", 7000 * k)];
const counts = (k: number) => [4, 5, 6, 8, 10, 12, 17, 22].map((n) => o(String(n), `${n} ${n % 10 === 1 && n !== 11 ? "запил" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n) ? "запила" : "запилов"}`, n <= 4 ? 0 : (n - 4) * 1000 * k));

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
    { id: "i", title: "Запилы на турняке", help: "Клинья другой породы, вклеенные в турняк", options: [o("eb", "Эбен", 0, "#1c1512"), o("bb", "Бубинга", 0, "#7a2e1f"), o("pl", "Палисандр", 0, "#4a2a1c"), o("kl", "Клён", 0, "#ecd9b4"), o("no", "Без запилов", 0)] },
    { id: "v", title: "Вид запила на турняке", help: "Рисунок на схеме примерный", options: styles(1) },
    { id: "n", title: "Сколько запилов на турняке", options: counts(1) },
    { id: "p", title: "Запилы на шафте", help: "Клинья у соединения, на верхней части кия", options: [o("eb", "Эбен", 0, "#1c1512"), o("bb", "Бубинга", 0, "#7a2e1f"), o("pl", "Палисандр", 0, "#4a2a1c"), o("gr", "Граб", 0, "#b8875a"), o("no", "Без запилов", 0)] },
    { id: "u", title: "Вид запила на шафте", options: styles(0.5) },
    { id: "m", title: "Сколько запилов на шафте", options: counts(0.5) },
    { id: "g", title: "Длина запилов", options: [o("no", "Обычные", 0), o("ln", "Длинные", 4000)] },
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

/** «6 запилов» → 6 (для схемы); без числа — как по умолчанию */
const countOf = (name: string | undefined, def: number) => Math.min(24, Math.max(2, Number(/\d+/.exec(name ?? "")?.[0]) || def));

export interface CueResolved {
  price: number;
  /** Строки для заказа и мастерской: «Турняк: Бубинга» */
  spec: { group: string; value: string; price: number }[];
  /** Коротко для корзины и чека */
  summary: string;
  colors: { butt: string; shaft: string; joint: string; inlay: string | null; shaftInlay: string | null; rings: string | null };
  /** Запилы: сколько, какой рисунок, длинные или обычные */
  points: { butt: number; shaft: number; buttStyle: SplicePattern; shaftStyle: SplicePattern; long: boolean };
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
      shaftInlay: pick.p?.color ?? null,
      rings: pick.r?.color ?? null,
    },
    joint34: /3\s*\/\s*4/.test(pick.c?.name ?? ""),
    points: {
      butt: countOf(pick.n?.name, 4),
      shaft: countOf(pick.m?.name, 4),
      buttStyle: pick.v?.pattern ?? "classic",
      shaftStyle: pick.u?.pattern ?? "classic",
      long: !!pick.g && /длин/i.test(pick.g.name),
    },
    // «Не нужен» / «Без …» — удлинителя нет
    extension: !!pick.x && pick.x.id !== "no" && !/^(не|без)(\s|$)/i.test(pick.x.name.trim()),
    engraving,
  };
}

type Pt = [number, number];
export const spliceShapes = (style: SplicePattern): { fill: Pt[][]; lines?: Pt[][]; band?: boolean } => {
  const curve = (f: (u: number) => number, steps = 14): Pt[] => {
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const w = Math.max(0, Math.min(1, f(u)));
      left.push([u, -w]);
      right.unshift([u, w]);
    }
    return [...left, ...right];
  };
  switch (style) {
    case "crown":
      return { fill: [0, 1, 2].map((j) => { const c = 0.18 + 0.3 * j; const w = 0.85 - 0.22 * j; return [[c - 0.15, 0], [c, -w], [c + 0.15, 0], [c, w]] as Pt[]; }) };
    case "tulip":
      return { fill: [curve((u) => (1 - u) ** 0.7 * (1 + 0.55 * Math.sin(Math.PI * u * 0.95)))] };
    case "saturn":
      return { fill: [curve((u) => (1 - u) ** 0.7 * (1 + 0.55 * Math.sin(Math.PI * u * 0.95)))], band: true };
    case "web":
      return { fill: [[[0, -1], [0.3, 0], [0, 1]]], lines: [0.15, 0.35, 0.55, 0.75].map((u0) => [[u0, -1], [u0 + 0.25, 0], [u0, 1]] as Pt[]) };
    case "parrot":
      return { fill: [[...Array.from({ length: 13 }, (_, k): Pt => [k / 12, -1 + k / 12]), ...Array.from({ length: 13 }, (_, k): Pt => { const u = 1 - k / 12; return [u, 1 - Math.sqrt(u)]; })]] };
    case "dovetail":
      return { fill: [[[0, -0.35], [0.62, -0.35], [1, -0.95], [1, 0.95], [0.62, 0.35], [0, 0.35]]] };
    case "spike":
      return { fill: [0, 1, 2, 3, 4].map((j) => { const u0 = 0.04 + 0.19 * j; return [[u0, -0.85], [u0 + 0.17, 0], [u0, 0.85], [u0 + 0.07, 0]] as Pt[]; }) };
    case "flower":
      return { fill: [curve((u) => 0.95 * Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.6), [[0.55, -0.12], [1, 0], [0.55, 0.12]]] };
    default: // классика (венский): клин и «ёлочка» из шпона внутри
      return { fill: [[[0, -1], [1, 0], [0, 1]]], lines: [[[0, -0.55], [0.55, 0], [0, 0.55]]] };
  }
};

/** Маленькая картинка вида запила для кнопки выбора: три дольки на плоской полосе дерева */
export function spliceIcon(style: SplicePattern, color = "#1c1512", wood = "#c9a27a") {
  const sh = spliceShapes(style);
  const W = 72, H = 26;
  const P = (row: number, [u, s]: Pt) => `${(6 + u * (W - 12)).toFixed(1)},${(H / 2 + (row + s * 0.46) * (H / 3)).toFixed(1)}`;
  let out = "";
  for (const row of [-1, 0, 1]) {
    for (const poly of sh.fill) out += `<path d="M${poly.map((q) => P(row, q)).join(" L")} Z" fill="${color}"/>`;
    for (const line of sh.lines ?? []) out += `<path d="M${line.map((q) => P(row, q)).join(" L")}" fill="none" stroke="${style === "web" ? color : wood}" stroke-width=".8"/>`;
  }
  if (sh.band) out += `<rect x="6" y="0" width="3" height="${H}" fill="${color}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="3" fill="${wood}"/>${out}</svg>`;
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
export function cueSvg(r: Pick<CueResolved, "colors" | "joint34" | "extension" | "engraving" | "points">, opts: { thumb?: boolean; id?: string } = {}) {
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
  const { butt, shaft, joint, inlay, shaftInlay, rings } = r.colors;
  const buttEnd = x0 + 14; // резиновый торец
  const wrapA = x0 + 70;
  const wrapB = x0 + 250; // зона хвата
  const ferrule = x1 - 14;
  const g = (name: string, color: string) =>
    `<linearGradient id="${id}${name}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(color, 0.35)}"/><stop offset=".45" stop-color="${color}"/><stop offset="1" stop-color="${shade(color, -0.45)}"/></linearGradient>`;
  const grainS = `<pattern id="${id}grainS" width="60" height="5" patternUnits="userSpaceOnUse"><path d="M0,1.5 C15,0.8 35,2.6 60,1.4" stroke="#5a3a1a" stroke-opacity=".28" fill="none" stroke-width=".7"/><path d="M0,3.8 C20,3.2 38,4.6 60,3.5" stroke="#7a5228" stroke-opacity=".2" fill="none" stroke-width=".6"/></pattern>`;
  const grain = `<pattern id="${id}grain" width="46" height="6" patternUnits="userSpaceOnUse"><path d="M0,2 C12,1 22,4 46,2.5" stroke="#000" stroke-opacity=".14" fill="none" stroke-width=".8"/><path d="M0,5 C18,4.2 30,5.8 46,4.6" stroke="#fff" stroke-opacity=".08" fill="none" stroke-width=".7"/></pattern>`;
  const shine = `<linearGradient id="${id}shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>`;

  // Запилы: N клиньев по окружности. Фигура задаётся в координатах «дольки»: u — от основания (0) к острию (1),
  // s — поперёк дольки (−1…1). Видны дольки, что смотрят на нас; поперечная координата — проекция цилиндра.
  const splice = (a: number, b: number, n: number, color: string, style: SplicePattern, base: string) => {
    if (b - a < 40) return "";
    const slot = Math.PI / n;
    const edge = shade(color, color === "#1c1512" || /^#[0-3]/.test(color) ? 0.5 : -0.35);
    const sh = spliceShapes(style);
    let out = "";
    const P = (th: number, [u, s]: Pt) => {
      const x = a + u * (b - a);
      const ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, th + s * slot * 0.92));
      return `${x.toFixed(1)},${(cy - half(x) * Math.sin(ang)).toFixed(2)}`;
    };
    for (let k = 0; k < n; k++) {
      // При 4, 8, 12… запилах разворачиваем на полдольки — так видны симметричные пары, как на настоящем кие
      const th0 = (2 * Math.PI * k) / n + (n % 4 === 0 ? Math.PI / n : 0);
      if (Math.cos(th0) < 0.05) continue;
      const th = Math.atan2(Math.sin(th0), Math.cos(th0));
      for (const poly of sh.fill) out += `<path d="M${poly.map((q) => P(th, q)).join(" L")} Z" fill="${color}" stroke="${edge}" stroke-width=".7" stroke-opacity=".8"/>`;
      for (const line of sh.lines ?? []) out += `<path d="M${line.map((q) => P(th, q)).join(" L")}" fill="none" stroke="${style === "web" ? color : base}" stroke-width="${style === "web" ? 1.1 : 0.9}" stroke-opacity=".9"/>`;
    }
    if (sh.band) out += `<path d="${seg(a, a + 7)}" fill="${color}"/>`;
    return out;
  };
  const len = (a: number, b: number) => a + (b - a) * (r.points.long ? 1 : 0.62);
  const buttA = wrapB + 6;
  const buttPoints = inlay ? splice(buttA, len(buttA, buttX - 12), r.points.butt, inlay, r.points.buttStyle, butt) : "";
  const shaftA = buttX + 8;
  const shaftPoints = shaftInlay ? splice(shaftA, len(shaftA, shaftA + (ferrule - shaftA) * 0.42), r.points.shaft, shaftInlay, r.points.shaftStyle, shaft) : "";
  const ring = (x: number, w = 4) => (rings ? `<rect x="${x}" y="${cy - half(x) - 0.3}" width="${w}" height="${2 * half(x) + 0.6}" fill="${rings}"/>` : "");
  const text = r.engraving
    ? `<text x="${(wrapA + wrapB) / 2}" y="${cy + 3.6}" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="10" fill="#e8d3a0" fill-opacity=".9">${esc(r.engraving)}</text>`
    : "";
  const ext = r.extension
    ? `<g transform="translate(${x0 - 6},${cy + 26})"><path d="M0,${-10} L150,${-9} L150,9 L0,10 Z" fill="url(#${id}butt)"/><path d="M0,${-10} L150,${-9} L150,9 L0,10 Z" fill="url(#${id}shine)"/><rect x="0" y="-10" width="9" height="20" fill="#151515"/><rect x="150" y="-4" width="12" height="8" fill="${joint}"/><text x="176" y="4" font-family="system-ui,sans-serif" font-size="11" fill="currentColor" fill-opacity=".6">удлинитель</text></g>`
    : "";

  const body = `
<defs>${g("butt", butt)}${g("shaft", shaft)}${grain}${grainS}${shine}</defs>
<path d="${seg(buttEnd, buttX)}" fill="url(#${id}butt)"/>
<path d="${seg(buttEnd, buttX)}" fill="url(#${id}grain)"/>
<path d="${seg(buttX, ferrule)}" fill="url(#${id}shaft)"/>
<path d="${seg(buttX, ferrule)}" fill="url(#${id}grainS)"/>
<path d="${seg(wrapA, wrapB)}" fill="#000" fill-opacity=".18"/>
${buttPoints}${shaftPoints}
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
