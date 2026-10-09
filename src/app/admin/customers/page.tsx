import { and, desc, ilike, isNotNull, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDate, num, prettyPhone } from "@/lib/format";
import { getActiveBan } from "@/lib/viewer";

const PER_PAGE = 50;
type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

export default async function CustomersPage({ searchParams }: Props) {
  const { q = "", status = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);

  const conds: SQL[] = [];
  const term = q.trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, "")}%`;
    const digits = term.replace(/\D/g, "");
    conds.push(
      or(
        ilike(s.user.name, like),
        ilike(s.user.email, like),
        ...(digits.length >= 3 ? [ilike(s.user.phone, `%${digits.slice(-10)}%`)] : []),
        ilike(s.user.banTicket, like),
      )!,
    );
  }
  if (status === "banned") conds.push(isNotNull(s.user.bannedAt));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, total] = await Promise.all([
    db.select().from(s.user).where(where).orderBy(desc(s.user.createdAt)).limit(PER_PAGE).offset((pageNum - 1) * PER_PAGE),
    db.$count(s.user, where),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ q, status, page: String(p) })}`;

  return (
    <>
      <h1>Клиенты</h1>
      <form className="toolbar">
        <label className="field" style={{ flex: "1 1 280px" }}>
          Поиск: имя, почта, телефон, номер бана
          <input className="input" name="q" defaultValue={q} />
        </label>
        <label className="field">
          Статус
          <select className="select" name="status" defaultValue={status}>
            <option value="">Все</option>
            <option value="banned">Заблокированные</option>
          </select>
        </label>
        <button className="btn btn--line btn--sm">Найти</button>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Телефон</th>
              <th>Бонусы</th>
              <th>Уровень</th>
              <th>Регистрация</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const ban = getActiveBan(u);
              return (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/customers/${u.id}`}>{u.name}</Link>
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td>{prettyPhone(u.phone)}</td>
                  <td>{num(u.bonusBalance)}</td>
                  <td>{u.tier}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>
                    {ban ? (
                      <span className="pill pill--bad">Бан{ban.until ? ` до ${fmtDate(ban.until)}` : ""}</span>
                    ) : u.role !== "CUSTOMER" ? (
                      <span className="pill pill--warn">{u.role === "OWNER" ? "Владелец" : "Менеджер"}</span>
                    ) : (
                      <span className="pill pill--ok">Активен</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="muted">
                  Никого не нашли
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        {pageNum > 1 && <Link href={qs(pageNum - 1)}>← Назад</Link>}
        <span>
          Страница {pageNum} из {pages} · всего {num(total)}
        </span>
        {pageNum < pages && <Link href={qs(pageNum + 1)}>Дальше →</Link>}
      </div>
    </>
  );
}
