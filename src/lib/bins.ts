/**
 * Ячейки хранения на центральном складе. У варианта товара — одна ячейка (product_variant.bin).
 * На полку клеится наклейка с QR: сканируешь телефоном — открывается, что на ней должно лежать.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { normBin } from "@/lib/bin-code";

const NAME = sql`case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) > 1 then p.name || ' · ' || v.name else p.name end`;

export type BinRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  oldSku: string | null;
  stock: number;
  bin: string | null;
};

/** Все варианты с ячейками — для раскладки по полкам и поиска сканером */
export async function binRows(): Promise<BinRow[]> {
  await import("@/lib/shop-barcodes").then((m) => m.ensureShopBarcodes()).catch(() => 0);
  const rows = await db.execute<BinRow>(sql`
    select v.id, ${NAME} as name,
      case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) > 1 then v.sku else coalesce(v.sku, p.sku) end as sku,
      v.barcode, v.old_sku as "oldSku", v.stock, v.bin
    from product_variant v join product p on p.id = v.product_id
    where v.is_active
    order by p.name, v.sort_order`);
  return rows.rows.map((r) => ({ ...r, stock: Number(r.stock) }));
}

/** Ячейки: код, сколько позиций и штук */
export async function binList() {
  const rows = await db.execute<{ bin: string; items: number; units: number }>(sql`
    select v.bin, count(*)::int as items, coalesce(sum(greatest(v.stock, 0)), 0)::int as units
    from product_variant v where v.is_active and v.bin is not null
    group by v.bin order by v.bin`);
  return rows.rows.map((r) => ({ bin: r.bin, items: Number(r.items), units: Number(r.units) })).sort((a, b) => a.bin.localeCompare(b.bin, "ru", { numeric: true }));
}

/** Разложить: variantId → код ячейки (пусто — убрать из ячейки). Возвращает, сколько изменили */
export async function setBins(map: Record<string, string | null>) {
  let n = 0;
  for (const [id, raw] of Object.entries(map).slice(0, 2000)) {
    const bin = normBin(raw) || null;
    const r = await db
      .update(s.productVariant)
      .set({ bin })
      .where(sql`${eq(s.productVariant.id, id)} and ${s.productVariant.bin} is distinct from ${bin}`)
      .returning({ id: s.productVariant.id });
    n += r.length;
  }
  return n;
}
