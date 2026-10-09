import { asc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { VisibilitySelect } from "../VisibilitySelect";

export default async function PagesAdmin() {
  const pages = await db.select().from(s.page).orderBy(asc(s.page.sortOrder), asc(s.page.title));
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Страницы</h1>
        <Link href="/admin/pages/new" className="btn btn--gold btn--sm">
          Новая страница
        </Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Скрытые и черновики покупатели не видят — их нет в меню, поиске и карте сайта. Вы можете открыть их по ссылке «Предпросмотр»
        и опубликовать, когда наполните.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Страница</th>
              <th>Адрес</th>
              <th>Видимость</th>
              <th>В подвале</th>
              <th>Изменена</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/pages/${p.id}`}>{p.title}</Link>
                  {p.publishAt && p.publishAt > new Date() && <div className="muted small">Откроется {fmtDateTime(p.publishAt)}</div>}
                </td>
                <td className="muted">/p/{p.slug}</td>
                <td>
                  <VisibilitySelect entity="page" id={p.id} value={p.visibility} />
                </td>
                <td>{p.showInFooter ? "Да" : "—"}</td>
                <td className="muted">{fmtDateTime(p.updatedAt)}</td>
                <td>
                  <a href={`/p/${p.slug}?preview=${p.previewToken}`} target="_blank" rel="noreferrer">
                    Предпросмотр
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
