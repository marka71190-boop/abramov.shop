/**
 * Комплекты со скидкой: «кий + чехол + мел — минус 10%».
 * Скидка срабатывает сама, когда в корзине есть все товары комплекта (любой вариант каждого).
 * Сколько полных комплектов собралось — на столько и скидка; одна единица товара идёт только в один комплект.
 */
import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { isPublic } from "@/lib/visibility";

export type Bundle = typeof s.bundle.$inferSelect;

export const BUNDLE_MIN = 2;
export const BUNDLE_MAX = 6;

export async function listBundles() {
  return db.query.bundle.findMany({ orderBy: [asc(s.bundle.sortOrder), asc(s.bundle.createdAt)] });
}

export async function activeBundles() {
  return db.query.bundle.findMany({ where: eq(s.bundle.isActive, true), orderBy: [asc(s.bundle.sortOrder), asc(s.bundle.createdAt)] });
}

const floorRub = (kop: number) => Math.floor(kop / 100) * 100;

export interface BundleLine {
  variantId: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
  spec?: string;
}

export interface BundleResult {
  /** Общая скидка за комплекты, копейки (кратно рублю) */
  discount: number;
  applied: { id: string; name: string; percent: number; sets: number; discount: number }[];
  /** Сколько скидки пришлось на каждую позицию — чтобы промокод считался от цены после комплекта */
  cut: Map<string, number>;
  /** Почти собранные комплекты: не хватает 1–2 товаров */
  hints: { id: string; name: string; percent: number; missing: string[] }[];
}

/** Применить комплекты к корзине. Сначала — с большей скидкой */
export function applyBundles(lines: BundleLine[], bundles: Bundle[]): BundleResult {
  const left = new Map(lines.filter((l) => !l.spec).map((l) => [l.variantId, l.qty]));
  const cut = new Map<string, number>();
  const applied: BundleResult["applied"] = [];
  const hints: BundleResult["hints"] = [];
  const byProduct = (pid: string) => lines.filter((l) => !l.spec && l.productId === pid);
  const qtyOf = (pid: string) => byProduct(pid).reduce((a, l) => a + (left.get(l.variantId) ?? 0), 0);

  for (const b of [...bundles].sort((x, y) => y.percent - x.percent)) {
    const ids = [...new Set(b.productIds)];
    if (ids.length < BUNDLE_MIN || b.percent <= 0) continue;
    const sets = Math.min(...ids.map(qtyOf));
    if (sets <= 0) {
      const present = ids.filter((pid) => byProduct(pid).length > 0);
      if (present.length) hints.push({ id: b.id, name: b.name, percent: b.percent, missing: ids.filter((pid) => !present.includes(pid)) });
      continue;
    }
    let raw = 0;
    for (const pid of ids) {
      // Берём сначала более дорогие позиции товара: скидка честно считается от цены в корзине
      let need = sets;
      for (const l of byProduct(pid).sort((x, y) => y.price - x.price)) {
        const take = Math.min(need, left.get(l.variantId) ?? 0);
        if (!take) continue;
        left.set(l.variantId, (left.get(l.variantId) ?? 0) - take);
        const c = (l.price * take * b.percent) / 100;
        cut.set(l.variantId, (cut.get(l.variantId) ?? 0) + c);
        raw += c;
        need -= take;
        if (!need) break;
      }
    }
    const discount = floorRub(raw);
    if (discount > 0) applied.push({ id: b.id, name: b.name, percent: b.percent, sets, discount });
  }
  const discount = applied.reduce((a, x) => a + x.discount, 0);
  return { discount, applied, cut, hints: hints.filter((h) => h.missing.length <= 2) };
}

export interface BundleCard {
  id: string;
  name: string;
  note: string;
  percent: number;
  /** variantId — что положить в корзину; variantIds — все варианты товара (если какой-то уже в корзине, второй не кладём) */
  items: { productId: string; variantId: string; variantIds: string[]; slug: string; name: string; image: string | null; price: number }[];
  full: number;
  price: number;
}

/** Комплекты для витрины: все товары опубликованы и есть в наличии */
export async function bundleCards(bundles: Bundle[]): Promise<BundleCard[]> {
  const ids = [...new Set(bundles.flatMap((b) => b.productIds))];
  if (!ids.length) return [];
  const products = await db.query.product.findMany({
    where: inArray(s.product.id, ids),
    with: {
      category: true,
      variants: { orderBy: asc(s.productVariant.sortOrder) },
      images: { orderBy: asc(s.productImage.sortOrder), limit: 1 },
    },
  });
  const out: BundleCard[] = [];
  for (const b of bundles) {
    const items: BundleCard["items"] = [];
    for (const pid of [...new Set(b.productIds)]) {
      const p = products.find((x) => x.id === pid);
      if (!p || !isPublic(p) || (p.category && !isPublic(p.category))) break;
      const v = p.variants.find((x) => x.isActive && x.stock > 0);
      if (!v) break;
      items.push({ productId: p.id, variantId: v.id, variantIds: p.variants.filter((x) => x.isActive).map((x) => x.id), slug: p.slug, name: p.name, image: p.images[0]?.url ?? null, price: v.price ?? p.price });
    }
    if (items.length < BUNDLE_MIN || items.length !== new Set(b.productIds).size) continue;
    const full = items.reduce((a, x) => a + x.price, 0);
    out.push({ id: b.id, name: b.name, note: b.note, percent: b.percent, items, full, price: full - floorRub((full * b.percent) / 100) });
  }
  return out;
}

/** Комплекты, в которые входит товар — для его карточки */
export async function bundlesFor(productId: string) {
  const all = await activeBundles();
  return bundleCards(all.filter((b) => b.productIds.includes(productId)));
}
