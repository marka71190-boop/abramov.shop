import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { listClubs } from "@/lib/clubs";
import { freeTimes, myBookings, TRIAL_LABEL, trialAvailable, trialPrice, upcomingSlots } from "@/lib/trainings";
import { getViewer, isAdmin } from "@/lib/viewer";
import { BookingPicker } from "../BookingPicker";
import { Schedule } from "../Schedule";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ trial?: string }> };

async function load(slug: string) {
  const p = await db.query.coachProfile.findFirst({ where: eq(s.coachProfile.slug, slug), with: { user: { columns: { role: true } } } });
  return p && p.user.role === "COACH" ? p : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return {};
  return {
    title: `${p.displayName} — тренер по бильярду`,
    description: (p.title ? `${p.title}. ` : "") + (p.about.slice(0, 140) || "Тренировки по бильярду в клубах Abramov. Запись онлайн."),
    alternates: { canonical: `/trenirovki/${p.slug}` },
    ...(p.isPublished ? {} : { robots: { index: false } }),
  };
}

export default async function CoachPublicPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const wantTrial = (await searchParams).trial === "1";
  const [p, viewer] = await Promise.all([load(slug), getViewer()]);
  if (!p || (!p.isPublished && !isAdmin(viewer) && viewer?.id !== p.userId)) notFound();
  const [slots, clubs, mine, ft] = await Promise.all([upcomingSlots({ coachId: p.userId }), listClubs(), viewer ? myBookings(viewer.id) : Promise.resolve([]), freeTimes(p.userId)]);
  const mineMap = new Map(mine.filter((b) => b.status === "BOOKED").map((b) => [b.slotId, b.id]));
  const where = clubs.filter((c) => p.clubIds.includes(c.id) || ft.free[c.id]);
  const hasFree = Object.keys(ft.free).length > 0;
  // Пробное: тренер проводит и клиент у него ещё не занимался (гостю показываем — проверим после входа)
  const trialOn = p.trial === "FREE" || p.trial === "HALF";
  const trialOk = trialOn && (!viewer || (viewer.id !== p.userId && (await trialAvailable(viewer.id, p.userId))));
  const trial = trialOk ? { kind: p.trial as "FREE" | "HALF", durationMin: p.trialDurationMin, price: trialPrice(p) ?? 0 } : null;
  return (
    <section className="container page-pad stack" style={{ gap: 40 }}>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/trenirovki">← Все тренировки</Link>
      </p>
      <div className="coach-hero">
        <div className="coach-hero__photo">{p.photo ? <img src={p.photo} alt={p.displayName} /> : <span aria-hidden>{p.displayName[0]}</span>}</div>
        <div className="stack" style={{ gap: 12 }}>
          <div className="eyebrow">Тренер</div>
          <h1 className="h2" style={{ margin: 0 }}>
            {p.displayName}
          </h1>
          {p.title && <div className="gold">{p.title}</div>}
          <div className="small muted">
            {p.games}
            {where.length ? ` · ${where.map((c) => `${c.name}, ${c.city}`).join(" · ")}` : ""}
          </div>
          {p.about && (
            <p style={{ margin: 0, whiteSpace: "pre-line", maxWidth: 680 }} className="muted">
              {p.about}
            </p>
          )}
          {(hasFree || slots.length > 0) && (
            <div className="row" style={{ gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              {trial && hasFree && (
                <Link href={`/trenirovki/${p.slug}?trial=1#book`} scroll={false} className="btn btn--gold btn--cut">
                  Пробное занятие — {TRIAL_LABEL[p.trial]}
                </Link>
              )}
              <a href={hasFree ? "#book" : "#groups"} className={`btn btn--cut ${trial && hasFree ? "btn--line" : "btn--gold"}`}>
                Выбрать время
              </a>
              <span className="small muted">
                {p.pricePerHour ? `${(p.pricePerHour / 100).toLocaleString("ru-RU")} ₽ за час · ` : ""}оплата в клубе
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }} id="book">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            Индивидуальная тренировка
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            Показано только свободное время. Выберите день и час — тренер получит заявку и подтвердит её.
          </p>
        </div>
        <BookingPicker
          coachId={p.userId}
          coachName={p.displayName}
          free={ft.free}
          days={ft.days}
          clubs={clubs.map((c) => ({ id: c.id, name: c.name, city: c.city, address: c.address }))}
          durations={p.durations}
          pricePerHour={p.pricePerHour}
          autoConfirm={p.autoConfirm}
          signedIn={!!viewer}
          hasPhone={!!viewer?.phone}
          next={`/trenirovki/${p.slug}${wantTrial ? "?trial=1" : ""}#book`}
          trial={trial}
          initialTrial={wantTrial}
          key={wantTrial ? "trial" : "plain"}
        />
      </div>
      {slots.length > 0 && (
        <div className="stack" style={{ gap: 16 }} id="groups">
          <h2 className="h3" style={{ margin: 0 }}>
            Групповые тренировки
          </h2>
          <Schedule slots={slots} signedIn={!!viewer} next={`/trenirovki/${p.slug}#groups`} mine={mineMap} showCoach={false} />
        </div>
      )}
    </section>
  );
}
