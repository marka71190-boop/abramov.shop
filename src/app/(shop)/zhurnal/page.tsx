import type { Metadata } from "next";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { articleDate, publicArticles } from "@/lib/journal";
import { readMinutes, SECTIONS } from "@/lib/journal-shared";
import { og } from "@/lib/seo";

const DESC = "Журнал Abramov Shop: как выбрать кий для русского бильярда, уход за кием и наклейкой, советы по игре и открытию бильярдного клуба.";

export const metadata: Metadata = {
  title: "Журнал: статьи и советы о бильярде",
  description: DESC,
  alternates: { canonical: "/zhurnal" },
  openGraph: og({ url: "/zhurnal", title: "Журнал Abramov Shop", description: DESC }),
};

type Props = { searchParams: Promise<{ r?: string }> };

export default async function JournalPage({ searchParams }: Props) {
  const { r } = await searchParams;
  const section = r && r in SECTIONS ? r : undefined;
  const [all, list] = await Promise.all([publicArticles(), publicArticles(section)]);
  const used = Object.entries(SECTIONS).filter(([k]) => all.some((a) => a.section === k));
  const [first, ...rest] = list;
  return (
    <section className="container section" style={{ paddingTop: "clamp(32px, 5vw, 64px)" }}>
      <div className="quiz-head">
        <div className="label gold">Журнал</div>
        <h1 className="h2">Статьи и советы</h1>
        <p className="muted" style={{ maxWidth: 680, margin: 0 }}>
          Как выбрать кий, ухаживать за ним и наклейкой, играть увереннее и открыть свой бильярдный клуб.
        </p>
      </div>
      {used.length > 1 && (
        <nav className="cchips" aria-label="Разделы журнала">
          <Link href="/zhurnal" className="vchip" aria-current={!section ? "true" : undefined}>
            Все
          </Link>
          {used.map(([k, label]) => (
            <Link key={k} href={`/zhurnal?r=${k}`} className="vchip" aria-current={section === k ? "true" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      )}
      {!list.length && <p className="muted">Скоро здесь появятся первые статьи.</p>}
      {first && (
        <Link href={`/zhurnal/${first.slug}`} className="jcard jcard--lead">
          <div className="jcard__img">{first.cover ? <img src={first.cover} alt="" /> : <span className="ph" />}</div>
          <div className="jcard__body">
            <span className="label gold">{SECTIONS[first.section] ?? "Статья"}</span>
            <h2 className="h3">{first.title}</h2>
            {first.excerpt && <p className="muted">{first.excerpt}</p>}
            <span className="small muted">
              {fmtDate(articleDate(first))} · {readMinutes(first.body)} мин чтения
            </span>
          </div>
        </Link>
      )}
      {rest.length > 0 && (
        <div className="jgrid">
          {rest.map((a) => (
            <Link key={a.id} href={`/zhurnal/${a.slug}`} className="jcard">
              <div className="jcard__img">{a.cover ? <img src={a.cover} alt="" loading="lazy" /> : <span className="ph" />}</div>
              <div className="jcard__body">
                <span className="label gold">{SECTIONS[a.section] ?? "Статья"}</span>
                <b className="jcard__title">{a.title}</b>
                {a.excerpt && <p className="small muted">{a.excerpt}</p>}
                <span className="small muted">
                  {fmtDate(articleDate(a))} · {readMinutes(a.body)} мин
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
