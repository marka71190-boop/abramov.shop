import { desc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDate } from "@/lib/format";
import { SECTIONS } from "@/lib/journal-shared";
import { requireAdmin } from "@/lib/viewer";
import { isPublic, VISIBILITY_LABEL } from "@/lib/visibility";

export default async function JournalAdmin() {
  await requireAdmin();
  const list = await db.query.article.findMany({ orderBy: desc(s.article.updatedAt) });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Журнал</h1>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/zhurnal" className="btn btn--line btn--sm">
            Журнал на сайте
          </Link>
          <Link href="/admin/journal/new" className="btn btn--gold btn--sm">
            + Статья
          </Link>
        </div>
      </div>
      {list.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Статья</th>
                <th>Раздел</th>
                <th>Статус</th>
                <th>Изменена</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/admin/journal/${a.id}`}>{a.title}</Link>
                    <div className="muted small">/zhurnal/{a.slug}</div>
                  </td>
                  <td className="small">{SECTIONS[a.section] ?? a.section}</td>
                  <td>
                    <span className={`pill ${isPublic(a) ? "pill--ok" : ""}`}>{isPublic(a) ? "На сайте" : VISIBILITY_LABEL[a.visibility]}</span>
                  </td>
                  <td className="small muted">{fmtDate(a.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Статей пока нет.</p>
      )}
    </>
  );
}
