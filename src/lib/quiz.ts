/**
 * «Подбор кия за минуту»: ответы → параметры кия → лучшие кии из каталога и сборка «Чемпиона».
 * Файл общий для сервера и браузера: считает всё на месте, без запросов.
 */

export const QUIZ = [
  {
    id: "level",
    q: "Как давно вы играете?",
    a: [
      { id: "new", t: "Только начинаю", d: "Первый свой кий" },
      { id: "club", t: "Играю регулярно", d: "Клуб, друзья, пару раз в неделю" },
      { id: "pro", t: "Турниры", d: "Разряд или серьёзные цели" },
    ],
  },
  {
    id: "height",
    q: "Ваш рост?",
    a: [
      { id: "s", t: "До 170 см" },
      { id: "m", t: "170–185 см" },
      { id: "l", t: "Выше 185 см" },
    ],
  },
  {
    id: "style",
    q: "Какая игра вам ближе?",
    a: [
      { id: "soft", t: "Точная, мягкая", d: "Тонкие резки, контроль битка" },
      { id: "mid", t: "Универсальная", d: "По-разному, от позиции" },
      { id: "power", t: "Силовая", d: "Сильный удар, разбой, «накаты»" },
    ],
  },
  {
    id: "budget",
    q: "Какой бюджет?",
    a: [
      { id: "b1", t: "До 15 000 ₽" },
      { id: "b2", t: "15–35 тыс. ₽" },
      { id: "b3", t: "35–70 тыс. ₽" },
      { id: "b4", t: "Не ограничен", d: "Главное — качество" },
    ],
  },
  {
    id: "want",
    q: "Что вам важнее?",
    a: [
      { id: "ready", t: "Готовый кий сейчас", d: "Из наличия в каталоге" },
      { id: "custom", t: "Кий под себя", d: "Ручная работа «Чемпион»: дерево, вес, отделка" },
      { id: "any", t: "Покажите оба варианта" },
    ],
  },
] as const;

export type QuizQ = (typeof QUIZ)[number]["id"];
export type Answers = Partial<Record<QuizQ, string>>;

export interface Profile {
  length: number; // см
  weight: [number, number]; // г
  tip: number; // мм
  construction: "Разборный 1/2" | "Разборный 3/4";
  budget: [number, number]; // копейки
  /** Почему так — по строке на параметр */
  why: string[];
}

const BUDGET: Record<string, [number, number]> = {
  b1: [0, 15_000_00],
  b2: [15_000_00, 35_000_00],
  b3: [35_000_00, 70_000_00],
  b4: [0, Infinity],
};

export function profileFor(a: Answers): Profile {
  const length = a.height === "s" ? 157 : a.height === "l" ? 163 : 160;
  const weight: [number, number] = a.style === "soft" ? [680, 700] : a.style === "power" ? [720, 740] : [700, 720];
  const tip = a.style === "soft" ? 12.5 : 13;
  const construction = a.level === "new" ? "Разборный 1/2" : "Разборный 3/4";
  const why = [
    `Длина ${length} см — ${a.height === "s" ? "при росте до 170 см короче кий удобнее в стойке и у борта" : a.height === "l" ? "высокому игроку длинный кий даёт правильный упор и вынос руки" : "классическая длина для роста 170–185 см"}.`,
    `Вес ${weight[0]}–${weight[1]} г — ${a.style === "soft" ? "лёгкий кий тоньше чувствует биток и лучше в контроле" : a.style === "power" ? "тяжёлый кий легче разгоняет шар без лишнего усилия" : "золотая середина: и сила, и контроль"}.`,
    `Наклейка ${String(tip).replace(".", ",")} мм — ${tip < 13 ? "точнее попадание в нужную точку битка, проще винт" : "стабильнее удар и запас на ошибку"}.`,
    construction === "Разборный 1/2"
      ? "Разборный 1/2 — две равные части, удобно носить и проще в уходе. Для первого кия — лучший выбор."
      : "Разборный 3/4 — соединение ближе к турняку, кий ведёт себя как цельный: ровнее отдача и ощущение удара.",
  ];
  return { length, weight, tip, construction, budget: BUDGET[a.budget ?? "b4"] ?? BUDGET.b4, why };
}

export interface QuizProduct {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  price: number;
  weight: number | null;
  length: number | null;
  tip: number | null;
  construction: string | null;
  rating: number | null;
}

/** Насколько кий подходит: 0–100 и что совпало */
export function scoreProduct(p: QuizProduct, pr: Profile) {
  let score = 100;
  const hits: string[] = [];
  if (p.weight != null) {
    const off = p.weight < pr.weight[0] ? pr.weight[0] - p.weight : p.weight > pr.weight[1] ? p.weight - pr.weight[1] : 0;
    score -= Math.min(30, off / 2);
    if (off <= 5) hits.push(`вес ${p.weight} г`);
  } else score -= 8;
  if (p.length != null) {
    const off = Math.abs(p.length - pr.length);
    score -= Math.min(20, off * 4);
    if (off <= 1) hits.push(`длина ${p.length} см`);
  } else score -= 5;
  if (p.tip != null) {
    const off = Math.abs(p.tip - pr.tip);
    score -= Math.min(15, off * 16);
    if (off < 0.3) hits.push(`наклейка ${String(p.tip).replace(".", ",")} мм`);
  }
  if (p.construction) {
    if (p.construction === pr.construction) hits.push(p.construction.toLowerCase());
    else score -= 6;
  }
  const [lo, hi] = pr.budget;
  if (p.price > hi) score -= Math.min(45, 15 + ((p.price - hi) / hi) * 60);
  else if (p.price < lo) score -= Math.min(15, ((lo - p.price) / lo) * 30);
  else if (hi !== Infinity || lo) hits.push("в бюджете");
  if (p.rating) score += (p.rating - 4) * 2;
  return { score: Math.max(0, Math.round(score)), hits };
}

export function pickProducts(list: QuizProduct[], pr: Profile, n = 3) {
  return list
    .map((p) => ({ p, ...scoreProduct(p, pr) }))
    .sort((a, b) => b.score - a.score || a.p.price - b.p.price)
    .slice(0, n)
    .filter((x) => x.score >= 40);
}

/** Вариант конструктора «Чемпион», ближе всего к нужному числу: «160 см» → 160 */
export function nearestOption<T extends { id: string; name: string; hidden?: boolean }>(opts: T[], target: number): T | undefined {
  const num = (s: string) => Number(/\d+(?:[.,]\d+)?/.exec(s)?.[0]?.replace(",", "."));
  return opts
    .filter((o) => !o.hidden && Number.isFinite(num(o.name)))
    .sort((a, b) => Math.abs(num(a.name) - target) - Math.abs(num(b.name) - target))[0];
}
