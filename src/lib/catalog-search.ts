/**
 * Каталог целиком: поиск, фильтры, сортировка, хиты и новинки.
 * Товаров у магазина сотни, а не миллионы, поэтому список открытых товаров
 * берём из базы одним запросом и фильтруем в памяти — так проще искать
 * с опечатками в раскладке и по вариантам.
 */
import "server-only";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { decorate } from "@/lib/catalog";
import { ratingsFor } from "@/lib/reviews";
import { score, swapLayout, tokens } from "@/lib/search-text";
import { isPublic, publicWhere } from "@/lib/visibility";

export const SORTS = {
  relevance: "По совпадению",
  popular: "Популярные",
  new: "Новинки",
  cheap: "Сначала дешевле",
  expensive: "Сначала дороже",
  rating: "С высокой оценкой",
} as const;
export type Sort = keyof typeof SORTS;

export const PAGE_SIZE = 24;
const SOLD_STATUSES = ["PAID", "ASSEMBLING", "SHIPPED", "DELIVERED"] as const;

export interface CatalogParams {
  q?: string;
  /** slug категории из фильтра */
  cat?: string;
  /** id категории страницы /catalog/[slug] — её показываем даже скрытой (предпросмотр) */
  fixedCategoryId?: string;
  inStock?: boolean;
  /** рубли */
  min?: number;
  max?: number;
  sort?: Sort;
  page?: number;
}

interface Row {
  id: string;
  name: string;
  tags: string;
  extra: string;
  categoryId: string | null;
  price: number; // минимальная цена среди вариантов, копейки
  stock: number;
  createdAt: Date;
  sortOrder: number;
}

/** Открытые товары (в открытых категориях или без категории) с ценой, остатком и текстом для поиска. */
async function loadRows(fixedCategoryId?: string) {
  const [products, cats] = await Promise.all([db.select().from(s.product).where(publicWhere(s.product)), db.select().from(s.category)]);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const visible = products.filter((p) => {
    if (!p.categoryId) return true;
    const c = catById.get(p.categoryId);
    return !!c && (isPublic(c) || c.id === fixedCategoryId);
  });
  const ids = visible.map((p) => p.id);
  const variants = ids.length
    ? await db
        .select()
        .from(s.productVariant)
        .where(and(inArray(s.productVariant.productId, ids), eq(s.productVariant.isActive, true)))
    : [];
  const byProduct = new Map<string, typeof variants>();
  for (const v of variants) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);

  const rows: Row[] = visible.map((p) => {
    const own = byProduct.get(p.id) ?? [];
    const prices = own.map((v) => v.price ?? p.price);
    const cat = p.categoryId ? catById.get(p.categoryId) : null;
    return {
      id: p.id,
      name: p.name,
      tags: p.searchTags,
      extra: [p.sku, cat?.name, ...own.map((v) => `${v.name} ${v.sku ?? ""}`), p.description.slice(0, 2000)].filter(Boolean).join(" "),
      categoryId: p.categoryId,
      price: prices.length ? Math.min(...prices) : p.price,
      stock: own.reduce((a, v) => a + v.stock, 0),
      createdAt: p.createdAt,
      sortOrder: p.sortOrder,
    };
  });
  return {
    rows,
    cats: cats.filter((c) => isPublic(c) || c.id === fixedCategoryId),
  };
}

/** Сколько штук каждого товара купили за последние 180 дней (оплаченные заказы). */
export async function soldCounts(days = 180) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await db
    .select({
      productId: s.orderItem.productId,
      qty: sql<number>`sum(${s.orderItem.quantity})::int`,
    })
    .from(s.orderItem)
    .innerJoin(s.order, eq(s.order.id, s.orderItem.orderId))
    .where(and(inArray(s.order.status, [...SOLD_STATUSES]), gte(s.order.createdAt, since)))
    .groupBy(s.orderItem.productId);
  return new Map(rows.filter((r) => r.productId).map((r) => [r.productId!, Number(r.qty)]));
}

function search(rows: Row[], q: string) {
  const t = tokens(q);
  return rows.map((r) => ({ r, score: score(r, t) })).filter((x) => x.score > 0);
}

/** Поиск с исправлением раскладки: если по запросу ничего нет — пробуем «rbq» → «кий». */
function searchWithLayout(rows: Row[], q: string) {
  let found = search(rows, q);
  let corrected: string | null = null;
  if (!found.length) {
    const alt = swapLayout(q);
    if (alt) {
      const again = search(rows, alt);
      if (again.length) {
        found = again;
        corrected = alt;
      }
    }
  }
  return { found, corrected };
}

export async function listCatalog(params: CatalogParams) {
  const { rows, cats } = await loadRows(params.fixedCategoryId);
  const q = params.q?.trim().slice(0, 100) ?? "";
  const sort: Sort = params.sort && params.sort in SORTS && (params.sort !== "relevance" || q) ? params.sort : q ? "relevance" : "popular";

  // 1. Поиск
  const { found, corrected } = q ? searchWithLayout(rows, q) : { found: rows.map((r) => ({ r, score: 1 })), corrected: null };

  // 2. Категория страницы
  let list = params.fixedCategoryId ? found.filter((x) => x.r.categoryId === params.fixedCategoryId) : found;

  // Диапазон цен для подсказки в фильтре — до фильтра по цене
  const allPrices = list.map((x) => x.r.price);
  const priceRange = allPrices.length
    ? {
        min: Math.floor(Math.min(...allPrices) / 100),
        max: Math.ceil(Math.max(...allPrices) / 100),
      }
    : null;

  // 3. Наличие и цена
  if (params.inStock) list = list.filter((x) => x.r.stock > 0);
  if (params.min) list = list.filter((x) => x.r.price >= params.min! * 100);
  if (params.max) list = list.filter((x) => x.r.price <= params.max! * 100);

  // 4. Счётчики по категориям — с учётом поиска и фильтров, но без выбранной категории
  const catCounts = new Map<string, number>();
  for (const x of list) if (x.r.categoryId) catCounts.set(x.r.categoryId, (catCounts.get(x.r.categoryId) ?? 0) + 1);
  const categories = cats
    .filter((c) => catCounts.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"))
    .map((c) => ({ slug: c.slug, name: c.name, count: catCounts.get(c.id)! }));

  const activeCat = !params.fixedCategoryId && params.cat ? cats.find((c) => c.slug === params.cat) : undefined;
  if (activeCat) list = list.filter((x) => x.r.categoryId === activeCat.id);

  // 5. Сортировка. Товары, которых нет в наличии, всегда в конце
  const sold = sort === "popular" ? await soldCounts() : new Map<string, number>();
  const ratings = sort === "rating" ? await ratingsFor(list.map((x) => x.r.id)) : new Map();
  const cmp: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
    relevance: (a, b) => b.score - a.score,
    popular: (a, b) => (sold.get(b.r.id) ?? 0) - (sold.get(a.r.id) ?? 0),
    new: (a, b) => b.r.createdAt.getTime() - a.r.createdAt.getTime(),
    cheap: (a, b) => a.r.price - b.r.price,
    expensive: (a, b) => b.r.price - a.r.price,
    rating: (a, b) =>
      (ratings.get(b.r.id)?.avg ?? 0) - (ratings.get(a.r.id)?.avg ?? 0) ||
      (ratings.get(b.r.id)?.count ?? 0) - (ratings.get(a.r.id)?.count ?? 0),
  };
  list.sort(
    (a, b) =>
      Number(b.r.stock > 0) - Number(a.r.stock > 0) ||
      cmp[sort](a, b) ||
      a.r.sortOrder - b.r.sortOrder ||
      a.r.name.localeCompare(b.r.name, "ru"),
  );

  // 6. «Показать ещё»: страница n показывает первые n × 24 товара
  const page = Math.min(Math.max(1, Math.trunc(params.page ?? 1)), 50);
  const ids = list.slice(0, page * PAGE_SIZE).map((x) => x.r.id);
  const items = await productsInOrder(ids);

  return {
    items,
    total: list.length,
    hasMore: list.length > ids.length,
    page,
    sort,
    corrected,
    categories,
    activeCat: activeCat ? { slug: activeCat.slug, name: activeCat.name } : null,
    priceRange,
  };
}

/** Карточки товаров по списку id в заданном порядке. */
async function productsInOrder(ids: string[]) {
  if (!ids.length) return [];
  const products = await db.select().from(s.product).where(inArray(s.product.id, ids));
  const decorated = await decorate(products);
  const byId = new Map(decorated.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
}

/** Подсказки в строке поиска: до 6 товаров и подходящие категории. */
export async function suggest(q: string) {
  const query = q.trim().slice(0, 100);
  if (!query) return { products: [], categories: [], total: 0, corrected: null };
  const { rows, cats } = await loadRows();
  const { found, corrected } = searchWithLayout(rows, query);
  found.sort((a, b) => Number(b.r.stock > 0) - Number(a.r.stock > 0) || b.score - a.score || a.r.sortOrder - b.r.sortOrder);
  const top = await productsInOrder(found.slice(0, 6).map((x) => x.r.id));
  const t = tokens(corrected ?? query);
  const categories = cats
    .filter((c) => score({ name: c.name, extra: "" }, t) > 0)
    .slice(0, 3)
    .map((c) => ({ slug: c.slug, name: c.name }));
  return {
    products: top.map((p) => ({
      slug: p.slug,
      name: p.name,
      price: p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : p.price,
      multiPrice: new Set(p.variants.map((v) => v.price)).size > 1,
      image: p.image?.url ?? null,
      inStock: p.stock > 0,
    })),
    categories,
    total: found.length,
    corrected,
  };
}

/** Хиты продаж для главной: только если покупали хотя бы 4 разных товара. */
export async function getHits(limit = 8) {
  const sold = await soldCounts(90);
  if (sold.size < 4) return [];
  const { rows } = await loadRows();
  const ids = rows
    .filter((r) => r.stock > 0 && sold.has(r.id))
    .sort((a, b) => sold.get(b.id)! - sold.get(a.id)!)
    .slice(0, limit)
    .map((r) => r.id);
  return ids.length >= 4 ? productsInOrder(ids) : [];
}

/** Новинки для главной: последние добавленные товары в наличии. */
export async function getNewArrivals(limit = 8) {
  const { rows } = await loadRows();
  const ids = rows
    .filter((r) => r.stock > 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((r) => r.id);
  return productsInOrder(ids);
}

/** Свежие отзывы для главной: одобренные, с оценкой от 4 и нормальным текстом, на открытые товары. */
export async function getLatestReviews(limit = 6) {
  const rows = await db
    .select({
      id: s.review.id,
      rating: s.review.rating,
      text: s.review.text,
      createdAt: s.review.createdAt,
      userName: s.user.name,
      productName: s.product.name,
      productSlug: s.product.slug,
    })
    .from(s.review)
    .innerJoin(s.product, eq(s.product.id, s.review.productId))
    .innerJoin(s.user, eq(s.user.id, s.review.userId))
    .leftJoin(s.category, eq(s.category.id, s.product.categoryId))
    .where(
      and(
        eq(s.review.status, "APPROVED"),
        gte(s.review.rating, 4),
        sql`char_length(${s.review.text}) >= 20`,
        publicWhere(s.product),
        or(isNull(s.product.categoryId), publicWhere(s.category)),
      ),
    )
    .orderBy(desc(s.review.createdAt))
    .limit(limit);
  return rows;
}
