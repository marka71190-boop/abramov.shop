import type { Metadata } from "next";
import Link from "next/link";
import { clubLines, lowAt } from "@/lib/club-low";
import { stockClubs } from "@/lib/club-stock";
import { isDirector, requireAdmin } from "@/lib/viewer";
import { DigestButton, NormsForm, RefillForm } from "./RefillForms";

export const metadata: Metadata = { title: "Пополнить клуб" };
export const dynamic = "force-dynamic";

/** Заканчивается в клубе → перемещение со склада; нормы клуба */
export default async function RefillPage({ searchParams }: { searchParams: Promise<{ club?: string; m?: string }> }) {
  const me = await requireAdmin();
  const clubs = (await stockClubs()).filter((c) => c.ownStock);
  const sp = await searchParams;
  const club = clubs.find((c) => c.id === sp.club) ?? clubs[0];
  const lines = club ? await clubLines(club.id) : [];
  const low = lines.filter((l) => l.low);
  // «До нормы» — всё, чего меньше нормы (недельное пополнение), а не только то, что уже на исходе
  const norm = lines.filter((l) => l.low || l.short);
  const byNorm = sp.m === "norm";
  const list = byNorm ? norm : low;
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
                <Link key={c.id} href={`/admin/stock/refill?club=${c.id}${byNorm ? "&m=norm" : ""}`} className={`btn btn--sm ${c.id === club.id ? "btn--gold" : "btn--line"}`}>
                  {c.title}
                </Link>
              ))}
            </div>
          )}
          <section className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <Link href={`/admin/stock/refill?club=${club.id}`} className={`btn btn--sm ${byNorm ? "btn--line" : "btn--gold"}`}>
                Заканчивается{low.length ? ` · ${low.length}` : ""}
              </Link>
              <Link href={`/admin/stock/refill?club=${club.id}&m=norm`} className={`btn btn--sm ${byNorm ? "btn--gold" : "btn--line"}`}>
                Всё до нормы{norm.length ? ` · ${norm.length}` : ""}
              </Link>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              {byNorm
                ? "Недельное пополнение: всё, чего в клубе меньше нормы. По понедельникам в 10:00 этот список сам приходит в Telegram и на телефон с кнопкой «Собрать»."
                : "Срочное: осталась половина нормы или товар закончился."}
            </p>
            {byNorm && !ro && <DigestButton />}
            {/* Форма остаётся и при пустом списке: после перемещения в ней кнопка «Этикетки на привезённое» */}
            <RefillForm
              key={byNorm ? "norm" : "low"}
              clubId={club.id}
              lines={list}
              readonly={ro}
              empty={byNorm ? "В клубе всё по норме — везти нечего." : "В клубе всего хватает. Сообщение придёт само, когда останется половина нормы или товар закончится."}
            />
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
