/**
 * Остатки по клубам.
 *
 * Центральный склад — product_variant.stock: из него продаёт сайт (и касса на турнире).
 * У клуба можно включить свой учёт (club.own_stock): тогда касса этого клуба продаёт из остатка клуба
 * (club_stock), а товар попадает туда перемещением со склада. Пока учёт клуба выключен,
 * касса клуба, как раньше, продаёт со склада.
 */
import "server-only";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { clubTitle } from "@/lib/club-label";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = Tx | typeof db;

/** null — центральный склад */
export type Location = string | null;

export class StockError extends Error {}

/** Откуда касса берёт товар: клуб со своим учётом — из клуба, иначе со склада */
export async function saleLocation(clubId: string | null | undefined, ex: Exec = db): Promise<Location> {
  if (!clubId) return null;
  const c = await ex.query.club.findFirst({ where: eq(s.club.id, clubId), columns: { ownStock: true } });
  return c?.ownStock ? clubId : null;
}

/** Забрать qty шт. Возвращает остаток после или null, если не хватает */
export async function takeStock(tx: Tx, loc: Location, variantId: string, qty: number): Promise<number | null> {
  if (loc == null) {
    const r = await tx
      .update(s.productVariant)
      .set({ stock: sql`${s.productVariant.stock} - ${qty}` })
      .where(and(eq(s.productVariant.id, variantId), gte(s.productVariant.stock, qty)))
      .returning({ stock: s.productVariant.stock });
    return r[0]?.stock ?? null;
  }
  const r = await tx
    .update(s.clubStock)
    .set({ qty: sql`${s.clubStock.qty} - ${qty}`, updatedAt: new Date() })
    .where(and(eq(s.clubStock.clubId, loc), eq(s.clubStock.variantId, variantId), gte(s.clubStock.qty, qty)))
    .returning({ qty: s.clubStock.qty });
  return r[0]?.qty ?? null;
}

/** Положить qty шт. Возвращает остаток после */
export async function putStock(tx: Tx, loc: Location, variantId: string, qty: number): Promise<number> {
  if (loc == null) {
    const [r] = await tx
      .update(s.productVariant)
      .set({ stock: sql`${s.productVariant.stock} + ${qty}` })
      .where(eq(s.productVariant.id, variantId))
      .returning({ stock: s.productVariant.stock });
    return r?.stock ?? 0;
  }
  const [r] = await tx
    .insert(s.clubStock)
    .values({ clubId: loc, variantId, qty })
    .onConflictDoUpdate({ target: [s.clubStock.clubId, s.clubStock.variantId], set: { qty: sql`${s.clubStock.qty} + ${qty}`, updatedAt: new Date() } })
    .returning({ qty: s.clubStock.qty });
  return r.qty;
}

/** Сколько сейчас в клубе (для инвентаризации и проверок) */
export async function clubQty(ex: Exec, clubId: string, variantId: string) {
  const r = await ex.query.clubStock.findFirst({ where: and(eq(s.clubStock.clubId, clubId), eq(s.clubStock.variantId, variantId)), columns: { qty: true } });
  return r?.qty ?? 0;
}

/** Остатки клуба: вариант → количество */
export async function clubStockMap(clubId: string) {
  const rows = await db.select({ variantId: s.clubStock.variantId, qty: s.clubStock.qty }).from(s.clubStock).where(eq(s.clubStock.clubId, clubId));
  return new Map(rows.map((r) => [r.variantId, r.qty]));
}

/** Всего в клубах по вариантам — для «Что докупить» и стоимости склада */
export async function clubTotals(variantIds?: string[]) {
  const rows = await db
    .select({ variantId: s.clubStock.variantId, qty: sql<number>`sum(${s.clubStock.qty})::int` })
    .from(s.clubStock)
    .where(variantIds?.length ? inArray(s.clubStock.variantId, variantIds) : undefined)
    .groupBy(s.clubStock.variantId);
  return new Map(rows.map((r) => [r.variantId, Number(r.qty)]));
}

/** Клубы, где ведётся свой учёт */
export async function stockClubs() {
  const rows = await db.query.club.findMany({ where: eq(s.club.isActive, true), orderBy: [asc(s.club.sortOrder), asc(s.club.name)] });
  return rows.map((c) => ({ id: c.id, title: clubTitle(c), ownStock: c.ownStock }));
}

const locName = async (ex: Exec, loc: Location) => {
  if (loc == null) return "Склад";
  const c = await ex.query.club.findFirst({ where: eq(s.club.id, loc) });
  return c ? clubTitle(c) : "Клуб";
};

/**
 * Перемещение: со склада в клуб, из клуба на склад или между клубами.
 * В журнале — две строки: «−» там, откуда забрали, «+» там, куда привезли.
 */
export async function transferStock(userId: string, from: Location, to: Location, lines: { variantId: string; qty: number }[], note: string | null) {
  if (from === to) throw new StockError("Откуда и куда — одно и то же место");
  for (const loc of [from, to]) {
    if (loc == null) continue;
    const c = await db.query.club.findFirst({ where: eq(s.club.id, loc), columns: { ownStock: true, isActive: true } });
    if (!c || !c.isActive) throw new StockError("Клуб не найден");
    if (!c.ownStock) throw new StockError("У клуба не включён свой учёт остатков — включите его в «Склад» → «Остатки по клубам»");
  }
  return db.transaction(async (tx) => {
    const fromName = await locName(tx, from);
    const toName = await locName(tx, to);
    const text = `${fromName} → ${toName}${note ? `: ${note}` : ""}`.slice(0, 300);
    const done: { name: string; qty: number }[] = [];
    for (const l of lines) {
      if (!(l.qty > 0)) continue;
      const [v] = await tx
        .select({ id: s.productVariant.id, productId: s.productVariant.productId, cost: s.productVariant.costPrice, variant: s.productVariant.name, product: s.product.name, variants: sql<number>`(select count(*)::int from product_variant v2 where v2.product_id = ${s.productVariant.productId} and v2.is_active)` })
        .from(s.productVariant)
        .innerJoin(s.product, eq(s.product.id, s.productVariant.productId))
        .where(eq(s.productVariant.id, l.variantId));
      if (!v) throw new StockError("Товар не найден — обновите страницу");
      const name = v.variants > 1 ? `${v.product} · ${v.variant}` : v.product;
      const left = await takeStock(tx, from, l.variantId, l.qty);
      if (left == null) throw new StockError(`«${name}»: в месте «${fromName}» меньше ${l.qty} шт`);
      const after = await putStock(tx, to, l.variantId, l.qty);
      await tx.insert(s.stockMove).values([
        { variantId: v.id, productId: v.productId, name, type: "TRANSFER", qty: -l.qty, unitCost: v.cost, stockAfter: left, clubId: from, note: text, userId },
        { variantId: v.id, productId: v.productId, name, type: "TRANSFER", qty: l.qty, unitCost: v.cost, stockAfter: after, clubId: to, note: text, userId },
      ]);
      done.push({ name, qty: l.qty });
    }
    if (!done.length) throw new StockError("Добавьте товар и количество");
    return done;
  });
}

/** Включить или выключить свой учёт клуба. Выключить можно, только когда в клубе пусто */
export async function setOwnStock(clubId: string, on: boolean) {
  if (!on) {
    const [r] = await db.select({ n: sql<number>`coalesce(sum(${s.clubStock.qty}), 0)::int` }).from(s.clubStock).where(eq(s.clubStock.clubId, clubId));
    if (Number(r?.n ?? 0) > 0) throw new StockError("В клубе ещё есть товар — сначала верните его на склад перемещением");
  }
  await db.update(s.club).set({ ownStock: on }).where(eq(s.club.id, clubId));
}
