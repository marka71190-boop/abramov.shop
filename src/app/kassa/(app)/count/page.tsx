import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { countStartAction } from "@/app/admin/stock/count/actions";
import { db, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { currentShift } from "@/lib/pos-shifts";
import { COUNT_STATUS, countClubs } from "@/lib/stock-count";
import { requireCashier } from "@/lib/viewer";

export const metadata = { title: "Ревизия" };

/** Ревизия в клубе с телефона кассы */
export default async function KassaCountPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { me, admin } = await requireCashier();
  const [clubs, shift, mine] = await Promise.all([
    countClubs(admin || !me.clubIds.length ? null : me.clubIds),
    currentShift(me.id),
    db.query.stockCount.findMany({ where: and(eq(s.stockCount.createdById, me.id)), orderBy: desc(s.stockCount.createdAt), limit: 10 }),
  ]);
  const err = (await searchParams).err;
  const preset = shift?.clubId && clubs.some((c) => c.id === shift.clubId) ? shift.clubId : clubs.length === 1 ? clubs[0].id : "";
  return (
    <>
      <Link href="/kassa" className="muted small">
        ← Касса
      </Link>
      <h1 style={{ margin: 0 }}>Ревизия</h1>
      <p className="muted" style={{ margin: 0 }}>
        Пройдите по клубу и отсканируйте каждый товар. Когда закончите — отправьте менеджеру: он сверит с учётом.
      </p>
      {err && <div className="form-error">В этом клубе ревизия недоступна</div>}
      {clubs.length === 0 ? (
        <div className="notice notice--muted">В вашем клубе не ведётся свой учёт остатков — ревизия не нужна.</div>
      ) : (
        <form action={countStartAction} className="panel stack" style={{ gap: 12 }}>
          <label className="field" style={{ margin: 0 }}>
            Клуб
            <select className="select" name="clubId" required defaultValue={preset}>
              {clubs.length > 1 && <option value="">— выберите —</option>}
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {me.isDevice && (
            <label className="field" style={{ margin: 0 }}>
              Кто считает
              <input className="input" name="staffName" defaultValue={shift?.staffName ?? ""} maxLength={80} required placeholder="Имя сотрудника" />
            </label>
          )}
          <button className="btn btn--gold">Начать или продолжить</button>
        </form>
      )}
      {mine.length > 0 && (
        <ul className="stack small" style={{ gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
          {mine.map((c) => (
            <li key={c.id}>
              <Link href={`/kassa/count/${c.id}`}>{fmtDateTime(c.createdAt)}</Link> · {Object.values(c.counts).reduce((a, x) => a + x, 0)} шт ·{" "}
              <span className="muted">{COUNT_STATUS[c.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
