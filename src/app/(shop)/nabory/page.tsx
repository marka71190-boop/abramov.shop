import type { Metadata } from "next";
import Link from "next/link";
import { activeBundles, bundleCards, LEVELS } from "@/lib/bundles";
import { SITE } from "@/lib/site";
import { SetCard } from "./SetCard";

export const metadata: Metadata = {
  title: "Наборы и подарки бильярдисту",
  description: "Готовые наборы для русского бильярда со скидкой: кий, чехол, мел, наклейки и аксессуары. Подарок новичку, игроку и профи — подберите по бюджету.",
  alternates: { canonical: "/nabory" },
};
export const revalidate = 300;

const BUDGETS = [
  { key: "5", label: "до 5 000 ₽", min: 0, max: 5_000_00 },
  { key: "15", label: "5–15 тыс. ₽", min: 5_000_00, max: 15_000_00 },
  { key: "40", label: "15–40 тыс. ₽", min: 15_000_00, max: 40_000_00 },
  { key: "max", label: "от 40 тыс. ₽", min: 40_000_00, max: Infinity },
];

export default async function SetsPage({ searchParams }: { searchParams: Promise<{ b?: string; l?: string }> }) {
  const sp = await searchParams;
  const all = await bundleCards((await activeBundles()).filter((b) => b.showcase));
  const budget = BUDGETS.find((x) => x.key === sp.b);
  const level = sp.l && LEVELS[sp.l] ? sp.l : null;
  const sets = all.filter((b) => (!budget || (b.price >= budget.min && b.price < budget.max)) && (!level || !b.level || b.level === level));
  const href = (p: { b?: string | null; l?: string | null }) => {
    const u = new URLSearchParams();
    const b = p.b === undefined ? budget?.key : p.b;
    const l = p.l === undefined ? level : p.l;
    if (b) u.set("b", b);
    if (l) u.set("l", l);
    const q = u.toString();
    return `/nabory${q ? `?${q}` : ""}`;
  };
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Наборы для русского бильярда",
    itemListElement: all.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: `${SITE.url}/nabory#${b.id}` })),
  };

  return (
    <section className="container page-pad stack" style={{ gap: 32 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div className="stack" style={{ gap: 14, maxWidth: 760 }}>
        <div className="eyebrow">Наборы</div>
        <h1 className="h2" style={{ margin: 0 }}>
          Наборы и <span className="gold">подарки бильярдисту</span>
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 17 }}>
          Собрали вместе то, что покупают вместе, — и дешевле, чем по отдельности. Одна кнопка — и весь набор в корзине. Не знаете, что выбрать в подарок? Есть{" "}
          <Link href="/gift">подарочный сертификат</Link>.
        </p>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <nav className="row" style={{ gap: 8, flexWrap: "wrap" }} aria-label="Бюджет">
          <Link href={href({ b: null })} className={`btn btn--sm ${!budget ? "btn--gold" : "btn--line"}`}>
            Любой бюджет
          </Link>
          {BUDGETS.map((x) => (
            <Link key={x.key} href={href({ b: x.key })} className={`btn btn--sm ${budget?.key === x.key ? "btn--gold" : "btn--line"}`}>
              {x.label}
            </Link>
          ))}
        </nav>
        <nav className="row" style={{ gap: 8, flexWrap: "wrap" }} aria-label="Для кого">
          <Link href={href({ l: null })} className={`btn btn--sm ${!level ? "btn--gold" : "btn--line"}`}>
            Для всех
          </Link>
          {Object.entries(LEVELS).map(([k, v]) => (
            <Link key={k} href={href({ l: k })} className={`btn btn--sm ${level === k ? "btn--gold" : "btn--line"}`}>
              {v}
            </Link>
          ))}
        </nav>
      </div>

      {sets.length ? (
        <div className="set-grid">
          {sets.map((b) => (
            <div key={b.id} id={b.id}>
              <SetCard set={b} level={b.level ? LEVELS[b.level] : null} />
            </div>
          ))}
        </div>
      ) : (
        <div className="notice notice--muted">
          {all.length ? (
            <>
              Под эти условия наборов нет. <Link href="/nabory">Показать все наборы</Link> или выберите <Link href="/gift">подарочный сертификат</Link> на любую сумму.
            </>
          ) : (
            <>
              Наборы скоро появятся. А пока — <Link href="/gift">подарочный сертификат</Link> на любую сумму или <Link href="/podbor-kiya">подбор кия за минуту</Link>.
            </>
          )}
        </div>
      )}

      <p className="small muted" style={{ margin: 0 }}>
        Вариант товара (цвет, размер, вес) можно поменять в корзине — скидка набора сохранится, пока в корзине все его товары.
      </p>
    </section>
  );
}
