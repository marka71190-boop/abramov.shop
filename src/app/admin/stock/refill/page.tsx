import type { Metadata } from "next";
import Link from "next/link";
import { clubLines, lowAt } from "@/lib/club-low";
import { stockClubs } from "@/lib/club-stock";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { NormsForm, RefillForm } from "./RefillForms";

export const metadata: Metadata = { title: "Пополнить клуб" };
export const dynamic = "force-dynamic";

/** Заканчивается в клубе → перемещение со склада; нормы клуба */
export default async function RefillPage({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  const me = await requireAdmin();
  const clubs = (await stockClubs()).filter((c) => c.ownStock);
  const sp = await searchParams;
  const club = clubs.find((c) => c.id === sp.club) ?? clubs[0];
  const lines = club ? await clubLines(club.id) : [];
  const low = lines.filter((l) => l.low);
  const ro = isDirector(me);

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/stock/clubs">← Остатки по клубам</Link>
      </p>
      <h1>Пополнить клуб</h1>
      {!club ? (
        <div className="notice">
          Нет клубов со своим учётом остатков — включите его в <Link href="/admin/stock/clubs">«Остатки по клубам»</Link>.
        </div>
      ) : (
        <>
          {clubs.length > 1 && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {clubs.map((c) => (
                <Link key={c.id} href={`/admin/stock/refill?club=${c.id}`} className={`btn btn--sm ${c.id === club.id ? "btn--gold" : "btn--line"}`}>
                  {c.title}
                </Link>
              ))}
            </div>
          )}
          <section className="stack" style={{ gap: 10 }}>
            <h2 className="h4" style={{ margin: 0 }}>
              Заканчивается{low.length ? ` · ${low.length}` : ""}
            </h2>
            {low.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                В клубе всего хватает. Сообщение придёт само, когда останется половина нормы или товар закончится.
              </p>
            ) : (
              <RefillForm clubId={club.id} lines={low} readonly={ro} />
            )}
          </section>
          <section className="stack" style={{ gap: 10 }}>
            <h2 className="h4" style={{ margin: 0 }}>
              Нормы клуба
            </h2>
            <p className="muted small" style={{ margin: 0 }}>
              Сколько держать на полке. Осталась половина — придёт сообщение в Telegram и на телефон с кнопкой «Пополнить со склада». Без нормы — сообщим, когда товар
              закончится. Например, норма 6 — напомним при {lowAt(6)} шт и предложим привезти до 6.
            </p>
            <NormsForm clubId={club.id} lines={lines} readonly={ro} />
          </section>
        </>
      )}
    </>
  );
}
