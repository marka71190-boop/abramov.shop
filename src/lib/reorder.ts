/**
 * «Что докупить»: по скорости продаж (сайт + касса) считаем, на сколько дней хватит остатка,
 * и сколько заказать, чтобы хватило на срок поставки + запас.
 * Заказ поставщику: черновик → заказали → приняли (товар приходом попадает на склад).
 */
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getSettings } from "@/lib/settings";
import { applyMoves, withStockNotices } from "@/lib/stock-moves";

export interface ReorderRow {
  variantId: string;
  productId: string;
  name: string;
  sku: string | null;
  stock: number;
  sold: number; // за окно продаж
  perDay: number;
  daysLeft: number | null; // null — продаж не было
  onOrder: number; // уже заказано у поставщиков и ещё не пришло
  suggest: number; // сколько заказать
  cost: number | null;
  supplier: string | null; // у кого заказывали в последний раз
  visibility: string;
}

export async function reorderReport(): Promise<{ rows: ReorderRow[]; lead: number; cover: number; window: number }> {
  const st = (await getSettings()).stock;
  const lead = Math.max(0, st.leadDays);
  const cover = Math.max(1, st.coverDays);
  const window = Math.max(7, st.salesWindowDays);
  const since = new Date(Date.now() - window * 86400_000);
  const r = await db.execute<{
    variant_id: string;
    product_id: string;
    name: string;
    sku: string | null;
    stock: number;
    sold: number;
    on_order: number;
    cost: number | null;
    supplier: string | null;
    visibility: string;
  }>(sql`
    select v.id as variant_id, p.id as product_id,
      case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) > 1 then p.name || ' · ' || v.name else p.name end as name,
      coalesce(v.sku, p.sku) as sku, v.stock + coalesce((select sum(cs.qty) from club_stock cs where cs.variant_id = v.id), 0)::int as stock, v.cost_price as cost, p.visibility::text as visibility,
      coalesce((select sum(i.quantity) from order_item i join "order" o on o.id = i.order_id
                where i.variant_id = v.id and o.status in ('PAID','ASSEMBLING','SHIPPED','DELIVERED') and o.paid_at >= ${since}), 0)::int
      + coalesce((select sum(i.quantity) from pos_sale_item i join pos_sale ps on ps.id = i.sale_id
                where i.variant_id = v.id and ps.status = 'PAID' and ps.paid_at >= ${since}), 0)::int as sold,
      coalesce((select sum(i.qty) from supplier_order_item i join supplier_order so on so.id = i.order_id
                where i.variant_id = v.id and so.status in ('DRAFT','ORDERED')), 0)::int as on_order,
      (select so.supplier from supplier_order_item i join supplier_order so on so.id = i.order_id
        where i.variant_id = v.id and so.status <> 'CANCELLED' order by so.created_at desc limit 1) as supplier
    from product_variant v join product p on p.id = v.product_id
    where v.is_active and p.visibility <> 'DRAFT' and not p.is_unique`);
  const rows = r.rows.map((x) => {
    const sold = Number(x.sold);
    const stock = Number(x.stock);
    const onOrder = Number(x.on_order);
    const perDay = sold / window;
    const need = Math.ceil(perDay * (lead + cover));
    return {
      variantId: x.variant_id,
      productId: x.product_id,
      name: x.name,
      sku: x.sku,
      stock,
      sold,
      perDay,
      daysLeft: perDay > 0 ? Math.floor(Math.max(0, stock) / perDay) : null,
      onOrder,
      suggest: sold > 0 ? Math.max(0, need - Math.max(0, stock) - onOrder) : 0,
      cost: x.cost == null ? null : Number(x.cost),
      supplier: x.supplier,
      visibility: x.visibility,
    };
  });
  // Сначала то, что закончится раньше
  rows.sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9) || b.sold - a.sold || a.name.localeCompare(b.name, "ru"));
  return { rows, lead, cover, window };
}

export class SupplierError extends Error {}

function orderNumber() {
  const msk = new Date(Date.now() + 3 * 3600_000);
  const day = msk.toISOString().slice(2, 10).replace(/-/g, "");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join("");
  return `Z-${day}-${tail}`;
}

export interface OrderLine {
  variantId: string;
  qty: number;
  unitCost: number | null;
}

async function describe(lines: OrderLine[]) {
  const ids = lines.map((l) => l.variantId);
  const rows = await db.execute<{ id: string; product_id: string; name: string; sku: string | null }>(sql`
    select v.id, p.id as product_id,
      case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) > 1 then p.name || ' · ' || v.name else p.name end as name,
      coalesce(v.sku, p.sku) as sku
    from product_variant v join product p on p.id = v.product_id where v.id in (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`);
  return lines.map((l) => {
    const v = rows.rows.find((r) => r.id === l.variantId);
    if (!v) throw new SupplierError("Товар не найден — обновите страницу");
    return { ...l, productId: v.product_id, name: v.name, sku: v.sku };
  });
}

export async function createSupplierOrder(userId: string, p: { supplier: string; note: string | null; lines: OrderLine[] }) {
  if (!p.lines.length) throw new SupplierError("Отметьте товары для заказа");
  const items = await describe(p.lines);
  return db.transaction(async (tx) => {
    const [o] = await tx.insert(s.supplierOrder).values({ number: orderNumber(), supplier: p.supplier, note: p.note, createdById: userId }).returning();
    await tx.insert(s.supplierOrderItem).values(items.map((i) => ({ orderId: o.id, variantId: i.variantId, productId: i.productId, name: i.name, sku: i.sku, qty: i.qty, unitCost: i.unitCost })));
    return o;
  });
}

/** Черновик: поменять количество и цены, убрать строки */
export async function updateDraft(id: string, p: { supplier: string; note: string | null; items: { id: string; qty: number; unitCost: number | null }[] }) {
  const o = await db.query.supplierOrder.findFirst({ where: eq(s.supplierOrder.id, id) });
  if (!o || o.status !== "DRAFT") throw new SupplierError("Менять можно только черновик");
  await db.transaction(async (tx) => {
    await tx.update(s.supplierOrder).set({ supplier: p.supplier, note: p.note }).where(eq(s.supplierOrder.id, id));
    for (const it of p.items) {
      if (it.qty <= 0) await tx.delete(s.supplierOrderItem).where(and(eq(s.supplierOrderItem.id, it.id), eq(s.supplierOrderItem.orderId, id)));
      else await tx.update(s.supplierOrderItem).set({ qty: it.qty, unitCost: it.unitCost }).where(and(eq(s.supplierOrderItem.id, it.id), eq(s.supplierOrderItem.orderId, id)));
    }
  });
}

export async function setOrderStatus(id: string, status: "ORDERED" | "CANCELLED") {
  const o = await db.query.supplierOrder.findFirst({ where: eq(s.supplierOrder.id, id) });
  if (!o) throw new SupplierError("Заказ не найден");
  if (status === "ORDERED" && o.status !== "DRAFT") throw new SupplierError("Заказ уже отправлен");
  if (status === "CANCELLED" && !["DRAFT", "ORDERED"].includes(o.status)) throw new SupplierError("Этот заказ уже нельзя отменить");
  await db
    .update(s.supplierOrder)
    .set({ status, ...(status === "ORDERED" ? { orderedAt: new Date() } : {}) })
    .where(eq(s.supplierOrder.id, id));
}

/** Приёмка: сколько пришло на самом деле и по какой цене → приход на склад */
export async function receiveOrder(userId: string, id: string, got: { id: string; qty: number; unitCost: number | null }[]) {
  const o = await db.query.supplierOrder.findFirst({ where: eq(s.supplierOrder.id, id), with: { items: true } });
  if (!o || !["DRAFT", "ORDERED"].includes(o.status)) throw new SupplierError("Этот заказ уже принят или отменён");
  const lines = o.items
    .map((it) => {
      const g = got.find((x) => x.id === it.id);
      return { it, qty: g ? g.qty : it.qty, unitCost: g ? g.unitCost : it.unitCost };
    })
    .filter((l) => l.it.variantId && l.qty > 0);
  if (!lines.length) throw new SupplierError("Ничего не пришло? Укажите количество или отмените заказ");
  // Помечаем принятым до прихода: двойной клик не проведёт товар дважды
  const [locked] = await db
    .update(s.supplierOrder)
    .set({ status: "RECEIVED", receivedAt: new Date() })
    .where(and(eq(s.supplierOrder.id, id), inArray(s.supplierOrder.status, ["DRAFT", "ORDERED"])))
    .returning({ id: s.supplierOrder.id });
  if (!locked) throw new SupplierError("Этот заказ уже принят");
  try {
    await withStockNotices(
      lines.map((l) => l.it.variantId!),
      () => applyMoves(userId, "RECEIPT", lines.map((l) => ({ variantId: l.it.variantId!, qty: l.qty, unitCost: l.unitCost })), `${o.number} · ${o.supplier}`),
    );
  } catch (e) {
    await db.update(s.supplierOrder).set({ status: o.status, receivedAt: null }).where(eq(s.supplierOrder.id, id));
    throw e;
  }
  for (const l of lines) await db.update(s.supplierOrderItem).set({ receivedQty: l.qty, unitCost: l.unitCost }).where(eq(s.supplierOrderItem.id, l.it.id));
  return lines.reduce((a, l) => a + l.qty, 0);
}

/** Текст для поставщика (в мессенджер или письмо) — без цен закупки, если их не указали */
export function supplierText(o: { number: string; supplier: string; note: string | null }, items: { name: string; sku: string | null; qty: number; unitCost: number | null }[]) {
  const fmt = (k: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(k / 100) + " ₽";
  const lines = items.map((i, n) => `${n + 1}. ${i.name}${i.sku ? ` (арт. ${i.sku})` : ""} — ${i.qty} шт${i.unitCost != null ? ` × ${fmt(i.unitCost)}` : ""}`);
  const total = items.every((i) => i.unitCost != null) ? items.reduce((a, i) => a + i.qty * (i.unitCost ?? 0), 0) : null;
  return [`Здравствуйте! Заказ ${o.number} от Abramov Shop:`, "", ...lines, ...(total ? ["", `Итого: ${fmt(total)}`] : []), ...(o.note ? ["", o.note] : []), "", "Спасибо!"].join("\n");
}
