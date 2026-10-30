import { and, eq, gte, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { ensureCoachProfile } from "@/lib/trainings";
import { requireAdmin } from "@/lib/viewer";
import { toggleCoach } from "./actions";

export default async function CoachesAdmin() {
  await requireAdmin();
  const users = await db.query.user.findMany({ where: eq(s.user.role, "COACH"), columns: { id: true, name: true, email: true } });
  const now = new Date();
  const month = new Date(+now + 30 * 86400_000);
  const ago = new Date(+now - 30 * 86400_000);
  const rows = await Promise.all(
    users.map(async (u) => {
      const p = await ensureCoachProfile(u.id);
      const [[up], [att]] = await Promise.all([
        db
          .select({
            slots: sql<number>`count(distinct ${s.trainingSlot.id})::int`,
            booked: sql<number>`count(${s.trainingBooking.id}) filter (where ${s.trainingBooking.status} = 'BOOKED')::int`,
            requested: sql<number>`count(${s.trainingBooking.id}) filter (where ${s.trainingBooking.status} = 'REQUESTED')::int`,
          })
          .from(s.trainingSlot)
          .leftJoin(s.trainingBooking, eq(s.trainingBooking.slotId, s.trainingSlot.id))
          .where(and(eq(s.trainingSlot.coachId, u.id), eq(s.trainingSlot.status, "OPEN"), gte(s.trainingSlot.startsAt, now), lt(s.trainingSlot.startsAt, month))),
        db
          .select({
            attended: sql<number>`count(*) filter (where ${s.trainingBooking.status} = 'ATTENDED')::int`,
            noShow: sql<number>`count(*) filter (where ${s.trainingBooking.status} = 'NO_SHOW')::int`,
          })
          .from(s.trainingBooking)
          .innerJoin(s.trainingSlot, eq(s.trainingSlot.id, s.trainingBooking.slotId))
          .where(and(eq(s.trainingSlot.coachId, u.id), gte(s.trainingSlot.startsAt, ago), lt(s.trainingSlot.startsAt, now))),
      ]);
      return { u, p, up, att };
    }),
  );
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Тренеры</h1>
        <Link href="/trenirovki" className="btn btn--line btn--sm" target="_blank">
          Раздел на сайте
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Чтобы добавить тренера: он регистрируется на сайте, затем откройте его в «Клиентах» и выберите роль «Тренер». У него появится кабинет: дневник,
        рабочее время, заявки клиентов, групповые, профиль. Отсюда можно скрыть тренера с сайта или вести расписание за него.
      </p>
      {rows.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Тренер</th>
                <th>Впереди (30 дней)</th>
                <th>Прошло за 30 дней</th>
                <th>На сайте</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ u, p, up, att }) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/customers/${u.id}`}>{p.displayName}</Link>
                    <div className="small muted">{u.email}</div>
                  </td>
                  <td className="small">
                    тренировок {up?.slots ?? 0}, подтверждено {up?.booked ?? 0}
                    {up?.requested ? <span className="gold">, заявок {up.requested}</span> : null}
                  </td>
                  <td className="small">
                    пришли {att?.attended ?? 0}, не пришли {att?.noShow ?? 0}
                  </td>
                  <td>
                    <form action={toggleCoach.bind(null, u.id)}>
                      <button className={`btn btn--sm ${p.isPublished ? "btn--line" : "btn--gold"}`}>{p.isPublished ? "Скрыть" : "Показать"}</button>
                    </form>
                  </td>
                  <td className="small">
                    <Link href={`/coach?u=${u.id}`}>Кабинет</Link> · <Link href={`/trenirovki/${p.slug}`}>Страница</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Тренеров пока нет.</p>
      )}
    </>
  );
}
