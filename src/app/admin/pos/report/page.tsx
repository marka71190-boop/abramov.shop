import type { Metadata } from "next";
import Link from "next/link";
import { fmtDateTime, rub } from "@/lib/format";
import { pct, posReport } from "@/lib/pos-report";
import { requireAdmin } from "@/lib/viewer";

export const metadata: Metadata = { title: "Скидки и возвраты" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  PENDING: "ждёт",
  APPROVED: "подтверждено",
  USED: "проведено",
  DENIED: "отклонено",
  CANCELLED: "отменили",
  EXPIRED: "время вышло",
};

/**
 * Контроль кассы: кто и где даёт скидки, просит подтверждение, делает возвраты, у кого недостачи.
 * Строки отсортированы по «сумме риска» — скидки + возвраты + недостачи: подозрительное сверху.
 */
export default async function PosReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const days = Math.min(365, Math.max(1, Number((await searchParams).days) || 30));
  const r = await posReport(days);
  const t = r.totals;
  // Средняя доля скидки по всем: у кого заметно выше — подсвечиваем
  const avgPct = pct(t.discount, t.subtotal);

  return (
    <>
      <h1>Скидки и возвраты</h1>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <Link href="/admin/pos" className="btn btn--sm btn--line">
          ← Касса
        </Link>
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/admin/pos/report?days=${d}`} className={`btn btn--sm ${days === d ? "btn--gold" : "btn--line"}`}>
            {d} дней
          </Link>
        ))}
        <Link href="/admin/pos/shifts" className="btn btn--sm btn--line">
          Смены →
        </Link>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="muted small">Скидки</div>
          <div className="stat__value">{rub(t.discount)}</div>
          <div className="muted small">{avgPct} % от суммы чеков</div>
        </div>
        <div className="stat">
          <div className="muted small">Сверх лимита (с подтверждением)</div>
          <div className="stat__value">{rub(t.overLimitSum)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Возвраты</div>
          <div className="stat__value">{rub(t.returnSum)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Недостачи по сменам</div>
          <div className={`stat__value${t.shortage ? " is-loss" : ""}`}>{t.shortage ? `−${rub(-t.shortage)}` : "0 ₽"}</div>
        </div>
        <div className="stat">
          <div className="muted small">Запросов подтверждения</div>
          <div className="stat__value">{t.requests}</div>
          <div className="muted small">отклонено: {t.denied}</div>
        </div>
      </div>

      <h2 className="h4">Кто продаёт</h2>
      {r.rows.length === 0 ? (
        <p className="muted">За {days} дней продаж в кассе не было.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Кассир / на смене</th>
                <th>Чеков</th>
                <th>Со скидкой</th>
                <th>Скидки</th>
                <th>Сверх лимита</th>
                <th>Запросы: да / нет / сгорели</th>
                <th>Возвраты</th>
                <th>Недостачи</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => {
                const share = pct(x.discount, x.subtotal);
                const high = x.sales >= 5 && share > Math.max(5, avgPct * 1.5);
                const manyReturns = x.sales >= 5 && x.returns / x.sales > 0.1;
                return (
                  <tr key={x.key}>
                    <td>
                      <b>{x.staff ?? x.seller}</b>
                      {x.staff && <div className="muted small">{x.seller}</div>}
                      {x.clubs.length > 0 && <div className="muted small">{x.clubs.join("; ")}</div>}
                    </td>
                    <td>
                      {x.sales}
                      <div className="muted small">{rub(x.revenue)}</div>
                    </td>
                    <td>
                      {x.discounted}
                      {x.sales > 0 && <div className="muted small">{Math.round((x.discounted / x.sales) * 100)} % чеков</div>}
                    </td>
                    <td className={high ? "is-loss" : undefined} title={high ? "Доля скидок заметно выше средней" : undefined}>
                      {rub(x.discount)}
                      <div className="small">{share} %</div>
                    </td>
                    <td>
                      {x.overLimit ? (
                        <>
                          {x.overLimit}
                          <div className="muted small">{rub(x.overLimitSum)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {x.requests ? `${x.approved} / ${x.denied} / ${x.lapsed}` : "—"}
                    </td>
                    <td className={manyReturns ? "is-loss" : undefined} title={manyReturns ? "Возвратов больше 10 % чеков" : undefined}>
                      {x.returns ? (
                        <>
                          {x.returns}
                          <div className="small">{rub(x.returnSum)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={x.shortage ? "is-loss" : undefined}>
                      {x.shortage ? `−${rub(-x.shortage)}` : x.shifts ? "0 ₽" : "—"}
                      {x.shifts > 0 && <div className="muted small">смен: {x.shifts}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Красным — доля скидок в 1,5 раза выше средней, возвратов больше 10 % чеков, недостачи. Это повод посмотреть чеки, а не обвинение.</p>

      {r.approvers.length > 0 && (
        <>
          <h2 className="h4">Кто подтверждал</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Менеджер</th>
                  <th>Подтвердил</th>
                  <th>Отклонил</th>
                  <th>Скидок одобрил</th>
                  <th>Возвратов одобрил</th>
                </tr>
              </thead>
              <tbody>
                {r.approvers.map((a) => (
                  <tr key={a.name}>
                    <td>{a.name}</td>
                    <td>{a.approved}</td>
                    <td>{a.denied}</td>
                    <td>{rub(a.discountSum)}</td>
                    <td>{rub(a.returnSum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {r.recent.length > 0 && (
        <>
          <h2 className="h4">Последние запросы</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Что</th>
                  <th>Кто просил</th>
                  <th>Кто решал</th>
                  <th>Итог</th>
                </tr>
              </thead>
              <tbody>
                {r.recent.map((q) => (
                  <tr key={q.id}>
                    <td className="small">{fmtDateTime(q.at)}</td>
                    <td className="small">{q.summary}</td>
                    <td className="small">
                      {q.staff ?? q.seller}
                      {q.place && <div className="muted">{q.place}</div>}
                    </td>
                    <td className="small">{q.approver}</td>
                    <td className="small">
                      <span className={`pill${q.status === "DENIED" ? " pill--bad" : q.status === "APPROVED" || q.status === "USED" ? " pill--ok" : ""}`}>{STATUS[q.status] ?? q.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
