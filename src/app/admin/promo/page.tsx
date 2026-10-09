import { asc, desc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDate, rub } from "@/lib/format";
import { togglePromo } from "../shop-actions";
import { PromoForm, PromoToggle } from "./PromoForm";

export default async function PromoPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const [promos, categories] = await Promise.all([
    db.query.promoCode.findMany({ orderBy: desc(s.promoCode.createdAt) }),
    db.select({ id: s.category.id, name: s.category.name }).from(s.category).orderBy(asc(s.category.sortOrder)),
  ]);
  const now = new Date();

  return (
    <>
      <h1>Промокоды</h1>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Скидка</th>
              <th>Условия</th>
              <th>Использован</th>
              <th>Вкл.</th>
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => {
              const expired = p.endsAt && p.endsAt < now;
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/promo/${p.id}`} style={{ fontWeight: 600, letterSpacing: "0.06em" }}>
                      {p.code}
                    </Link>
                    {p.note && <div className="muted small">{p.note}</div>}
                  </td>
                  <td>{p.type === "PERCENT" ? `${p.value}%` : p.type === "FIXED" ? rub(p.value) : "Бесплатная доставка"}</td>
                  <td className="small">
                    {[
                      p.minOrder ? `от ${rub(p.minOrder)}` : null,
                      p.firstOrderOnly ? "первый заказ" : null,
                      p.categoryId ? `категория: ${categories.find((c) => c.id === p.categoryId)?.name}` : null,
                      !p.combinableWithBonus ? "без бонусов" : null,
                      p.endsAt ? `до ${fmtDate(p.endsAt)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {expired && <div><span className="pill pill--bad">истёк</span></div>}
                  </td>
                  <td>
                    {p.usedCount}
                    {p.maxUses ? ` из ${p.maxUses}` : ""}
                  </td>
                  <td>
                    <PromoToggle id={p.id} on={p.isActive} action={togglePromo} />
                  </td>
                </tr>
              );
            })}
            {!promos.length && (
              <tr>
                <td colSpan={5} className="muted">
                  Промокодов пока нет — создайте первый ниже
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Новый промокод</h2>
        <PromoForm promo={null} categories={categories} saved={saved === "1"} />
      </div>
    </>
  );
}
