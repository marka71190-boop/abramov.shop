import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { fmtDateTime, rub } from "@/lib/format";
import { PromoForm } from "../PromoForm";

export default async function PromoEdit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.query.promoCode.findFirst({ where: eq(s.promoCode.id, id) });
  if (!p) notFound();
  const [categories, uses] = await Promise.all([
    db.select({ id: s.category.id, name: s.category.name }).from(s.category).orderBy(asc(s.category.sortOrder)),
    db.query.promoUsage.findMany({ where: eq(s.promoUsage.promoId, id), orderBy: desc(s.promoUsage.createdAt), limit: 50, with: { order: true } }),
  ]);
  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/promo">← Промокоды</Link>
      </p>
      <h1>{p.code}</h1>
      <div className="panel">
        <PromoForm promo={p} categories={categories} />
      </div>
      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Применения</h2>
        {uses.length ? (
          uses.map((u) => (
            <div key={u.id} className="row-line" style={{ padding: "10px 0" }}>
              {u.order ? <Link href={`/admin/orders/${u.order.id}`}>{u.order.number}</Link> : <span>—</span>}
              <span className="muted small">{fmtDateTime(u.createdAt)}</span>
              <span>{u.order ? `скидка ${rub(u.order.discount)}` : ""}</span>
            </div>
          ))
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Ещё не применяли
          </p>
        )}
      </div>
    </>
  );
}
