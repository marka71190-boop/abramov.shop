/**
 * «С этим покупают»: сначала подборка из карточки товара (админка), затем то, что чаще всего
 * покупали вместе в оплаченных заказах, затем популярное из той же категории.
 * Показываем только опубликованные товары из открытых категорий; в наличии — первыми.
 */
import "server-only";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { decorate } from "@/lib/catalog";
import { publicWhere } from "@/lib/visibility";

const PAID = sql`('PAID','ASSEMBLING','SHIPPED','DELIVERED')`;

async function candidateIds(productIds: string[]): Promise<string[]> {
  if (!productIds.length) return [];
  const manual = await db
    .select({ id: s.productRelated.relatedId })
    .from(s.productRelated)
    .where(inArray(s.productRelated.productId, productIds))
    .orderBy(asc(s.productRelated.sortOrder));

  const together = await db.execute<{ id: string; n: number }>(sql`
    select i2.product_id as id, count(distinct i1.order_id)::int as n
    from order_item i1
    join order_item i2 on i2.order_id = i1.order_id and i2.product_id <> i1.product_id
    join "order" o on o.id = i1.order_id
    where i1.product_id in ${productIds} and i2.product_id is not null and o.status in ${PAID}
    group by i2.product_id
    order by n desc
    limit 20`);

  const sameCategory = await db.execute<{ id: string }>(sql`
    select p.id
    from product p
    left join (
      select i.product_id, sum(i.quantity) as sold
      from order_item i join "order" o on o.id = i.order_id
      where o.status in ${PAID} and o.paid_at > now() - interval '90 days'
      group by i.product_id
    ) x on x.product_id = p.id
    where p.category_id in (select category_id from product where id in ${productIds} and category_id is not null)
    order by coalesce(x.sold, 0) desc, p.sort_order asc
    limit 20`);

  return [...new Set([...manual.map((r) => r.id), ...together.rows.map((r) => r.id), ...sameCategory.rows.map((r) => r.id)])];
}

/** Карточки «С этим покупают» к товарам (без них самих и без исключённых). */
export async function recommendFor(productIds: string[], opts: { exclude?: string[]; limit?: number } = {}) {
  const skip = new Set([...productIds, ...(opts.exclude ?? [])]);
  const ids = (await candidateIds(productIds)).filter((id) => !skip.has(id));
  if (!ids.length) return [];
  const rows = await db
    .select({ product: s.product })
    .from(s.product)
    .leftJoin(s.category, eq(s.category.id, s.product.categoryId))
    .where(and(publicWhere(s.product), inArray(s.product.id, ids), or(isNull(s.product.categoryId), publicWhere(s.category))));
  const cards = await decorate(rows.map((r) => r.product));
  const rank = (id: string) => ids.indexOf(id);
  return cards
    .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || rank(a.id) - rank(b.id))
    .slice(0, opts.limit ?? 8);
}

/** Для корзины: компактные карточки, в наличии; товар с одним вариантом можно добавить сразу. */
export async function suggestForCart(variantIds: string[], limit = 4) {
  if (!variantIds.length) return [];
  const inCart = await db
    .select({ productId: s.productVariant.productId })
    .from(s.productVariant)
    .where(inArray(s.productVariant.id, variantIds.slice(0, 50)));
  const productIds = [...new Set(inCart.map((r) => r.productId))];
  const cards = await recommendFor(productIds, { limit: 12 });
  return cards
    .filter((c) => c.stock > 0)
    .slice(0, limit)
    .map((c) => {
      const live = c.variants.filter((v) => v.stock > 0);
      return {
        id: c.id,
        slug: c.slug,
        trackId: c.sku ?? c.slug, // код товара для Метрики — как в карточке
        name: c.name,
        price: Math.min(...c.variants.map((v) => v.price)),
        oldPrice: c.oldPrice,
        image: c.image?.url ?? null,
        // Один вариант — кнопка «В корзину»; несколько — ведём выбрать на страницу товара
        variantId: c.variants.length === 1 && live.length === 1 ? live[0].id : null,
      };
    });
}

/** Подборка из карточки товара (для админки). */
export async function manualRelated(productId: string) {
  return db
    .select({ id: s.productRelated.relatedId })
    .from(s.productRelated)
    .where(eq(s.productRelated.productId, productId))
    .orderBy(asc(s.productRelated.sortOrder))
    .then((r) => r.map((x) => x.id));
}
