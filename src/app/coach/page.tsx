import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { PushToggle } from "@/components/pwa/PushToggle";
import { listClubs } from "@/lib/clubs";
import { prettyPhone, rub } from "@/lib/format";
import { pushPublicKey } from "@/lib/push";
import { addDays, BOOKING_LABEL, clientName, clientPhone, dayKey, dayStart, ensureCoachProfile, fmtDay, fmtTime, fmtWhen, hhmm, requireCoach } from "@/lib/trainings";
import { isAdmin } from "@/lib/viewer";
import { BookingSettingsForm, CancelSlot, DayOffForm, DiaryNote, HoursEditor, ManualForm, Mark, ProfileForm, RemoveDayOff, RequestActions, SlotForm } from "./forms";

type Props = { searchParams: Promise<{ u?: string; tab?: string; d?: string }> };

const TABS = [
  ["diary", "Дневник"],
  ["hours", "Рабочее время"],
  ["groups", "Групповые"],
  ["profile", "Профиль"],
] as const;

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const SOURCE_LABEL: Record<string, string> = { REQUEST: "заявка с сайта", MANUAL: "внесена вами", PUBLISHED: "групповая" };

const withPeople = { club: true, bookings: { with: { user: { columns: { name: true, phone: true, email: true } } } } } as const;

export default async function CoachPage({ searchParams }: Props) {
  const me = await requireCoach();
  const sp = await searchParams;
  const admin = isAdmin(me);
  // Админ может вести кабинет за любого тренера
  const coaches = admin ? await db.query.user.findMany({ where: eq(s.user.role, "COACH"), columns: { id: true, name: true }, orderBy: asc(s.user.name) }) : [];
  const coachId = admin ? (coaches.find((c) => c.id === sp.u)?.id ?? (me.role === "COACH" ? me.id : coaches[0]?.id)) : me.id;
  if (!coachId) {
    return (
      <div className="panel stack">
        <h1 className="h3">Тренеров пока нет</h1>
        <p className="muted">Выдайте роль «Тренер» в карточке клиента: Админка → Клиенты → роль.</p>
      </div>
    );
  }
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "diary";
  const today = dayKey(new Date());
  const day = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const q = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    if (admin && coachId !== me.id) u.set("u", coachId);
    for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
    const str = u.toString();
    return `/coach${str ? `?${str}` : ""}`;
  };

  const profile = await ensureCoachProfile(coachId);
  const clubs = (await listClubs()).map((c) => ({ id: c.id, name: c.name, city: c.city }));
  const defaultClub = profile.clubIds[0] ?? clubs[0]?.id ?? "";
  const filled = !!(profile.photo && profile.about.length > 30);

  // Заявки ждут ответа — видны на любой вкладке
  const requests = await db
    .select({ id: s.trainingBooking.id })
    .from(s.trainingBooking)
    .innerJoin(s.trainingSlot, eq(s.trainingSlot.id, s.trainingBooking.slotId))
    .where(and(eq(s.trainingSlot.coachId, coachId), eq(s.trainingBooking.status, "REQUESTED"), gte(s.trainingSlot.startsAt, new Date())));

  const header = (
    <div className="stack" style={{ gap: 10 }}>
      <h1 className="h2" style={{ margin: 0 }}>
        {profile.displayName}
      </h1>
      <div className="muted">
        {profile.isPublished ? <Link href={`/trenirovki/${profile.slug}`}>Ваша страница на сайте →</Link> : "Профиль скрыт с сайта — его включает владелец"}
      </div>
      {admin && coaches.length > 0 && (
        <nav className="cchips" aria-label="Тренеры">
          {coaches.map((c) => (
            <Link key={c.id} href={`/coach?u=${c.id}${tab !== "diary" ? `&tab=${tab}` : ""}`} className="vchip" aria-current={c.id === coachId ? "true" : undefined}>
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      {pushPublicKey() && coachId === me.id && <PushToggle publicKey={pushPublicKey()} signedIn what="новые заявки и отмены" />}
      <nav className="cchips coach-tabs" aria-label="Разделы">
        {TABS.map(([k, label]) => (
          <Link key={k} href={q({ tab: k === "diary" ? undefined : k })} className="vchip" aria-current={k === tab ? "page" : undefined}>
            {label}
            {k === "diary" && requests.length > 0 && <span className="coach-tabs__n">{requests.length}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );

  // ------------------------------------------------------------ Рабочее время
  if (tab === "hours") {
    const [hours, offs] = await Promise.all([
      db.select().from(s.coachHours).where(eq(s.coachHours.coachId, coachId)).orderBy(asc(s.coachHours.weekday), asc(s.coachHours.startMin)),
      db.select().from(s.coachDayOff).where(and(eq(s.coachDayOff.coachId, coachId), gte(s.coachDayOff.day, today))).orderBy(asc(s.coachDayOff.day)).limit(120),
    ]);
    return (
      <div className="stack" style={{ gap: 28 }}>
        {header}
        <section className="panel stack" style={{ gap: 16 }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="h3" style={{ margin: 0 }}>
              Когда вы свободны
            </h2>
            <p className="muted small" style={{ margin: 0 }}>
              Клиенты выбирают время внутри этих часов. Занятое тренировками время на сайте не показывается — сколько тренировок в день, решаете вы.
            </p>
          </div>
          {clubs.length ? (
            <HoursEditor coachId={coachId} clubs={clubs} defaultClub={defaultClub} initial={hours.map((h) => ({ weekday: h.weekday, clubId: h.clubId, start: hhmm(h.startMin), end: hhmm(h.endMin) }))} />
          ) : (
            <p className="muted">Клубы ещё не добавлены — попросите владельца добавить их в админке.</p>
          )}
        </section>
        <section className="panel stack" style={{ gap: 14 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            Выходные и отпуск
          </h2>
          <DayOffForm coachId={coachId} />
          {offs.length > 0 ? (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {offs.map((o) => (
                <span key={o.id} className="pill">
                  {fmtDay(dayStart(o.day))}
                  {o.note ? ` · ${o.note}` : ""} <RemoveDayOff id={o.id} />
                </span>
              ))}
            </div>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              Выходных не отмечено.
            </p>
          )}
        </section>
        <section className="panel stack" style={{ gap: 14 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            Запись и цена
          </h2>
          <BookingSettingsForm
            coachId={coachId}
            p={{ pricePerHour: profile.pricePerHour, durations: profile.durations, stepMin: profile.stepMin, leadHours: profile.leadHours, horizonDays: profile.horizonDays, autoConfirm: profile.autoConfirm, trial: profile.trial, trialDurationMin: profile.trialDurationMin }}
          />
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------ Групповые
  if (tab === "groups") {
    const groups = await db.query.trainingSlot.findMany({
      where: and(eq(s.trainingSlot.coachId, coachId), eq(s.trainingSlot.source, "PUBLISHED"), eq(s.trainingSlot.status, "OPEN"), gte(s.trainingSlot.startsAt, new Date(Date.now() - 3 * 3600_000))),
      with: withPeople,
      orderBy: asc(s.trainingSlot.startsAt),
      limit: 200,
    });
    return (
      <div className="stack" style={{ gap: 28 }}>
        {header}
        <section className="panel stack" style={{ gap: 16 }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="h3" style={{ margin: 0 }}>
              Новая групповая
            </h2>
            <p className="muted small" style={{ margin: 0 }}>
              Групповые видны в общем расписании на сайте, на них записываются сразу. Индивидуальные — через ваше свободное время.
            </p>
          </div>
          {clubs.length ? <SlotForm coachId={coachId} clubs={clubs} defaultClub={defaultClub} /> : <p className="muted">Клубов пока нет.</p>}
        </section>
        <section className="panel stack" style={{ gap: 12 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            Впереди
          </h2>
          {groups.length ? (
            groups.map((sl) => {
              const active = sl.bookings.filter((b) => b.status !== "CANCELLED" && b.status !== "DECLINED");
              return (
                <article key={sl.id} className="coach-slot">
                  <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <b>{fmtWhen(sl.startsAt)}</b> · {sl.durationMin} мин · {sl.title}
                      <div className="small muted">
                        {sl.club.name}, {sl.club.city} · {sl.price ? `${rub(sl.price)} с человека` : "бесплатно"}
                      </div>
                    </div>
                    <span className={`pill ${active.length >= sl.capacity ? "pill--ok" : ""}`}>
                      {active.length} из {sl.capacity}
                    </span>
                  </div>
                  {active.length > 0 && (
                    <ul className="coach-slot__people">
                      {active.map((b) => (
                        <li key={b.id}>
                          <Person b={b} />
                          {+sl.startsAt <= Date.now() && <Mark bookingId={b.id} status={b.status} />}
                        </li>
                      ))}
                    </ul>
                  )}
                  {+sl.startsAt > Date.now() && <CancelSlot slotId={sl.id} booked={active.length} />}
                </article>
              );
            })
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Групповых пока нет.
            </p>
          )}
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------ Профиль
  if (tab === "profile") {
    return (
      <div className="stack" style={{ gap: 28 }}>
        {header}
        <section className="panel stack" style={{ gap: 16 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            Профиль на сайте
          </h2>
          <ProfileForm
            coachId={coachId}
            clubs={clubs}
            p={{ displayName: profile.displayName, title: profile.title, about: profile.about, games: profile.games, photo: profile.photo, clubIds: profile.clubIds }}
          />
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------ Дневник
  const [pending, daySlots, hoursCount] = await Promise.all([
    requests.length
      ? db.query.trainingBooking.findMany({
          where: inArray(
            s.trainingBooking.id,
            requests.map((r) => r.id),
          ),
          with: { user: { columns: { name: true, phone: true, email: true } }, slot: { with: { club: true } } },
        })
      : Promise.resolve([]),
    db.query.trainingSlot.findMany({
      where: and(eq(s.trainingSlot.coachId, coachId), gte(s.trainingSlot.startsAt, dayStart(day)), lt(s.trainingSlot.startsAt, dayStart(addDays(day, 1)))),
      with: withPeople,
      orderBy: asc(s.trainingSlot.startsAt),
    }),
    db.select({ n: sql<number>`count(*)::int` }).from(s.coachHours).where(eq(s.coachHours.coachId, coachId)),
  ]);
  pending.sort((a, b) => +a.slot.startsAt - +b.slot.startsAt);

  // Полоса дней: неделя вокруг выбранного дня, с числом тренировок
  const weekFrom = addDays(day, -3);
  const strip = Array.from({ length: 10 }, (_, i) => addDays(weekFrom, i));
  const counts = await db
    .select({ d: sql<string>`to_char(${s.trainingSlot.startsAt} at time zone 'Europe/Moscow', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
    .from(s.trainingSlot)
    .where(and(eq(s.trainingSlot.coachId, coachId), eq(s.trainingSlot.status, "OPEN"), gte(s.trainingSlot.startsAt, dayStart(strip[0])), lt(s.trainingSlot.startsAt, dayStart(addDays(strip[strip.length - 1], 1)))))
    .groupBy(sql`1`);
  const countOf = new Map(counts.map((c) => [c.d, c.n]));
  const short = (k: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", weekday: "short", day: "numeric" }).format(dayStart(k));

  const open = daySlots.filter((sl) => sl.status === "OPEN");
  const cancelled = daySlots.filter((sl) => sl.status !== "OPEN");
  const paid = (sl: (typeof open)[number]) => sl.bookings.filter((b) => b.status === "BOOKED" || b.status === "ATTENDED").length;
  const dayMoney = open.reduce((n, sl) => n + sl.price * paid(sl), 0);

  return (
    <div className="stack" style={{ gap: 28 }}>
      {header}

      {!filled && (
        <div className="notice notice--muted" style={{ textAlign: "left" }}>
          Заполните <Link href={q({ tab: "profile" })}>профиль</Link>: фото и пара слов о себе — с ними записываются в разы охотнее.
        </div>
      )}
      {(hoursCount[0]?.n ?? 0) === 0 && (
        <div className="notice notice--muted" style={{ textAlign: "left" }}>
          Укажите <Link href={q({ tab: "hours" })}>рабочее время</Link> — тогда клиенты смогут выбрать свободное время и отправить заявку.
        </div>
      )}

      {pending.length > 0 && (
        <section className="panel stack coach-requests" style={{ gap: 12 }} id="requests">
          <h2 className="h3" style={{ margin: 0 }}>
            Заявки ждут ответа · {pending.length}
          </h2>
          {pending.map((b) => (
            <article key={b.id} className="coach-slot">
              <div>
                <b>{fmtWhen(b.slot.startsAt)}</b> · {b.slot.durationMin} мин · {b.slot.price ? rub(b.slot.price) : "бесплатно"}
                {b.slot.isTrial && <span className="pill pill--wait" style={{ marginLeft: 8 }}>Пробное</span>}
                <div className="small muted">
                  {b.slot.club.name}, {b.slot.club.city}
                </div>
              </div>
              <Person b={b} />
              <RequestActions bookingId={b.id} />
            </article>
          ))}
          <p className="small muted" style={{ margin: 0 }}>
            Если не ответить до начала, заявка закроется сама и клиент получит письмо.
          </p>
        </section>
      )}

      <section className="panel stack" style={{ gap: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <h2 className="h3" style={{ margin: 0 }}>
            {cap(fmtDay(dayStart(day)))}
          </h2>
          <div className="row small" style={{ gap: 14 }}>
            <Link href={q({ d: addDays(day, -7) })}>← неделя</Link>
            {day !== today && <Link href={q({})}>Сегодня</Link>}
            <Link href={q({ d: addDays(day, 7) })}>неделя →</Link>
          </div>
        </div>
        <nav className="day-strip" aria-label="Дни">
          {strip.map((k) => (
            <Link key={k} href={q({ d: k === today ? undefined : k })} className="day-strip__d" aria-current={k === day ? "date" : undefined} data-today={k === today || undefined}>
              <span>{short(k)}</span>
              <b>{countOf.get(k) ?? "·"}</b>
            </Link>
          ))}
        </nav>

        {open.length ? (
          <>
            <div className="small muted">
              Тренировок: {open.length}
              {dayMoney ? ` · на ${rub(dayMoney)}` : ""}
            </div>
            {open.map((sl) => {
              const people = sl.bookings.filter((b) => b.status !== "CANCELLED" && b.status !== "DECLINED");
              const started = +sl.startsAt <= Date.now();
              return (
                <article key={sl.id} className="coach-slot diary-item">
                  <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <b className="diary-item__time">
                        {fmtTime(sl.startsAt)}–{fmtTime(new Date(+sl.startsAt + sl.durationMin * 60_000))}
                      </b>{" "}
                      · {sl.kind === "GROUP" ? sl.title : `${sl.durationMin} мин`}
                      {sl.isTrial && <span className="pill pill--wait" style={{ marginLeft: 8 }}>Пробное</span>}
                      <div className="small muted">
                        {sl.club.name} · {sl.price ? rub(sl.price) : "бесплатно"} · {SOURCE_LABEL[sl.source] ?? ""}
                      </div>
                    </div>
                    {sl.kind === "GROUP" && (
                      <span className="pill">
                        {people.length} из {sl.capacity}
                      </span>
                    )}
                  </div>
                  {people.length > 0 ? (
                    <ul className="coach-slot__people">
                      {people.map((b) => (
                        <li key={b.id}>
                          <span className="stack" style={{ gap: 4 }}>
                            <Person b={b} />
                            <span className={`small ${b.status === "REQUESTED" ? "gold" : "muted"}`}>{BOOKING_LABEL[b.status]}</span>
                          </span>
                          {b.status === "REQUESTED" ? <RequestActions bookingId={b.id} /> : started ? <Mark bookingId={b.id} status={b.status} /> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="small muted">Пока никто не записался</div>
                  )}
                  {sl.note && <div className="small muted">{sl.note}</div>}
                  <DiaryNote slotId={sl.id} text={sl.diary ?? ""} />
                  {!started && <CancelSlot slotId={sl.id} booked={people.length} />}
                </article>
              );
            })}
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            В этот день тренировок нет.
          </p>
        )}
        {cancelled.length > 0 && (
          <details className="small muted">
            <summary>Отменено в этот день: {cancelled.length}</summary>
            <ul>
              {cancelled.map((sl) => (
                <li key={sl.id}>
                  {fmtTime(sl.startsAt)} · {sl.bookings.map((b) => clientName(b)).join(", ") || sl.title}
                  {sl.cancelReason ? ` — ${sl.cancelReason}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="panel stack" style={{ gap: 14 }} id="add">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            Внести тренировку на {fmtDay(dayStart(day))}
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            Договорились по телефону или в клубе — запишите сюда, это время уйдёт из свободного на сайте. Клиент с сайта увидит тренировку в личном кабинете.
          </p>
        </div>
        {clubs.length ? (
          <ManualForm coachId={coachId} day={day} clubs={clubs} defaultClub={defaultClub} durations={profile.durations} pricePerHour={profile.pricePerHour} />
        ) : (
          <p className="muted">Клубов пока нет.</p>
        )}
      </section>
    </div>
  );
}

function Person({ b }: { b: { user?: { name: string; phone: string | null; email: string } | null; guestName?: string | null; guestPhone?: string | null; comment?: string | null } }) {
  const phone = clientPhone(b);
  return (
    <span>
      {clientName(b)}
      {!b.user && <span className="muted small"> (не с сайта)</span>}
      <span className="muted small">
        {phone ? (
          <>
            {" · "}
            <a href={`tel:${phone}`}>{prettyPhone(phone)}</a>
          </>
        ) : b.user?.email ? (
          ` · ${b.user.email}`
        ) : null}
      </span>
      {b.comment && <div className="small muted">«{b.comment}»</div>}
    </span>
  );
}
