import Link from "next/link";
import { db, schema as s } from "@/db";
import { CONSENT_KIND_LABEL, CONSENT_SOURCE_LABEL, consentRows, consentWhere } from "@/lib/consent-query";
import { fmtDate, fmtDateTime, num, prettyPhone } from "@/lib/format";

const PER_PAGE = 50;
type SP = { q?: string; kind?: string; status?: string; from?: string; to?: string; page?: string };

export default async function ConsentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number(sp.page) || 1);
  const where = consentWhere(sp);
  const [rows, total] = await Promise.all([consentRows(where, PER_PAGE, (pageNum - 1) * PER_PAGE), db.$count(s.consent, where)]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const base = { q: sp.q ?? "", kind: sp.kind ?? "", status: sp.status ?? "", from: sp.from ?? "", to: sp.to ?? "" };
  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ ...base, ...extra })}`;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Журнал согласий</h1>
        <a className="btn btn--gold btn--sm" href={`/admin/consents/export${qs({})}`}>
          Выгрузить в Excel (CSV)
        </a>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Каждая отметка галочки: кто, когда, с какого IP и браузера, какую редакцию документа видел. Записи не удаляются — отзыв
        фиксируется отдельной отметкой. Это доказательство согласия для Роскомнадзора.
      </p>

      <form className="toolbar">
        <label className="field" style={{ flex: "1 1 240px" }}>
          Телефон, почта, имя или IP
          <input className="input" name="q" defaultValue={sp.q} />
        </label>
        <label className="field">
          Вид
          <select className="select" name="kind" defaultValue={sp.kind}>
            <option value="">Все</option>
            <option value="PERSONAL_DATA">Обработка ПДн</option>
            <option value="MARKETING">Рассылки</option>
          </select>
        </label>
        <label className="field">
          Статус
          <select className="select" name="status" defaultValue={sp.status}>
            <option value="">Все</option>
            <option value="active">Действует</option>
            <option value="revoked">Отозвано</option>
            <option value="unlinked">Без аккаунта</option>
          </select>
        </label>
        <label className="field">
          С
          <input className="input" type="date" name="from" defaultValue={sp.from} />
        </label>
        <label className="field">
          По
          <input className="input" type="date" name="to" defaultValue={sp.to} />
        </label>
        <button className="btn btn--line btn--sm">Показать</button>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Дата и время (МСК)</th>
              <th>Вид</th>
              <th>Кто</th>
              <th>Телефон</th>
              <th>Где отмечено</th>
              <th>Редакция</th>
              <th>IP / браузер</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.createdAt)}</td>
                <td>{CONSENT_KIND_LABEL[r.kind]}</td>
                <td>
                  {r.userId ? <Link href={`/admin/customers/${r.userId}`}>{r.name || r.userEmail}</Link> : r.name || "—"}
                  <div className="muted small">{r.email || r.userEmail}</div>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{prettyPhone(r.phone) || "—"}</td>
                <td>{CONSENT_SOURCE_LABEL[r.source]}</td>
                <td>{r.docVersion}</td>
                <td>
                  {r.ip || "—"}
                  <div className="muted small" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.userAgent ?? ""}>
                    {r.userAgent}
                  </div>
                </td>
                <td>
                  {r.revokedAt ? (
                    <span className="pill pill--bad">Отозвано {fmtDate(r.revokedAt)}</span>
                  ) : !r.userId ? (
                    <span className="pill pill--warn" title="Галочку отметили, но аккаунт не создали">
                      Без аккаунта
                    </span>
                  ) : (
                    <span className="pill pill--ok">Действует</span>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="muted">
                  Записей нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        {pageNum > 1 && <Link href={qs({ page: String(pageNum - 1) })}>← Назад</Link>}
        <span>
          Страница {pageNum} из {pages} · всего {num(total)}
        </span>
        {pageNum < pages && <Link href={qs({ page: String(pageNum + 1) })}>Дальше →</Link>}
      </div>
    </>
  );
}
