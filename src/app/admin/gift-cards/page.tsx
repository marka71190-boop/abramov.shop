import { and, desc, eq, gt, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { fmtDate, num, rub } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import { IssueForm } from "./IssueForm";
import { STATUS_PILL } from "./status";

type SP = { q?: string; status?: string };

export default async function GiftCardsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin("OWNER");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const where: SQL[] = [];
  if (q) where.push(or(ilike(s.giftCard.code, `%${q.replace(/[%_]/g, "")}%`), ilike(s.giftCard.recipientName, `%${q.replace(/[%_]/g, "")}%`), ilike(s.giftCard.note, `%${q.replace(/[%_]/g, "")}%`))!);
  if (sp.status === "active") where.push(eq(s.giftCard.status, "ACTIVE"));
  else if (sp.status === "pending") where.push(eq(s.giftCard.status, "PENDING"));
  else if (sp.status === "void") where.push(eq(s.giftCard.status, "VOID"));
  else where.push(sql`${s.giftCard.status} <> 'PENDING' or ${s.giftCard.createdAt} > now() - interval '1 day'`);

  const activeWhere = and(eq(s.giftCard.status, "ACTIVE"), gt(s.giftCard.balance, 0), or(isNull(s.giftCard.expiresAt), gt(s.giftCard.expiresAt, new Date())));
  const [cards, [liability], settings] = await Promise.all([
    db.query.giftCard.findMany({ where: and(...where), orderBy: desc(s.giftCard.createdAt), limit: 200 }),
    db.select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${s.giftCard.balance}), 0)::int` }).from(s.giftCard).where(activeWhere),
    getSettings(),
  ]);
  const days = settings.giftCards.validityDays || 365;
  const defaultExpires = new Date(Date.now() + 3 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);

  return (
    <>
      <h1>Подарочные сертификаты</h1>
      <div className="stats">
        <div className="stat">
          <div className="muted small">Действующих</div>
          <div className="stat__value">{num(liability.n)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Остаток на них — можно потратить</div>
          <div className="stat__value">{rub(liability.sum)}</div>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Продажа на сайте: {settings.giftCards.enabled ? "включена" : "выключена"} · номиналы {settings.giftCards.nominals.map((n) => num(n)).join(", ")} ₽ · срок{" "}
        {settings.giftCards.validityDays ? `${settings.giftCards.validityDays} дн.` : "бессрочно"} · <Link href="/admin/settings#gift-settings">изменить</Link> ·{" "}
        <Link href="/gift" target="_blank">
          страница покупки
        </Link>
      </p>

      <form className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 240px" }}>
          Поиск: код, получатель, заметка
          <input className="input" name="q" defaultValue={q ?? ""} />
        </label>
        <label className="field">
          Статус
          <select className="input" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Все</option>
            <option value="active">Действуют</option>
            <option value="pending">Ждут оплату</option>
            <option value="void">Недействительные</option>
          </select>
        </label>
        <button className="btn btn--line btn--sm" style={{ minHeight: 48 }}>
          Найти
        </button>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Номинал</th>
              <th>Остаток</th>
              <th>Статус</th>
              <th>Откуда</th>
              <th>Создан</th>
              <th>До</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => {
              const st = STATUS_PILL(c);
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/gift-cards/${c.id}`} style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.06em" }}>
                      {c.code}
                    </Link>
                    {(c.recipientName || c.note) && <div className="muted small">{[c.recipientName && `для ${c.recipientName}`, c.note].filter(Boolean).join(" · ")}</div>}
                  </td>
                  <td>{rub(c.initialAmount)}</td>
                  <td>{rub(c.balance)}</td>
                  <td>
                    <span className={`pill ${st.tone}`}>{st.text}</span>
                  </td>
                  <td className="small">{c.source === "SITE" ? "куплен на сайте" : "выпущен в админке"}</td>
                  <td className="small">{fmtDate(c.createdAt)}</td>
                  <td className="small">{c.expiresAt ? fmtDate(c.expiresAt) : c.status === "ACTIVE" ? "бессрочно" : "—"}</td>
                </tr>
              );
            })}
            {!cards.length && (
              <tr>
                <td colSpan={7} className="muted">
                  {q || sp.status ? "Ничего не нашлось" : "Сертификатов пока нет"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Выпустить сертификат</h2>
        <IssueForm defaultExpires={defaultExpires} />
      </div>
    </>
  );
}
