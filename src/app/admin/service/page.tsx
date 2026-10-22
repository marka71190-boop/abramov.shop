import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDate, fmtDateTime, rub } from "@/lib/format";
import { TONE_PILL } from "@/lib/order-status";
import { SERVICE_STATUS, estimate, type ServiceStatus } from "@/lib/service";
import { requireAdmin } from "@/lib/viewer";

export default async function ServiceAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await requireAdmin();
  const { status } = await searchParams;
  const st = status && status in SERVICE_STATUS ? (status as ServiceStatus) : null;
  const [rows, clubs] = await Promise.all([
    db.query.serviceRequest.findMany({ where: st ? eq(s.serviceRequest.status, st) : undefined, orderBy: desc(s.serviceRequest.createdAt), limit: 200 }),
    db.select({ id: s.club.id, name: s.club.name, city: s.club.city }).from(s.club),
  ]);
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Мастерская</h1>
        {me.role === "OWNER" && (
          <Link href="/admin/service/prices" className="btn btn--line">
            Прайс и настройки
          </Link>
        )}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Link href="/admin/service" className={`btn btn--sm ${!st ? "btn--gold" : "btn--line"}`}>
          Все
        </Link>
        {(Object.keys(SERVICE_STATUS) as ServiceStatus[]).map((k) => (
          <Link key={k} href={`/admin/service?status=${k}`} className={`btn btn--sm ${st === k ? "btn--gold" : "btn--line"}`}>
            {SERVICE_STATUS[k].text}
          </Link>
        ))}
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Заявка</th>
                <th>Работы</th>
                <th>Клуб / СДЭК</th>
                <th>Цена</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const club = clubs.find((c) => c.id === r.clubId);
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/service/${r.id}`}>{r.number}</Link>
                      <div className="muted small">{fmtDateTime(r.createdAt)}</div>
                    </td>
                    <td className="small">{r.items.map((i) => i.name).join(", ")}</td>
                    <td className="small">
                      {r.handover === "CLUB" ? `Принесут: ${club ? `${club.name}, ${club.city}` : "клуб"}` : "Пришлют СДЭК"}
                      <div className="muted">{r.returnMethod === "CLUB" ? "Заберут в клубе" : "Вернуть СДЭК"}</div>
                    </td>
                    <td className="small">
                      {r.price != null ? rub(r.price) : <span className="muted">~{rub(estimate(r))}</span>}
                      {r.paidAt && <div className="pill pill--ok">оплачено</div>}
                      {r.readyBy && <div className="muted">к {fmtDate(r.readyBy)}</div>}
                    </td>
                    <td>
                      <span className={`pill ${TONE_PILL[SERVICE_STATUS[r.status].tone]}`}>{SERVICE_STATUS[r.status].text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Заявок нет.</p>
      )}
    </>
  );
}
