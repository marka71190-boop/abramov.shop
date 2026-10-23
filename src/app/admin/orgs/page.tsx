import { desc, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { TONE_PILL } from "@/lib/order-status";
import { requireAdmin } from "@/lib/viewer";
import { ORG_KIND, ORG_STATUS } from "@/lib/wholesale";

export default async function OrgsAdmin() {
  await requireAdmin();
  const orgs = await db.query.organization.findMany({
    orderBy: [sql`case when ${s.organization.status} = 'PENDING' then 0 else 1 end`, desc(s.organization.updatedAt)],
    limit: 500,
  });
  const pending = orgs.filter((o) => o.status === "PENDING").length;
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Организации {pending > 0 && <span className="pill pill--warn">{pending} на проверке</span>}</h1>
        <Link href="/opt" className="btn btn--line btn--sm">
          Страница для организаций
        </Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Клубы и магазины подают заявку на странице «Опт». После одобрения их сотрудники видят оптовый каталог и могут платить по счёту. Какие товары
        продаются оптом — в карточке товара, поле «Где продаётся». Реквизиты для счетов — в Настройках.
      </p>
      {orgs.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Организация</th>
                <th>Тип, город</th>
                <th>ИНН</th>
                <th>Статус</th>
                <th>Заявка</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orgs/${o.id}`}>{o.name}</Link>
                  </td>
                  <td className="small">
                    {ORG_KIND[o.kind] ?? o.kind}
                    {o.city ? `, ${o.city}` : ""}
                    {o.tables ? ` · ${o.tables} ст.` : ""}
                  </td>
                  <td className="small">{o.inn}</td>
                  <td>
                    <span className={`pill ${TONE_PILL[ORG_STATUS[o.status].tone]}`}>{ORG_STATUS[o.status].text}</span>
                  </td>
                  <td className="small muted">{fmtDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Заявок пока нет.</p>
      )}
    </>
  );
}
