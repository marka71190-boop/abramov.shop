import { asc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { bannerState } from "@/lib/banners";
import { PLACE_LABEL, type BannerPlace } from "@/lib/banners-shared";
import { fmtDateTime, num } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";
import { moveBanner, toggleBanner } from "./actions";

export default async function BannersAdmin() {
  await requireAdmin();
  const all = await db.query.banner.findMany({ orderBy: [asc(s.banner.sortOrder), asc(s.banner.createdAt)] });
  const now = new Date();

  const group = (place: BannerPlace, hint: string) => {
    const list = all.filter((b) => b.place === place);
    const live = list.filter((b) => bannerState(b, now).key === "live").length;
    return (
      <section className="panel stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{PLACE_LABEL[place]}</h2>
            <div className="small muted">
              {hint} Сейчас показывается: {live}.
            </div>
          </div>
          <Link href={`/admin/banners/new?place=${place}`} className="btn btn--gold btn--sm">
            + Добавить
          </Link>
        </div>
        {list.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Порядок</th>
                  <th>Баннер</th>
                  <th>Показ</th>
                  <th>Переходы</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((b, i) => {
                  const st = bannerState(b, now);
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                          <form action={moveBanner.bind(null, b.id, -1)}>
                            <button className="btn btn--line btn--sm" disabled={i === 0} aria-label="Выше">
                              ↑
                            </button>
                          </form>
                          <form action={moveBanner.bind(null, b.id, 1)}>
                            <button className="btn btn--line btn--sm" disabled={i === list.length - 1} aria-label="Ниже">
                              ↓
                            </button>
                          </form>
                        </div>
                      </td>
                      <td>
                        <Link href={`/admin/banners/${b.id}`} className="row" style={{ gap: 10, alignItems: "center", textDecoration: "none" }}>
                          {b.image && <img src={b.image} alt="" style={{ width: 96, height: 32, objectFit: "cover", flex: "none" }} />}
                          <span>
                            {b.label && <span className="muted small">{b.label} · </span>}
                            {b.title || b.text.slice(0, 80) || "Без текста"}
                          </span>
                        </Link>
                        {b.url && <div className="muted small">{b.url}</div>}
                      </td>
                      <td className="small">
                        <span className={`pill ${st.key === "live" ? "pill--ok" : ""}`}>{st.label}</span>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {b.startsAt ? `с ${fmtDateTime(b.startsAt)}` : "сразу"}
                          {b.endsAt ? ` по ${fmtDateTime(b.endsAt)}` : ", без срока"}
                        </div>
                      </td>
                      <td className="small">{num(b.clicks)}</td>
                      <td>
                        <form action={toggleBanner.bind(null, b.id)}>
                          <button className="btn btn--line btn--sm">{b.isActive ? "Выключить" : "Включить"}</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            Пока пусто.
          </p>
        )}
      </section>
    );
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Баннеры</h1>
        <Link href="/" className="btn btn--line btn--sm" target="_blank">
          Посмотреть на сайте
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Акции, новинки и объявления вверху сайта. У каждого баннера можно задать время показа — он сам появится и сам исчезнет.
      </p>
      {group("HOME", "Большие слайды над первым экраном главной, листаются сами каждые 6 секунд.")}
      {group("STRIP", "Узкая строка над шапкой на всех страницах. Несколько объявлений сменяют друг друга, посетитель может скрыть их крестиком на неделю.")}
    </>
  );
}
