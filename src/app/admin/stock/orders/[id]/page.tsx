import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { supplierText } from "@/lib/reorder";
import { SO_STATUS } from "@/lib/supplier-status";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { OrderCard } from "./OrderCard";

export const dynamic = "force-dynamic";

export default async function SupplierOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const o = await db.query.supplierOrder.findFirst({ where: eq(s.supplierOrder.id, id), with: { items: true } });
  if (!o) notFound();
  const ids = o.items.map((i) => i.variantId).filter((x): x is string => !!x);
  const stocks = ids.length ? await db.select({ id: s.productVariant.id, stock: s.productVariant.stock }).from(s.productVariant).where(inArray(s.productVariant.id, ids)) : [];
  const items = o.items
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((i) => ({ id: i.id, name: i.name, sku: i.sku, qty: i.qty, unitCost: i.unitCost, receivedQty: i.receivedQty, stock: stocks.find((x) => x.id === i.variantId)?.stock ?? null }));
  const st = SO_STATUS[o.status];
  return (
    <>
      <h1>Заказ {o.number}</h1>
      <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/admin/stock/orders" className="btn btn--sm btn--line">
          ← Все заказы
        </Link>
        <span className={`pill ${st?.tone ?? ""}`}>{st?.text ?? o.status}</span>
        <span className="muted small">
          {o.supplier} · создан {fmtDateTime(o.createdAt)}
          {o.orderedAt ? ` · заказали ${fmtDateTime(o.orderedAt)}` : ""}
          {o.receivedAt ? ` · принят ${fmtDateTime(o.receivedAt)}` : ""}
        </span>
      </div>
      <OrderCard id={o.id} status={o.status} supplier={o.supplier} note={o.note} items={items} text={supplierText(o, items)} canEdit={!isDirector(me)} />
    </>
  );
}
