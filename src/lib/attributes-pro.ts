/**
 * Стандартные характеристики бильярдных товаров — для карточки, фильтров и сравнения.
 * Каждая привязана к своим категориям (кии, наклейки, шары, сукно…): категория находится по названию или адресу.
 * Без server-only: вызывается и при старте сайта (scripts/seed.ts), и кнопкой в админке.
 */
import { eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as s from "../db/schema";
import type { AttrType } from "./attributes-defaults";

type Db = NodePgDatabase<typeof s>;

export type GroupKey = "cues" | "tips" | "chalk" | "balls" | "cloth" | "tables" | "gloves" | "merch" | "cases";

/** Как узнать категорию: по названию или по адресу (slug) */
const GROUPS: Record<GroupKey, { label: string; name: RegExp; slug: RegExp }> = {
  cues: { label: "Кии", name: /^(кии|кий)(\s|$)|\sкии(\s|$)/i, slug: /^(cues?|kii|kiy)(-|$)/i },
  tips: { label: "Наклейки", name: /наклейк/i, slug: /^(tips?|naklej|naklei)/i },
  chalk: { label: "Мел", name: /^мел(\s|$)|\sмел(\s|$)/i, slug: /^(chalk|mel)(-|$)/i },
  balls: { label: "Шары", name: /шар/i, slug: /^(balls?|shar)/i },
  cloth: { label: "Сукно", name: /сукн/i, slug: /^(cloth|sukn)/i },
  tables: { label: "Столы", name: /(^|\s)стол/i, slug: /^(tables?|stol)/i },
  gloves: { label: "Перчатки", name: /перчат/i, slug: /^(gloves?|perchat)/i },
  merch: { label: "Мерч и одежда", name: /мерч|одежд|футболк|худи/i, slug: /^(merch|odezhd|clothes)/i },
  cases: { label: "Чехлы и тубусы", name: /чехл|тубус|кейс/i, slug: /^(cases?|chekh|tubus)/i },
};

const YES_NO = ["Да", "Нет"];

interface Def {
  key: string;
  name: string;
  unit: string;
  type: AttrType;
  options?: string[];
  sortOrder: number;
  /** Категории, где характеристика нужна; пусто — у всех товаров */
  groups: GroupKey[];
}

export const PRO_ATTRIBUTES: Def[] = [
  { key: "game", name: "Игра", unit: "", type: "select", options: ["Русский бильярд", "Пул", "Снукер", "Универсальный"], sortOrder: 5, groups: ["cues", "tips", "balls", "cloth", "tables"] },
  { key: "level", name: "Уровень игрока", unit: "", type: "select", options: ["Начинающий", "Любитель", "Опытный", "Профессионал"], sortOrder: 6, groups: ["cues"] },
  // Уже были в стартовом наборе — теперь только у своих категорий
  { key: "length", name: "Длина", unit: "см", type: "number", sortOrder: 20, groups: ["cues", "cases"] },
  { key: "tip", name: "Диаметр наклейки", unit: "мм", type: "number", sortOrder: 30, groups: ["cues", "tips"] },
  { key: "hardness", name: "Жёсткость", unit: "", type: "select", options: ["Мягкая", "Средняя", "Средне-жёсткая", "Жёсткая", "Очень жёсткая"], sortOrder: 40, groups: ["cues", "tips"] },
  { key: "construction", name: "Конструкция", unit: "", type: "select", options: ["Цельный", "Разборный 1/2", "Разборный 3/4"], sortOrder: 50, groups: ["cues"] },
  // Кии
  { key: "shaft", name: "Древко", unit: "", type: "select", options: ["Клён", "Граб", "Ясень", "Бук", "Карбон"], sortOrder: 52, groups: ["cues"] },
  {
    key: "butt",
    name: "Турняк",
    unit: "",
    type: "select",
    options: ["Граб", "Палисандр", "Бубинга", "Эбен", "Амарант", "Венге", "Зебрано", "Падук", "Бокоте", "Кокоболо", "Клён", "Ясень"],
    sortOrder: 54,
    groups: ["cues"],
  },
  { key: "inlays", name: "Запилы", unit: "шт", type: "number", sortOrder: 56, groups: ["cues"] },
  { key: "balance", name: "Баланс от торца", unit: "см", type: "number", sortOrder: 57, groups: ["cues"] },
  { key: "joint", name: "Соединение", unit: "", type: "select", options: ["Латунь", "Нержавеющая сталь", "Дерево по дереву", "Быстросъёмное"], sortOrder: 58, groups: ["cues"] },
  { key: "handmade", name: "Ручная работа", unit: "", type: "select", options: YES_NO, sortOrder: 64, groups: ["cues"] },
  { key: "with_case", name: "Чехол в комплекте", unit: "", type: "select", options: YES_NO, sortOrder: 66, groups: ["cues"] },
  // Наклейки
  { key: "layers", name: "Слоёв", unit: "шт", type: "number", sortOrder: 35, groups: ["tips"] },
  // Мел
  { key: "pack", name: "В упаковке", unit: "шт", type: "number", sortOrder: 36, groups: ["chalk"] },
  // Шары
  { key: "ball_diameter", name: "Диаметр шаров", unit: "мм", type: "number", sortOrder: 22, groups: ["balls"] },
  { key: "ball_set", name: "Комплект", unit: "", type: "select", options: ["16 шаров", "Биток", "1 шар", "Набор для пула", "Набор для снукера"], sortOrder: 24, groups: ["balls"] },
  // Сукно
  { key: "cloth_width", name: "Ширина рулона", unit: "см", type: "number", sortOrder: 22, groups: ["cloth"] },
  { key: "cloth_density", name: "Плотность", unit: "г/м²", type: "number", sortOrder: 24, groups: ["cloth"] },
  { key: "wool", name: "Шерсть", unit: "%", type: "number", sortOrder: 26, groups: ["cloth"] },
  // Столы
  { key: "table_size", name: "Размер стола", unit: "", type: "select", options: ["12 футов", "11 футов", "10 футов", "9 футов", "8 футов", "7 футов"], sortOrder: 21, groups: ["tables"] },
  { key: "slate", name: "Плита", unit: "", type: "select", options: ["Сланец, 1 часть", "Сланец, 3 части", "Сланец, 5 частей", "ЛДСП / МДФ"], sortOrder: 23, groups: ["tables"] },
  { key: "slate_thickness", name: "Толщина плиты", unit: "мм", type: "number", sortOrder: 25, groups: ["tables"] },
  // Перчатки, одежда
  { key: "size", name: "Размер", unit: "", type: "select", options: ["XS", "S", "M", "L", "XL", "XXL", "Универсальный"], sortOrder: 21, groups: ["gloves", "merch"] },
  { key: "hand", name: "Рука", unit: "", type: "select", options: ["Левая", "Правая", "Обе"], sortOrder: 22, groups: ["gloves"] },
  // Чехлы и тубусы
  { key: "cue_slots", name: "Вмещает киёв", unit: "шт", type: "number", sortOrder: 22, groups: ["cases"] },
];

/** Какие категории подходят под каждую группу */
export function matchGroups(cats: { id: string; name: string; slug: string }[]) {
  const out = {} as Record<GroupKey, string[]>;
  for (const [g, m] of Object.entries(GROUPS) as [GroupKey, (typeof GROUPS)[GroupKey]][]) {
    out[g] = cats.filter((c) => m.name.test(c.name.trim()) || m.slug.test(c.slug)).map((c) => c.id);
  }
  return out;
}

export const GROUP_LABEL = Object.fromEntries(Object.entries(GROUPS).map(([k, v]) => [k, v.label])) as Record<GroupKey, string>;

/**
 * Создаёт недостающие характеристики и привязывает их к подходящим категориям.
 * Ничего не удаляет и не прячет уже заполненные значения: общую характеристику сужает до категорий,
 * только если у товаров других категорий она не заполнена.
 */
export async function installProAttributes(db: Db) {
  const cats = await db.select({ id: s.category.id, name: s.category.name, slug: s.category.slug }).from(s.category);
  const groups = matchGroups(cats);
  const existing = await db.select().from(s.attribute);
  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const d of PRO_ATTRIBUTES) {
    const target = [...new Set(d.groups.flatMap((g) => groups[g]))];
    const cur = existing.find((a) => a.key === d.key);
    if (d.groups.length && !target.length) {
      if (!cur) skipped.push(d.name);
      continue; // таких категорий в магазине пока нет
    }
    if (!cur) {
      await db
        .insert(s.attribute)
        .values({ key: d.key, name: d.name, unit: d.unit, type: d.type, options: d.options ?? [], categoryIds: target, filterable: d.type !== "text", sortOrder: d.sortOrder })
        .onConflictDoNothing({ target: s.attribute.key });
      created++;
      continue;
    }
    const patch: Partial<typeof s.attribute.$inferInsert> = {};
    if (cur.type === "select" && d.options) {
      const missing = d.options.filter((o) => !cur.options.some((x) => x.toLowerCase() === o.toLowerCase()));
      if (missing.length) patch.options = [...cur.options, ...missing];
    }
    if (cur.categoryIds.length) {
      const add = target.filter((id) => !cur.categoryIds.includes(id));
      if (add.length) patch.categoryIds = [...cur.categoryIds, ...add];
    } else if (target.length) {
      // Была у всех товаров: сужаем, только если значения заполнены лишь у товаров этих категорий
      const filled = await db
        .select({ categoryId: s.product.categoryId })
        .from(s.productAttribute)
        .innerJoin(s.product, eq(s.product.id, s.productAttribute.productId))
        .where(eq(s.productAttribute.attributeId, cur.id));
      if (filled.every((f) => f.categoryId && target.includes(f.categoryId))) patch.categoryIds = target;
    }
    if (Object.keys(patch).length) {
      await db.update(s.attribute).set(patch).where(eq(s.attribute.id, cur.id));
      updated++;
    }
  }
  return { created, updated, skipped };
}

/** Сколько значений заполнено по каждой характеристике у товаров заданной категории */
export async function fillStats(db: Db, productIds: string[]) {
  if (!productIds.length) return new Map<string, number>();
  const rows = await db.select({ a: s.productAttribute.attributeId }).from(s.productAttribute).where(inArray(s.productAttribute.productId, productIds));
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.a, (m.get(r.a) ?? 0) + 1);
  return m;
}
