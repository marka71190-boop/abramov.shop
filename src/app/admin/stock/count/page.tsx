import type { Metadata } from "next";
import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { COUNT_STATUS, countClubs, listCounts } from "@/lib/stock-count";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { countStartAction } from "./actions";

export const metadata: Metadata = { title: "Ревизии" };
export const dynamic = "force-dynamic";

/** Ревизии в клубах: начать свою, проверить и провести присланные с телефонов кассы */
export default async function CountsPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await requireAdmin();
  const [clubs, rows] = await Promise.all([countClubs(null), listCounts()]);
  const err = (await searchParams).err;
  return (
    <>
      <div className="row" style={{ gap: 6 }}>
        <Link href="/admin/stock" className="btn btn--sm btn--line">
          ← Склад
        </Link>
      </div>
      <h1>Ревизии в клубах</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Сотрудник клуба считает товар сканером на телефоне кассы («Касса» → «Ревизия») и не видит, сколько должно быть. Здесь — расхождения с учётом и кнопка «Провести».
      </p>
      {err && <div className="form-error">Выберите клуб со своим учётом остатков</div>}
      {clubs.length === 0 ? (
        <div className="notice">
          Ревизия — для клубов со своим учётом остатков. Включите его в <Link href="/admin/stock/clubs">«Склад» → «Остатки по клубам»</Link>.
        </div>
      ) : (
        !isDirector(me) && (
          <form action={countStartAction} className="panel row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field" style={{ flex: "1 1 260px", margin: 0 }}>
              Клуб
              <select className="select" name="clubId" required defaultValue={clubs.length === 1 ? clubs[0].id : ""}>
                {clubs.length > 1 && <option value="">— выберите —</option>}
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn--gold">Начать ревизию</button>
          </form>
        )
      )}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Клуб</th>
                <th>Кто считал</th>
                <th>Насчитали</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small">
                    <Link href={`/admin/stock/count/${r.id}`}>{fmtDateTime(r.submittedAt ?? r.createdAt)}</Link>
                  </td>
                  <td className="small">{r.clubTitle}</td>
                  <td className="small">{r.staffName ?? r.author}</td>
                  <td>{Object.values(r.counts).reduce((a, x) => a + x, 0)} шт</td>
                  <td>
                    <span className={`pill${r.status === "SUBMITTED" ? " pill--bad" : r.status === "APPLIED" ? " pill--ok" : ""}`}>{COUNT_STATUS[r.status]}</span>
                    {r.result && r.result.minus > 0 && <div className="small is-loss">недостача {r.result.minus} шт</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
