/**
 * Учёт товара: приход (с закупочной ценой), списание, инвентаризация.
 * Остаток в product_variant.stock — «свободно для продажи» (уже без резерва неоплаченных заказов).
 * Себестоимость — средняя по приходам: (старый остаток × старая цена + приход × цена прихода) / новый остаток.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MOVE_TYPES: Record<string, string> = {
  RECEIPT: "Приход",
  WRITE_OFF: "Списание",
  INVENTORY: "Инвентаризация",
  POS: "Продажа в кассе",
  POS_CANCEL: "Отмена продажи",
  POS_RETURN: "Возврат в кассе",
  TRANSFER: "Перемещение",
  COST: "Новая закупочная цена",
};

export interface MoveLine {
  variantId: string;
  qty: number; // приход/списание — сколько штук; инвентаризация — сколько стало
  unitCost?: number | null; // копейки, только для прихода
}

async function lockVariant(tx: Tx, variantId: string) {
  const [v] = await tx
    .select({ id: s.productVariant.id, stock: s.productVariant.stock, costPrice: s.productVariant.costPrice, productId: s.productVariant.productId, variant: s.productVariant.name, product: s.product.name, variants: sql<number>`(select count(*)::int from product_variant v2 where v2.product_id = ${s.productVariant.productId} and v2.is_active)` })
    .from(s.productVariant)
    .innerJoin(s.product, eq(s.product.id, s.productVariant.productId))
    .where(eq(s.productVariant.id, variantId))
    .for("update", { of: s.productVariant });
  return v ? { ...v, name: v.variants > 1 ? `${v.product} · ${v.variant}` : v.product } : null;
}

/** Средняя себестоимость после прихода */
export function averageCost(oldStock: number, oldCost: number | null, qty: number, cost: number | null) {
  if (cost == null) return oldCost;
  if (oldCost == null || oldStock <= 0) return cost;
  return Math.round((oldStock * oldCost + qty * cost) / (oldStock + qty));
}

/**
 * Приход, списание, инвентаризация. clubId — в клубе со своим учётом; пусто — на центральном складе.
 * Средняя закупочная цена считается по всему товару: склад + клубы.
 */
export async function applyMoves(userId: string, type: "RECEIPT" | "WRITE_OFF" | "INVENTORY", lines: MoveLine[], note: string | null, clubId: string | null = null) {
  return db.transaction(async (tx) => {
    const done: { name: string; qty: number; stockAfter: number }[] = [];
    if (clubId) {
      const c = await tx.query.club.findFirst({ where: eq(s.club.id, clubId), columns: { ownStock: true } });
      if (!c?.ownStock) throw new Error("У клуба не включён свой учёт остатков");
    }
    for (const l of lines) {
      const v = await lockVariant(tx, l.variantId);
      if (!v) throw new Error("Товар не найден — обновите страницу");
      const [{ inClubs }] = await tx.select({ inClubs: sql<number>`coalesce(sum(${s.clubStock.qty}), 0)::int` }).from(s.clubStock).where(eq(s.clubStock.variantId, v.id));
      const here = clubId
        ? ((await tx.query.clubStock.findFirst({ where: (cs, { and: a, eq: e }) => a(e(cs.clubId, clubId), e(cs.variantId, v.id)), columns: { qty: true } }))?.qty ?? 0)
        : v.stock;
      let delta = 0;
      let cost = v.costPrice;
      if (type === "RECEIPT") {
        delta = l.qty;
        cost = averageCost(v.stock + Number(inClubs), v.costPrice, l.qty, l.unitCost ?? null);
      } else if (type === "WRITE_OFF") {
        if (l.qty > here) throw new Error(`«${v.name}»: ${clubId ? "в клубе" : "свободно"} только ${here} шт — больше списать нельзя`);
        delta = -l.qty;
      } else {
        delta = l.qty - here;
        if (!delta) continue;
      }
      const stockAfter = here + delta;
      if (clubId) {
        await tx
          .insert(s.clubStock)
          .values({ clubId, variantId: v.id, qty: stockAfter })
          .onConflictDoUpdate({ target: [s.clubStock.clubId, s.clubStock.variantId], set: { qty: stockAfter, updatedAt: new Date() } });
        if (cost !== v.costPrice) await tx.update(s.productVariant).set({ costPrice: cost }).where(eq(s.productVariant.id, v.id));
      } else {
        await tx.update(s.productVariant).set({ stock: stockAfter, costPrice: cost }).where(eq(s.productVariant.id, v.id));
      }
      await tx.insert(s.stockMove).values({
        clubId,
        variantId: v.id,
        productId: v.productId,
        name: v.name,
        type,
        qty: delta,
        unitCost: type === "RECEIPT" ? (l.unitCost ?? null) : v.costPrice,
        stockAfter,
        note,
        userId,
      });
      done.push({ name: v.name, qty: delta, stockAfter });
    }
    return done;
  });
}

/** Закупочная цена без движения товара (поправили в таблице цен) */
export async function setCost(tx: Tx, userId: string, variantId: string, cost: number | null) {
  const v = await lockVariant(tx, variantId);
  if (!v || v.costPrice === cost) return;
  await tx.update(s.productVariant).set({ costPrice: cost }).where(eq(s.productVariant.id, variantId));
  await tx.insert(s.stockMove).values({ variantId, productId: v.productId, name: v.name, type: "COST", qty: 0, unitCost: cost, stockAfter: v.stock, userId });
}

/** Варианты для выбора в формах прихода и кассы. clubId — остаток этого клуба вместо склада */
export async function variantOptions(clubId: string | null = null) {
  // Новые варианты без штрихкода — выдать (артикул = штрихкод)
  await import("@/lib/shop-barcodes").then((m) => m.ensureShopBarcodes()).catch(() => 0);
  const rows = await db.execute<{ id: string; name: string; sku: string | null; barcode: string | null; oldSku: string | null; stock: number; cost: number | null; price: number; visibility: string; image: string | null }>(sql`
    select v.id,
      case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) > 1 then p.name || ' · ' || v.name else p.name end as name,
      -- у товара с вариантами артикул товара общий — сканер по нему не поймёт, какой вариант; берём только свой
      case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) > 1 then v.sku else coalesce(v.sku, p.sku) end as sku,
      v.barcode, coalesce(v.old_sku, case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) = 1 then p.old_sku end) as "oldSku",
      ${clubId ? sql`coalesce((select cs.qty from club_stock cs where cs.club_id = ${clubId} and cs.variant_id = v.id), 0)` : sql`v.stock`} as stock, v.cost_price as cost, coalesce(v.price, p.price) as price, p.visibility::text as visibility,
      (select i.url from product_image i where i.product_id = p.id order by i.sort_order asc limit 1) as image
    from product_variant v join product p on p.id = v.product_id
    where v.is_active
    order by p.name asc, v.sort_order asc`);
  return rows.rows.map((r) => ({ ...r, stock: Number(r.stock), cost: r.cost == null ? null : Number(r.cost), price: Number(r.price) }));
}
export type VariantOption = Awaited<ReturnType<typeof variantOptions>>[number];

/**
 * Обёртка для любых изменений остатков: товар снова появился — письма тем, кто ждал;
 * заканчивается — предупреждение админам (как при правке в таблице цен).
 */
export async function withStockNotices<T>(variantIds: string[], fn: () => Promise<T>): Promise<T> {
  const { inArray } = await import("drizzle-orm");
  const { productStock, notifyBackInStock } = await import("@/lib/stock-alerts");
  const rows = variantIds.length ? await db.select({ productId: s.productVariant.productId }).from(s.productVariant).where(inArray(s.productVariant.id, variantIds)) : [];
  const products = [...new Set(rows.map((r) => r.productId))];
  const before = new Map<string, number>();
  for (const pid of products) before.set(pid, await productStock(pid));
  const out = await fn();
  void (async () => {
    for (const pid of products) {
      if ((before.get(pid) ?? 0) === 0 && (await productStock(pid)) > 0) {
        const prod = await db.query.product.findFirst({ where: eq(s.product.id, pid), columns: { visibility: true } });
        if (prod?.visibility === "PUBLISHED") await notifyBackInStock(pid).catch(() => 0);
      }
    }
    await import("@/lib/low-stock").then((m) => m.checkLowStock(variantIds)).catch(() => 0);
    await import("@/lib/club-low").then((m) => m.checkClubLow(variantIds)).catch(() => 0);
  })().catch((e) => console.error("[stock] уведомления:", e instanceof Error ? e.message : e));
  return out;
}
