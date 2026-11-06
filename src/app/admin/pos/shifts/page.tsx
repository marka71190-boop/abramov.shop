import { desc, eq, gte } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDateTime, rub } from "@/lib/format";
import { shiftTotals } from "@/lib/pos-shifts";
import { requireAdmin } from "@/lib/viewer";

export const metadata: Metadata = { title: "Смены кассы" };
export const dynamic = "force-dynamic";

const signed = (k: number) => (k > 0 ? `+${rub(k)}` : k < 0 ? `−${rub(-k)}` : "0 ₽");

/** Смены кассы: кто, где, сколько продал, сошлись ли наличные */
export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const days = Math.min(365, Math.max(1, Number((await searchParams).days) || 30));
  const rows = await db
    .select({ sh: s.posShift, seller: s.user.name })
    .from(s.posShift)
    .leftJoin(s.user, eq(s.user.id, s.posShift.sellerId))
    .where(gte(s.posShift.openedAt, new Date(Date.now() - days * 86400_000)))
    .orderBy(desc(s.posShift.openedAt))
    .limit(300);
  // У открытых смен — текущие продажи
  const open = await Promise.all(rows.filter((r) => r.sh.status === "OPEN").map(async (r) => [r.sh.id, await shiftTotals(r.sh.id)] as const));
  const openT = new Map(open);
  const closed = rows.filter((r) => r.sh.status === "CLOSED");
  const shortage = closed.reduce((a, r) => a + Math.min(0, (r.sh.countedCash ?? 0) - (r.sh.expectedCash ?? 0)), 0);
  const withDiff = closed.filter((r) => (r.sh.countedCash ?? 0) !== (r.sh.expectedCash ?? 0)).length;

  return (
    <>
      <h1>Смены кассы</h1>
      <div className="row" style={{ gap: 6 }}>
        <Link href="/admin/pos" className="btn btn--sm btn--line">
          ← Касса
        </Link>
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/admin/pos/shifts?days=${d}`} className={`btn btn--sm ${days === d ? "btn--gold" : "btn--line"}`}>
            {d} дней
          </Link>
        ))}
      </div>
      <div className="stats">
        <div className="stat">
          <div className="muted small">Смен закрыто</div>
          <div className="stat__value">{closed.length}</div>
        </div>
        <div className="stat">
          <div className="muted small">С расхождением</div>
          <div className={`stat__value${withDiff ? " is-loss" : ""}`}>{withDiff}</div>
        </div>
        <div className="stat">
          <div className="muted small">Недостачи всего</div>
          <div className={`stat__value${shortage ? " is-loss" : ""}`}>{shortage ? `−${rub(-shortage)}` : "0 ₽"}</div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Смена</th>
              <th>Кто, где</th>
              <th style={{ textAlign: "right" }}>Размен</th>
              <th style={{ textAlign: "right" }}>Наличные</th>
              <th style={{ textAlign: "right" }}>СБП и карта</th>
              <th style={{ textAlign: "right" }}>Должно быть</th>
              <th style={{ textAlign: "right" }}>Пересчитали</th>
              <th style={{ textAlign: "right" }}>Разница</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sh, seller }) => {
              const t = openT.get(sh.id);
              const cash = sh.cashSales ?? t?.cash ?? 0;
              const other = sh.otherSales ?? t?.other ?? 0;
              const expected = sh.expectedCash ?? sh.openingCash + cash;
              const diff = sh.countedCash != null ? sh.countedCash - expected : null;
              return (
                <tr key={sh.id}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>
                    {fmtDateTime(sh.openedAt)}
                    <div className="muted">{sh.closedAt ? `до ${fmtDateTime(sh.closedAt).slice(-5)}` : <span className="pill pill--warn">открыта</span>}</div>
                  </td>
                  <td className="small">
                    {sh.staffName ? (
                      <>
                        <b>{sh.staffName}</b>
                        <div className="muted">{seller ?? "—"}</div>
                      </>
                    ) : (
                      (seller ?? "—")
                    )}
                    {sh.place && <div className="muted">{sh.place}</div>}
                    {sh.note && <div className="muted">«{sh.note}»</div>}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{rub(sh.openingCash)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{rub(cash)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{rub(other)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{rub(expected)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{sh.countedCash != null ? rub(sh.countedCash) : "—"}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className={diff ? "is-loss" : diff === 0 ? "form-ok-text" : "muted"}>
                    {diff == null ? "—" : diff === 0 ? "сошлось" : signed(diff)}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="muted">
                  Смен за этот период не было
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Должно быть = размен + оплаченные наличными продажи смены. Отменённые продажи не считаются — наличные за них вернули покупателю.
      </p>
    </>
  );
}
