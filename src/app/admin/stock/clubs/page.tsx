import Link from "next/link";
import { inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { stockClubs } from "@/lib/club-stock";
import { num } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";
import { OwnStockToggle } from "./OwnStockToggle";

export const metadata = { title: "Остатки по клубам" };
export const dynamic = "force-dynamic";

/** Остатки по клубам: где сколько лежит; включение своего учёта у клуба */
export default async function ClubStockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireAdmin();
  const { q = "" } = await searchParams;
  const clubs = await stockClubs();
  const own = clubs.filter((c) => c.ownStock);
  const rows = await db.execute<{ id: string; name: string; sku: string | null; stock: number }>(sql`
    select v.id,
      case when (select count(*) from product_variant v2 where v2.product_id = p.id and v2.is_active) > 1 then p.name || ' · ' || v.name else p.name end as name,
      coalesce(v.sku, p.sku) as sku, v.stock
    from product_variant v join product p on p.id = v.product_id
    where v.is_active
    order by p.name, v.sort_order`);
  const cs = own.length
    ? await db.select().from(s.clubStock).where(inArray(s.clubStock.clubId, own.map((c) => c.id)))
    : [];
  const qty = (clubId: string, variantId: string) => cs.find((x) => x.clubId === clubId && x.variantId === variantId)?.qty ?? 0;
  const needle = q.trim().toLowerCase();
  const list = rows.rows
    .map((r) => ({ ...r, stock: Number(r.stock), clubs: own.map((c) => qty(c.id, r.id)) }))
    .filter((r) => (needle ? `${r.name} ${r.sku ?? ""}`.toLowerCase().includes(needle) : r.stock > 0 || r.clubs.some((x) => x > 0)));

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/stock">← Остатки</Link>
      </p>
      <h1>Остатки по клубам</h1>
      <div className="panel stack" style={{ gap: 10 }}>
        <h2 style={{ margin: 0 }}>Свой учёт в клубе</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Включён — касса клуба продаёт из остатка клуба, товар туда привозят перемещением со склада. Выключен — касса клуба продаёт со склада, как раньше. Сайт
          всегда продаёт со склада.
        </p>
        {clubs.map((c) => (
          <div key={c.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span>{c.title}</span>
            <OwnStockToggle clubId={c.id} on={c.ownStock} disabled={me.role !== "OWNER"} />
          </div>
        ))}
        {me.role !== "OWNER" && <p className="muted small" style={{ margin: 0 }}>Включает и выключает учёт владелец.</p>}
      </div>

      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <Link href="/admin/stock/transfer" className="btn btn--gold btn--sm">
          Перемещение
        </Link>
        <Link href="/admin/stock/refill" className="btn btn--line btn--sm">
          Заканчивается и нормы
        </Link>
        {own.length > 0 && (
          <Link href={`/admin/stock/labels?club=${own[0].id}`} className="btn btn--line btn--sm">
            Этикетки для клуба
          </Link>
        )}
        <form className="row" style={{ gap: 6 }}>
          <input className="input" name="q" defaultValue={q} placeholder="Найти товар" style={{ minHeight: 40 }} />
        </form>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Товар</th>
              <th style={{ textAlign: "right" }}>Склад</th>
              {own.map((c) => (
                <th key={c.id} style={{ textAlign: "right" }}>
                  {c.title}
                </th>
              ))}
              <th style={{ textAlign: "right" }}>Всего</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name}
                  {r.sku && <div className="muted small">{r.sku}</div>}
                </td>
                <td style={{ textAlign: "right" }}>{num(r.stock)}</td>
                {r.clubs.map((x, i) => (
                  <td key={own[i].id} style={{ textAlign: "right" }} className={x === 0 ? "muted" : undefined}>
                    {num(x)}
                  </td>
                ))}
                <td style={{ textAlign: "right" }}>
                  <b>{num(r.stock + r.clubs.reduce((a, x) => a + x, 0))}</b>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={3 + own.length} className="muted">
                  Ничего не нашли
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
