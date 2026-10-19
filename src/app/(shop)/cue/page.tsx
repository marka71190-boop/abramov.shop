import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { defaultSelection, parseCueKey, resolveCue, visibleGroups } from "@/lib/cue-config";
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
  const [cfg, viewer, { c }] = await Promise.all([getCueConfig(), getViewer(), searchParams]);
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
      <CueBuilder config={pub} initial={initial} />
    </section>
  );
}
