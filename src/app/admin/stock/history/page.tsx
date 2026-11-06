import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDateTime, rub } from "@/lib/format";
import { MOVE_TYPES } from "@/lib/stock-moves";
import { isDirector, requireAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function StockHistoryPage({ searchParams }: { searchParams: Promise<{ t?: string; q?: string; days?: string }> }) {
  const me = await requireAdmin();
  const { t = "", q = "", days = "90" } = await searchParams;
  const since = new Date(Date.now() - Math.min(3650, Math.max(1, Number(days) || 90)) * 86400_000);
  const rows = await db
    .select({ m: s.stockMove, who: s.user.name })
    .from(s.stockMove)
    .leftJoin(s.user, eq(s.user.id, s.stockMove.userId))
    .where(and(gte(s.stockMove.createdAt, since), t && MOVE_TYPES[t] ? eq(s.stockMove.type, t) : undefined, q.trim() ? ilike(s.stockMove.name, `%${q.trim()}%`) : undefined))
    .orderBy(desc(s.stockMove.createdAt))
    .limit(500);
  const sums = await db
    .select({ type: s.stockMove.type, units: sql<number>`sum(${s.stockMove.qty})::int`, money: sql<number>`coalesce(sum(${s.stockMove.qty} * ${s.stockMove.unitCost}), 0)::bigint` })
    .from(s.stockMove)
    .where(gte(s.stockMove.createdAt, since))
    .groupBy(s.stockMove.type);
  const sum = (k: string) => sums.find((x) => x.type === k);

  return (
    <>
      <h1>Журнал движений товара</h1>
      <div className="row" style={{ gap: 6, display: isDirector(me) ? "none" : undefined }}>
        <Link href="/admin/stock/move?t=RECEIPT" className="btn btn--sm btn--gold">
          + Приход
        </Link>
        <Link href="/admin/stock/move?t=WRITE_OFF" className="btn btn--sm btn--line">
          Списание
        </Link>
        <Link href="/admin/stock/move?t=INVENTORY" className="btn btn--sm btn--line">
          Инвентаризация
        </Link>
        <Link href="/admin/stock" className="btn btn--sm btn--line">
          Остатки
        </Link>
      </div>
      <div className="stats">
        <div className="stat">
          <div className="muted small">Пришло за период</div>
          <div className="stat__value">{sum("RECEIPT")?.units ?? 0} шт</div>
          <div className="muted small">{rub(Number(sum("RECEIPT")?.money ?? 0))} по закупке</div>
        </div>
        <div className="stat">
          <div className="muted small">Списано</div>
          <div className="stat__value">{Math.abs(sum("WRITE_OFF")?.units ?? 0)} шт</div>
          <div className="muted small">{rub(Math.abs(Number(sum("WRITE_OFF")?.money ?? 0)))} по закупке</div>
        </div>
        <div className="stat">
          <div className="muted small">Продано в кассе</div>
          <div className="stat__value">{Math.abs((sum("POS")?.units ?? 0) + (sum("POS_CANCEL")?.units ?? 0))} шт</div>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Здесь приход, списания, инвентаризация и продажи в кассе. Продажи на сайте — в разделе <Link href="/admin/orders">Заказы</Link>.
      </p>
      <form className="row" style={{ alignItems: "flex-end", gap: 10 }}>
        <label className="field" style={{ flex: "1 1 200px", margin: 0 }}>
          Товар
          <input className="input" name="q" defaultValue={q} placeholder="Название" />
        </label>
        <label className="field" style={{ margin: 0 }}>
          Что
          <select className="select" name="t" defaultValue={t}>
            <option value="">Все</option>
            {Object.entries(MOVE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          За
          <select className="select" name="days" defaultValue={days}>
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
            <option value="365">год</option>
          </select>
        </label>
        <button className="btn btn--line">Показать</button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Когда</th>
              <th>Что</th>
              <th>Товар</th>
              <th style={{ textAlign: "right" }}>Шт</th>
              <th style={{ textAlign: "right" }}>Закупка</th>
              <th style={{ textAlign: "right" }}>Стало</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, who }) => (
              <tr key={m.id}>
                <td className="small">
                  {fmtDateTime(m.createdAt)}
                  {who && <div className="muted">{who}</div>}
                </td>
                <td className="small">{MOVE_TYPES[m.type] ?? m.type}</td>
                <td>{m.productId ? <Link href={`/admin/catalog/product/${m.productId}`}>{m.name}</Link> : m.name}</td>
                <td style={{ textAlign: "right" }} className={m.qty > 0 ? "form-ok" : m.qty < 0 ? "form-error" : "muted"}>
                  {m.type === "COST" ? "—" : m.qty > 0 ? `+${m.qty}` : m.qty}
                </td>
                <td style={{ textAlign: "right" }} className="small">
                  {m.unitCost != null ? rub(m.unitCost) : "—"}
                </td>
                <td style={{ textAlign: "right" }}>{m.stockAfter ?? "—"}</td>
                <td className="small">{m.note ?? (m.posSaleId ? <Link href="/admin/pos">касса</Link> : "")}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="muted">
                  Движений за этот период нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
