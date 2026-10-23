import { desc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDateTime, rub } from "@/lib/format";
import { TONE_PILL } from "@/lib/order-status";
import { TURNKEY_STATUS, type TurnkeyStatus } from "@/lib/turnkey";
import { requireAdmin } from "@/lib/viewer";

export default async function TurnkeyAdmin() {
  const me = await requireAdmin();
  const rows = await db.query.turnkeyRequest.findMany({ orderBy: desc(s.turnkeyRequest.createdAt), limit: 300 });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Клуб под ключ</h1>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/klub-pod-klyuch" className="btn btn--line btn--sm">
            Конструктор на сайте
          </Link>
          {me.role === "OWNER" && (
            <Link href="/admin/turnkey/settings" className="btn btn--line btn--sm">
              Столы, цены и нормы
            </Link>
          )}
        </div>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Заявка</th>
                <th>Клиент</th>
                <th>Зал</th>
                <th>Смета</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = TURNKEY_STATUS[r.status as TurnkeyStatus] ?? TURNKEY_STATUS.NEW;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/turnkey/${r.id}`}>{r.number}</Link>
                      <div className="muted small">{fmtDateTime(r.createdAt)}</div>
                    </td>
                    <td className="small">
                      {r.name}
                      {r.city ? `, ${r.city}` : ""}
                    </td>
                    <td className="small">
                      {(r.area / 100).toLocaleString("ru-RU")} м² · {r.tableCount} ст.
                    </td>
                    <td>{r.total ? rub(r.total) : <span className="muted small">по запросу</span>}</td>
                    <td>
                      <span className={`pill ${TONE_PILL[st.tone]}`}>{st.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Заявок пока нет.</p>
      )}
    </>
  );
}
