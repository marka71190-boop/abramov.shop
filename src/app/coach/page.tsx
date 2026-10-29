import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { PushToggle } from "@/components/pwa/PushToggle";
import { listClubs } from "@/lib/clubs";
import { prettyPhone, rub } from "@/lib/format";
import { pushPublicKey } from "@/lib/push";
import { dayKey, ensureCoachProfile, fmtDay, fmtTime, KIND_LABEL, requireCoach } from "@/lib/trainings";
import { isAdmin } from "@/lib/viewer";
import { CancelSlot, Mark, ProfileForm, SlotForm } from "./forms";

type Props = { searchParams: Promise<{ u?: string }> };

export default async function CoachPage({ searchParams }: Props) {
  const me = await requireCoach();
  const { u } = await searchParams;
  const admin = isAdmin(me);
  // Админ может вести расписание за любого тренера
  const coaches = admin ? await db.query.user.findMany({ where: eq(s.user.role, "COACH"), columns: { id: true, name: true }, orderBy: asc(s.user.name) }) : [];
  const coachId = admin ? (coaches.find((c) => c.id === u)?.id ?? (me.role === "COACH" ? me.id : coaches[0]?.id)) : me.id;
  if (!coachId) {
    return (
      <div className="panel stack">
        <h1 className="h3">Тренеров пока нет</h1>
        <p className="muted">Выдайте роль «Тренер» в карточке клиента: Админка → Клиенты → роль.</p>
      </div>
    );
  }
  const profile = await ensureCoachProfile(coachId);
  const clubs = await listClubs();
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    db.query.trainingSlot.findMany({
      where: and(eq(s.trainingSlot.coachId, coachId), eq(s.trainingSlot.status, "OPEN"), gte(s.trainingSlot.startsAt, new Date(+now - 3 * 3600_000))),
      with: { club: true, bookings: { with: { user: { columns: { name: true, phone: true, email: true } } } } },
      orderBy: asc(s.trainingSlot.startsAt),
      limit: 200,
    }),
    db.query.trainingSlot.findMany({
      where: and(eq(s.trainingSlot.coachId, coachId), lt(s.trainingSlot.startsAt, new Date(+now - 3 * 3600_000)), gte(s.trainingSlot.startsAt, new Date(+now - 30 * 86400_000))),
      with: { club: true, bookings: { with: { user: { columns: { name: true, phone: true, email: true } } } } },
      orderBy: desc(s.trainingSlot.startsAt),
      limit: 100,
    }),
  ]);
  const days = new Map<string, typeof upcoming>();
  for (const sl of upcoming) days.set(dayKey(sl.startsAt), [...(days.get(dayKey(sl.startsAt)) ?? []), sl]);
  const totalBooked = upcoming.reduce((n, sl) => n + sl.bookings.filter((b) => b.status !== "CANCELLED").length, 0);
  const filled = !!(profile.photo && profile.about.length > 30);

  const SlotCard = ({ sl, past: isPast }: { sl: (typeof upcoming)[number]; past?: boolean }) => {
    const active = sl.bookings.filter((b) => b.status !== "CANCELLED");
    return (
      <article className="coach-slot">
        <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <b>{fmtTime(sl.startsAt)}</b> · {sl.durationMin} мин · {sl.title}
            <div className="small muted">
              {sl.club.name}, {sl.club.city} · {KIND_LABEL[sl.kind]} · {sl.price ? rub(sl.price) : "бесплатно"}
            </div>
          </div>
          <span className={`pill ${active.length >= sl.capacity ? "pill--ok" : ""}`}>
            {active.length} из {sl.capacity}
          </span>
        </div>
        {active.length > 0 ? (
          <ul className="coach-slot__people">
            {active.map((b) => (
              <li key={b.id}>
                <span>
                  {b.user.name}
                  <span className="muted small">
                    {" "}
                    · {b.user.phone ? <a href={`tel:${b.user.phone}`}>{prettyPhone(b.user.phone)}</a> : b.user.email}
                  </span>
                  {b.comment && <div className="small muted">«{b.comment}»</div>}
                </span>
                {(isPast || +sl.startsAt <= Date.now()) && <Mark bookingId={b.id} status={b.status} />}
              </li>
            ))}
          </ul>
        ) : (
          <div className="small muted">Пока никто не записался</div>
        )}
        {!isPast && +sl.startsAt > Date.now() && <CancelSlot slotId={sl.id} booked={active.length} />}
      </article>
    );
  };

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h2" style={{ margin: 0 }}>
          {profile.displayName}
        </h1>
        <div className="muted">
          Впереди тренировок: {upcoming.length}, записей: {totalBooked}.{" "}
          {profile.isPublished ? <Link href={`/trenirovki/${profile.slug}`}>Ваша страница на сайте →</Link> : "Профиль скрыт с сайта — его включает владелец"}
        </div>
        {admin && coaches.length > 0 && (
          <nav className="cchips" aria-label="Тренеры">
            {coaches.map((c) => (
              <Link key={c.id} href={`/coach?u=${c.id}`} className="vchip" aria-current={c.id === coachId ? "true" : undefined}>
                {c.name}
              </Link>
            ))}
          </nav>
        )}
        {pushPublicKey() && coachId === me.id && <PushToggle publicKey={pushPublicKey()} signedIn what="новые записи и отмены" />}
      </div>

      {!filled && (
        <div className="notice notice--muted" style={{ textAlign: "left" }}>
          Заполните профиль ниже: фото и пара слов о себе — с ними записываются в разы охотнее.
        </div>
      )}

      <section className="panel stack" style={{ gap: 16 }}>
        <h2 className="h3" style={{ margin: 0 }}>
          Расписание
        </h2>
        {upcoming.length ? (
          [...days.entries()].map(([k, list]) => (
            <div key={k} className="stack" style={{ gap: 10 }}>
              <div className="label">{fmtDay(list[0].startsAt)}</div>
              {list.map((sl) => (
                <SlotCard key={sl.id} sl={sl} />
              ))}
            </div>
          ))
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Тренировок пока нет — добавьте первую ниже.
          </p>
        )}
      </section>

      <section className="panel stack" style={{ gap: 16 }} id="new">
        <h2 className="h3" style={{ margin: 0 }}>
          Добавить тренировку
        </h2>
        {clubs.length ? (
          <SlotForm coachId={coachId} clubs={clubs.map((c) => ({ id: c.id, name: c.name, city: c.city }))} defaultClub={profile.clubIds[0] ?? clubs[0].id} />
        ) : (
          <p className="muted">Клубы ещё не добавлены — попросите владельца добавить их в админке.</p>
        )}
      </section>

      <section className="panel stack" style={{ gap: 16 }} id="profile">
        <h2 className="h3" style={{ margin: 0 }}>
          Профиль на сайте
        </h2>
        <ProfileForm
          coachId={coachId}
          clubs={clubs.map((c) => ({ id: c.id, name: c.name, city: c.city }))}
          p={{ displayName: profile.displayName, title: profile.title, about: profile.about, games: profile.games, photo: profile.photo, clubIds: profile.clubIds }}
        />
      </section>

      {past.length > 0 && (
        <section className="panel stack" style={{ gap: 12 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            Прошедшие за 30 дней
          </h2>
          {past.map((sl) => (
            <div key={sl.id} className="stack" style={{ gap: 6 }}>
              <div className="label">
                {fmtDay(sl.startsAt)}
                {sl.status === "CANCELLED" ? " · отменена" : ""}
              </div>
              <SlotCard sl={sl} past />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
