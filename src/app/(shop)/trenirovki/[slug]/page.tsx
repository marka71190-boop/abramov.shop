import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { listClubs } from "@/lib/clubs";
import { myBookings, upcomingSlots } from "@/lib/trainings";
import { getViewer, isAdmin } from "@/lib/viewer";
import { Schedule } from "../Schedule";

type Props = { params: Promise<{ slug: string }> };

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

export default async function CoachPublicPage({ params }: Props) {
  const { slug } = await params;
  const [p, viewer] = await Promise.all([load(slug), getViewer()]);
  if (!p || (!p.isPublished && !isAdmin(viewer) && viewer?.id !== p.userId)) notFound();
  const [slots, clubs, mine] = await Promise.all([upcomingSlots({ coachId: p.userId }), listClubs(), viewer ? myBookings(viewer.id) : Promise.resolve([])]);
  const mineMap = new Map(mine.filter((b) => b.status === "BOOKED").map((b) => [b.slotId, b.id]));
  const where = clubs.filter((c) => p.clubIds.includes(c.id));
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
          {slots.length > 0 && (
            <div>
              <a href="#schedule" className="btn btn--gold btn--cut">
                Записаться
              </a>
            </div>
          )}
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }} id="schedule">
        <h2 className="h3" style={{ margin: 0 }}>
          Свободное время
        </h2>
        {slots.length ? (
          <Schedule slots={slots} signedIn={!!viewer} next={`/trenirovki/${p.slug}`} mine={mineMap} showCoach={false} />
        ) : (
          <p className="muted">Свободного времени пока нет — загляните позже.</p>
        )}
      </div>
    </section>
  );
}
