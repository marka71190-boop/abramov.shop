import type { Metadata } from "next";
import Link from "next/link";
import { listClubs } from "@/lib/clubs";
import { CANCEL_HOURS, myBookings, publicCoaches, upcomingSlots } from "@/lib/trainings";
import { getViewer } from "@/lib/viewer";
import { Schedule } from "./Schedule";

export const metadata: Metadata = {
  title: "Тренировки по бильярду в клубах",
  description: "Индивидуальные и групповые тренировки по русскому бильярду с тренерами Abramov в Краснодаре, Ростове-на-Дону и Аксае. Запись онлайн, оплата в клубе.",
  alternates: { canonical: "/trenirovki" },
};

type Props = { searchParams: Promise<{ club?: string }> };

export default async function TrainingsPage({ searchParams }: Props) {
  const { club: clubParam } = await searchParams;
  const [viewer, clubs, coaches] = await Promise.all([getViewer(), listClubs(), publicCoaches()]);
  const club = clubs.find((c) => c.id === clubParam) ?? null;
  const [slots, mine] = await Promise.all([upcomingSlots({ clubId: club?.id }), viewer ? myBookings(viewer.id) : Promise.resolve([])]);
  const mineMap = new Map(mine.filter((b) => b.status === "BOOKED").map((b) => [b.slotId, b.id]));
  const shownCoaches = club ? coaches.filter((c) => c.clubIds.includes(club.id)) : coaches;
  const clubsWithSlots = new Set(slots.map((x) => x.club.id));

  return (
    <section className="container page-pad stack" style={{ gap: 40 }}>
      <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
        <div className="eyebrow">Тренировки</div>
        <h1 className="h2" style={{ margin: 0 }}>
          Тренировки по бильярду <span className="gold">в наших клубах</span>
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 17 }}>
          Индивидуальные и групповые занятия с тренерами. Выберите время — запись онлайн, оплата в клубе после тренировки. Накануне пришлём напоминание.
        </p>
      </div>

      {clubs.length > 1 && (
        <nav className="row" style={{ gap: 8, flexWrap: "wrap" }} aria-label="Клубы">
          <Link href="/trenirovki" className={`btn btn--sm ${!club ? "btn--gold" : "btn--line"}`}>
            Все клубы
          </Link>
          {clubs.map((c) => (
            <Link key={c.id} href={`/trenirovki?club=${c.id}`} className={`btn btn--sm ${club?.id === c.id ? "btn--gold" : "btn--line"}`}>
              {c.name} · {c.city}
            </Link>
          ))}
        </nav>
      )}

      {shownCoaches.length > 0 && (
        <div className="stack" style={{ gap: 16 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            Тренеры
          </h2>
          <div className="coach-grid">
            {shownCoaches.map((c) => (
              <Link key={c.userId} href={`/trenirovki/${c.slug}`} className="coach-card">
                <div className="coach-card__photo">{c.photo ? <img src={c.photo} alt={c.displayName} loading="lazy" /> : <span aria-hidden>{c.displayName[0]}</span>}</div>
                <b>{c.displayName}</b>
                {c.title && <span className="small muted">{c.title}</span>}
                <span className="small">{c.games}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="stack" style={{ gap: 16 }} id="schedule">
        <h2 className="h3" style={{ margin: 0 }}>
          Расписание{club ? ` · ${club.name}` : ""}
        </h2>
        {slots.length ? (
          <Schedule slots={slots} signedIn={!!viewer} next={club ? `/trenirovki?club=${club.id}` : "/trenirovki"} mine={mineMap} />
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {club && clubs.some((c) => clubsWithSlots.has(c.id)) ? "В этом клубе пока нет свободных тренировок — посмотрите другие клубы." : "Расписание скоро появится. Загляните чуть позже или спросите в клубе."}
          </p>
        )}
      </div>

      <div className="steps-3">
        <div>
          <b>1. Выберите время</b>
          <span className="muted small">Индивидуально — с тренером один на один, в группе — до нескольких человек за столом.</span>
        </div>
        <div>
          <b>2. Запишитесь</b>
          <span className="muted small">Подтверждение придёт на почту, напоминание — накануне. Отменить можно не позже чем за {CANCEL_HOURS} ч до начала.</span>
        </div>
        <div>
          <b>3. Приходите в клуб</b>
          <span className="muted small">Кий можно взять клубный или свой. Оплата — в клубе после тренировки.</span>
        </div>
      </div>
    </section>
  );
}
