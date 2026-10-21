import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cueKey, defaultSelection, parseCueKey, resolveCue, visibleGroups } from "@/lib/cue-config";
import { rub } from "@/lib/format";
import { publicShowcase } from "@/lib/showcase";
import { getCueConfig } from "@/lib/cue";
import { og } from "@/lib/seo";
import { isAdmin, getViewer } from "@/lib/viewer";
import { CueBuilder } from "./CueBuilder";

const DESC = "Кий «Чемпион» на заказ: выберите породы дерева, длину, вес, отделку и гравировку — цена считается сразу. Делаем вручную в нашей мастерской.";

export const metadata: Metadata = {
  title: "Кий «Чемпион» на заказ",
  description: DESC,
  alternates: { canonical: "/cue" },
  openGraph: og({ url: "/cue", title: "Кий «Чемпион» на заказ — Abramov Shop", description: DESC }),
};

type Props = { searchParams: Promise<{ c?: string }> };

export default async function CuePage({ searchParams }: Props) {
  const [cfg, viewer, { c }, gallery] = await Promise.all([getCueConfig(), getViewer(), searchParams, publicShowcase()]);
  const admin = !!viewer && isAdmin(viewer);
  if (!cfg.enabled && !admin) notFound();

  // Ссылка из корзины (?c=…) открывает ту же сборку, если она ещё возможна
  const fromLink = c ? parseCueKey(c) : null;
  const initial = fromLink && typeof resolveCue(cfg, fromLink) !== "string" ? fromLink : defaultSelection(cfg);

  // Покупателю отдаём только то, что он может выбрать
  const pub = { ...cfg, groups: visibleGroups(cfg).map((g) => ({ ...g, options: g.options.filter((o) => !o.hidden) })) };

  return (
    <section className="container page-pad stack" style={{ gap: 28 }}>
      {!cfg.enabled && (
        <div className="notice" style={{ margin: 0 }}>
          Предпросмотр для администратора: конструктор выключен, покупатели эту страницу не видят. Включить — Админка → Кий на заказ.
        </div>
      )}
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Собственное производство</div>
        <h1 className="h2">{cfg.title}</h1>
        {cfg.intro && <p>{cfg.intro}</p>}
      </div>
      {gallery.length > 0 && (
        <div className="stack" style={{ gap: 16 }}>
          <h2 className="h3" style={{ margin: 0 }}>Готовые «Чемпионы»</h2>
          <div className="showcase">
            {gallery.map((g) => (
              <article key={g.id} className="showcase__card">
                <div className="showcase__photos">
                  {g.photos.map((u, i) => (
                    <img key={u + i} src={u} alt={i === 0 ? g.title : ""} loading="lazy" />
                  ))}
                </div>
                <div className="showcase__body">
                  <b>{g.title}</b>
                  {g.summary && <div className="muted small">{g.summary}</div>}
                  {g.description && <p className="small" style={{ margin: 0 }}>{g.description}</p>}
                  {g.spec.length > 0 && (
                    <details>
                      <summary>Все параметры</summary>
                      <div className="small" style={{ whiteSpace: "pre-line", marginTop: 6 }}>{g.spec.join("\n")}</div>
                    </details>
                  )}
                  {g.photos.length > 1 && <div className="muted small">Ещё {g.photos.length - 1} фото — листайте →</div>}
                  <div className="showcase__foot">
                    {g.price != null && <strong>{rub(g.price)}</strong>}
                    {g.key && (
                      <Link href={`/cue?c=${encodeURIComponent(g.key)}#builder`} className="btn btn--gold btn--sm" style={{ whiteSpace: "nowrap" }}>
                        Собрать такой же
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <h2 className="h3" style={{ margin: "12px 0 0" }}>Соберите свой</h2>
        </div>
      )}
      <div id="builder" style={{ scrollMarginTop: 90 }} />
      <CueBuilder key={cueKey(initial)} config={pub} initial={initial} admin={admin} />
    </section>
  );
}
