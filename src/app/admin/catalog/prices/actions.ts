"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { setCost } from "@/lib/stock-moves";
import { requireAdmin } from "@/lib/viewer";

const kop = z.number().int().min(100).max(1_000_000_000);
const In = z.object({
  products: z.array(z.object({ id: z.string().max(64), price: kop.optional(), oldPrice: kop.nullable().optional() })).max(2000),
  variants: z
    .array(
      z.object({
        id: z.string().max(64),
        price: kop.nullable().optional(), // null — как у товара
        stock: z.number().int().min(0).max(1_000_000).optional(),
        stockWas: z.number().int().optional(), // чтобы не затереть продажу, случившуюся пока страница была открыта
        cost: z.number().int().min(0).max(1_000_000_000).nullable().optional(), // закупочная цена, копейки
      }),
    )
    .max(5000),
});

export type BulkResult = { ok?: string; error?: string; conflicts?: string[] };

/** Массовое сохранение цен и остатков из таблицы */
export async function saveBulk(raw: unknown): Promise<BulkResult> {
  const me = await requireAdmin();
  const p = In.safeParse(raw);
  if (!p.success) return { error: "Проверьте цены: в рублях, не меньше 1 ₽; остаток — целое число от 0" };
  const { products, variants } = p.data;
  if (!products.length && !variants.length) return { error: "Нет изменений" };

  // Старая цена должна быть больше текущей
  const ids = products.map((x) => x.id);
  const current = ids.length ? await db.select({ id: s.product.id, name: s.product.name, price: s.product.price, oldPrice: s.product.oldPrice }).from(s.product).where(inArray(s.product.id, ids)) : [];
  for (const x of products) {
    const c = current.find((r) => r.id === x.id);
    if (!c) continue;
    const price = x.price ?? c.price;
    const old = x.oldPrice === undefined ? c.oldPrice : x.oldPrice;
    if (old != null && old <= price) return { error: `«${c.name}»: старая цена должна быть больше текущей — или очистите её` };
  }

  const vIds = variants.map((v) => v.id);
  const before = vIds.length
    ? await db.select({ id: s.productVariant.id, productId: s.productVariant.productId, stock: s.productVariant.stock }).from(s.productVariant).where(inArray(s.productVariant.id, vIds))
    : [];
  const touched = new Set(before.map((b) => b.productId));
  const { productStock, notifyBackInStock } = await import("@/lib/stock-alerts");
  const stockBefore = new Map<string, number>();
  for (const pid of touched) stockBefore.set(pid, await productStock(pid));

  const conflicts: string[] = [];
  await db.transaction(async (tx) => {
    for (const x of products) {
      const set: Partial<typeof s.product.$inferInsert> = {};
      if (x.price !== undefined) set.price = x.price;
      if (x.oldPrice !== undefined) set.oldPrice = x.oldPrice;
      if (Object.keys(set).length) await tx.update(s.product).set(set).where(eq(s.product.id, x.id));
    }
    for (const v of variants) {
      if (v.price !== undefined) await tx.update(s.productVariant).set({ price: v.price }).where(eq(s.productVariant.id, v.id));
      if (v.cost !== undefined) await setCost(tx, me.id, v.id, v.cost);
      if (v.stock !== undefined) {
        const r = await tx
          .update(s.productVariant)
          .set({ stock: v.stock })
          .where(and(eq(s.productVariant.id, v.id), v.stockWas !== undefined ? eq(s.productVariant.stock, v.stockWas) : sql`true`))
          .returning({ id: s.productVariant.id });
        if (!r.length) conflicts.push(v.id);
      }
    }
  });

  // Пополнили — сообщаем тем, кто ждал; заканчивается — предупреждение админам
  for (const pid of touched) {
    if ((stockBefore.get(pid) ?? 0) === 0 && (await productStock(pid)) > 0) {
      const prod = await db.query.product.findFirst({ where: eq(s.product.id, pid), columns: { visibility: true } });
      if (prod?.visibility === "PUBLISHED") await notifyBackInStock(pid).catch(() => 0);
    }
  }
  await import("@/lib/low-stock").then((m) => m.checkLowStock(vIds)).catch(() => 0);
  await audit(me.id, "catalog.bulk_prices", "product", null, { products: products.length, variants: variants.length, conflicts: conflicts.length });
  revalidatePath("/", "layout");

  let names: string[] = [];
  if (conflicts.length) {
    const rows = await db
      .select({ p: s.product.name, v: s.productVariant.name })
      .from(s.productVariant)
      .innerJoin(s.product, eq(s.product.id, s.productVariant.productId))
      .where(inArray(s.productVariant.id, conflicts));
    names = rows.map((r) => (r.v === "Основной" ? r.p : `${r.p} — ${r.v}`));
  }
  const n = products.length + variants.length - conflicts.length;
  return {
    ok: `Сохранено: ${n}`,
    conflicts: names.length ? names : undefined,
  };
}
