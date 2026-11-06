import { desc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDateTime, rub } from "@/lib/format";
import { SO_STATUS } from "@/lib/supplier-status";
import { requireAdmin } from "@/lib/viewer";

export const metadata: Metadata = { title: "Заказы поставщикам" };
export const dynamic = "force-dynamic";

export default async function SupplierOrders() {
  await requireAdmin();
  const rows = await db
    .select({
      o: s.supplierOrder,
      lines: sql<number>`(select count(*)::int from supplier_order_item i where i.order_id = ${s.supplierOrder.id})`,
      units: sql<number>`(select coalesce(sum(i.qty), 0)::int from supplier_order_item i where i.order_id = ${s.supplierOrder.id})`,
      sum: sql<number | null>`(select case when bool_and(i.unit_cost is not null) then sum(i.unit_cost * coalesce(i.received_qty, i.qty))::bigint end from supplier_order_item i where i.order_id = ${s.supplierOrder.id})`,
    })
    .from(s.supplierOrder)
    .orderBy(desc(s.supplierOrder.createdAt))
    .limit(200);
  return (
    <>
      <h1>Заказы поставщикам</h1>
      <div className="row" style={{ gap: 6 }}>
        <Link href="/admin/stock/reorder" className="btn btn--sm btn--gold">
          + Новый — из «Что докупить»
        </Link>
        <Link href="/admin/stock" className="btn btn--sm btn--line">
          Остатки
        </Link>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Заказ</th>
              <th>Поставщик</th>
              <th style={{ textAlign: "right" }}>Позиций</th>
              <th style={{ textAlign: "right" }}>Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, lines, units, sum }) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/stock/orders/${o.id}`}>{o.number}</Link>
                  <div className="muted small">{fmtDateTime(o.createdAt)}</div>
                </td>
                <td>{o.supplier}</td>
                <td style={{ textAlign: "right" }}>
                  {lines} <span className="muted small">({units} шт)</span>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{sum != null ? rub(Number(sum)) : "—"}</td>
                <td>
                  <span className={`pill ${SO_STATUS[o.status]?.tone ?? ""}`}>{SO_STATUS[o.status]?.text ?? o.status}</span>
                  {o.receivedAt && <div className="muted small">{fmtDateTime(o.receivedAt)}</div>}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="muted">
                  Заказов пока нет. Откройте «Что докупить», отметьте товары и создайте заказ.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
