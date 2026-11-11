/**
 * Какие товары каталога — кии (а не мел, наклейки и аксессуары), и их параметры текстом.
 * Используется в подборе кия и при регистрации кия с паспортом.
 */
import "server-only";
import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { attrValues, formatAttr, listAttributes } from "@/lib/attributes";
import { isGroup, type GroupKey } from "@/lib/attributes-pro";

/** Не кии: мел, наклейки, шары и прочее — даже если у них указан вес */
const NOT_CUE_GROUPS: GroupKey[] = ["tips", "chalk", "balls", "cloth", "tables", "gloves", "merch", "cases"];
const NOT_CUE_NAME = /(^|\s)мел(\s|$|ки|ок)|мелок|мелки|наклейк|перчат|чехол|чехл|тубус|шар|сукн|футболк|худи|стол/i;
const CUE_NAME = /(^|[\s«"(])ки[йяи](\s|[»",)]|$)/i;

type Cat = { id: string; name: string; slug: string; parentId: string | null };

/** Проверка «это кий»: категория «Кии» (или её подкатегория) либо «кий» в названии — без мела и аксессуаров */
export async function cueMatcher() {
  const cats: Cat[] = await db.query.category.findMany({ columns: { id: true, name: true, slug: true, parentId: true } });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const chain = (id: string | null | undefined) => {
    const out: Cat[] = [];
    for (let c = id ? byId.get(id) : undefined, i = 0; c && i < 5; c = c.parentId ? byId.get(c.parentId) : undefined, i++) out.push(c);
    return out;
  };
  return (p: { name: string; categoryId: string | null }) => {
    if (NOT_CUE_NAME.test(p.name)) return false;
    const path = chain(p.categoryId);
    if (path.some((c) => NOT_CUE_GROUPS.some((g) => isGroup(g, c)))) return false;
    return path.some((c) => isGroup("cues", c)) || CUE_NAME.test(p.name);
  };
}

export interface CueModel {
  id: string;
  name: string;
  spec: string; // «Длина: 160 см» по строкам — из характеристик товара
  photo: string | null;
}

/** Модели киёв из каталога (включая черновики) — для регистрации кия: параметры и фото подставляются */
export async function cueModels(): Promise<CueModel[]> {
  const [rows, isCue, attrs] = await Promise.all([
    db.query.product.findMany({
      columns: { id: true, name: true, categoryId: true },
      with: { images: { orderBy: asc(s.productImage.sortOrder), limit: 1 } },
      orderBy: asc(s.product.name),
      limit: 1000,
    }),
    cueMatcher(),
    listAttributes(),
  ]);
  const cues = rows.filter(isCue);
  const vals = await attrValues(cues.map((c) => c.id));
  return cues.map((c) => {
    const v = vals.get(c.id);
    const spec = attrs
      .filter((a) => v?.has(a.id))
      .map((a) => `${a.name}: ${formatAttr(a, v!.get(a.id)!)}`)
      .join("\n");
    return { id: c.id, name: c.name, spec, photo: c.images[0]?.url ?? null };
  });
}
