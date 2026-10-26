import Link from "next/link";
import { KeepBeta } from "@/components/RichText";
import { IconArrow, IconArrowUpRight, IconCard, IconStar, IconTelegram, IconTruck } from "@/components/Icons";
import { Logo } from "@/components/Logo";
import { ProductCard } from "@/components/product/ProductCard";
import { Stars } from "@/components/product/Stars";
import { getFeaturedLimited, getPublicCategories } from "@/lib/catalog";
import { getHits, getLatestReviews, getNewArrivals } from "@/lib/catalog-search";
import { num, rub } from "@/lib/format";
import { favoriteIds, ratingsFor, shortName } from "@/lib/reviews";
import { getSettings } from "@/lib/settings";
import { getHomeContent } from "@/lib/home-content";
import { activeBanners } from "@/lib/banners";
import { PromoSlider } from "@/components/banners/PromoSlider";
import { getViewer } from "@/lib/viewer";
import { ldJson } from "@/lib/seo";
import { SITE } from "@/lib/site";

type Card = Awaited<ReturnType<typeof getNewArrivals>>[number];

/** Текст из админки: переносы строк — как в поле */
function Lines({ text }: { text: string }) {
  const parts = text.split("\n");
  return (
    <>
      {parts.map((line, i) => (
        <span key={i}>
          {line}
          {i < parts.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function Rail({
  id,
  title,
  items,
  ratings,
  favs,
}: {
  id: string;
  title: string;
  items: Card[];
  ratings: Awaited<ReturnType<typeof ratingsFor>>;
  favs: Set<string>;
}) {
  return (
    <section id={id} className="container section section--tight">
      <div className="section-head">
        <h2 className="h2">{title}</h2>
        <Link href="/catalog" className="link-caps">
          Весь каталог <IconArrow size={16} />
        </Link>
      </div>
      <div className="products products--rail">
        {items.map((p) => (
          <ProductCard key={p.id} p={p} rating={ratings.get(p.id)} favorite={favs.has(p.id)} />
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const [categories, drop, settings, hits, fresh, reviews, viewer, home, slides] = await Promise.all([
    getPublicCategories(),
    getFeaturedLimited(),
    getSettings(),
    getHits(),
    getNewArrivals(),
    getLatestReviews(),
    getViewer(),
    getHomeContent(),
    activeBanners("HOME"),
  ]);
  // Новинки не повторяют хиты
  const hitIds = new Set(hits.map((p) => p.id));
  const newOnes = fresh.filter((p) => !hitIds.has(p.id)).slice(0, 8);
  const [ratings, favs] = await Promise.all([
    ratingsFor([...hits, ...newOnes].map((p) => p.id)),
    viewer ? favoriteIds(viewer.id) : Promise.resolve(new Set<string>()),
  ]);
  const { tiers, referralBonus, birthdayBonus } = settings.loyalty;

  return (
    <>
      {slides.length > 0 && <PromoSlider slides={slides} />}
      <section id="top" className="hero">
        <div className="container hero__grid">
          <div className="hero__copy">
            <div className="eyebrow">{home.heroEyebrow}</div>
            <h1 className="h1">
              <Lines text={home.heroTitle} />
              <br />
              <span className="gold">{home.heroAccent}</span>
            </h1>
            <p className="hero__lead">{home.heroLead}</p>
            <div className="hero__actions">
              <Link href="#catalog" className="btn btn--gold btn--cut">
                {home.heroButton} <IconArrow size={18} />
              </Link>
              <Link href="#bonus" className="btn btn--line">
                {home.heroButton2}
              </Link>
            </div>
          </div>
          <div className="hero__art">
            <div className="stripe stripe--gold" aria-hidden />
            <div className="stripe stripe--silver" aria-hidden />
            <Logo id="hero" animated title="Логотип Abramov" />
          </div>
        </div>
        <div className="container features">
          <div className="feature">
            <IconTruck size={28} />
            <div>
              <div className="feature__title">{home.feat1Title}</div>
              <div className="feature__text">{home.feat1Text}</div>
            </div>
          </div>
          <div className="feature">
            <IconCard size={28} />
            <div>
              <div className="feature__title">{home.feat2Title}</div>
              <div className="feature__text">{home.feat2Text}</div>
            </div>
          </div>
          <div className="feature">
            <IconStar size={28} />
            <div>
              <div className="feature__title">{home.feat3Title}</div>
              <div className="feature__text">{home.feat3Text}</div>
            </div>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section id="catalog" className="container section">
          <div className="section-head">
            <h2 className="h2">{home.catalogTitle}</h2>
            <Link href="/catalog" className="link-caps">
              Все товары <IconArrow size={16} />
            </Link>
          </div>
          <div className="cats">
            {categories.map((c, i) => (
              <Link key={c.id} href={`/catalog/${c.slug}`} className="cat">
                {c.image && <img className="cat__img" src={c.image} alt="" />}
                <span className="cat__num">{String(i + 1).padStart(2, "0")}</span>
                <span className="cat__row">
                  <span className="cat__name">{c.name}</span>
                  <span className="cat__arrow">
                    <IconArrowUpRight size={18} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {hits.length > 0 && <Rail id="hits" title={home.hitsTitle} items={hits} ratings={ratings} favs={favs} />}
      {newOnes.length >= 2 && <Rail id="new" title={home.newTitle} items={newOnes} ratings={ratings} favs={favs} />}

      {drop && (
        <section id="drop" className="container section">
          <div className="drop">
            <div className="drop__media">
              {drop.image && <img src={drop.image.url} alt={drop.image.alt} />}
              <span className="tag">Limited</span>
            </div>
            <div className="drop__body">
              <div className="eyebrow">{home.dropEyebrow}</div>
              <h2 className="h2" style={{ fontSize: "clamp(34px, 4vw, 56px)" }}>
                <KeepBeta text={drop.name} />
              </h2>
              <p className="muted">{drop.description}</p>
              {drop.limitedTotal ? (
                <div className="meter">
                  <div className="meter__row">
                    <span className="muted">Осталось</span>
                    <strong>
                      {num(drop.stock)} из {num(drop.limitedTotal)}
                    </strong>
                  </div>
                  <div className="meter__bar">
                    <div
                      className="meter__fill"
                      style={{
                        width: `${Math.min(100, (drop.stock / drop.limitedTotal) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
              <div className="price-big">{rub(drop.price)}</div>
              <Link href={`/product/${drop.slug}`} className="btn btn--gold btn--block">
                Подробнее и купить
              </Link>
            </div>
          </div>
        </section>
      )}

      {reviews.length >= 2 && (
        <section id="reviews" className="container section section--tight">
          <div className="section-head">
            <h2 className="h2">{home.reviewsTitle}</h2>
            <p>{home.reviewsText}</p>
          </div>
          <div className="hreviews">
            {reviews.map((r) => (
              <figure key={r.id} className="hreview">
                <Stars value={r.rating} size={16} />
                <blockquote>{r.text.length > 280 ? `${r.text.slice(0, 277).trimEnd()}…` : r.text}</blockquote>
                <figcaption className="small">
                  <span>{shortName(r.userName)}</span>
                  <Link href={`/product/${r.productSlug}`} className="muted">
                    {r.productName}
                  </Link>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section id="bonus" className="container section">
        <div className="section-head">
          <h2 className="h2">
            <Lines text={home.bonusTitle} />
          </h2>
          <p>{home.bonusText.replace(/\{процент\}/g, String(settings.loyalty.maxSpendPercent))}</p>
        </div>
        <div className="tiers">
          <div className="tier tier--silver">
            <div className="label">Уровень 1</div>
            <div className="tier__name">Silver</div>
            <div className="tier__pct">{tiers.SILVER.percent}%</div>
            <div className="muted">возвращается бонусами. Сразу после регистрации.</div>
          </div>
          <div className="tier tier--gold">
            <div className="label">Уровень 2</div>
            <div className="tier__name">Gold</div>
            <div className="tier__pct">{tiers.GOLD.percent}%</div>
            <div className="muted">возвращается бонусами. От {num(tiers.GOLD.threshold)} ₽ покупок.</div>
          </div>
          <div className="tier tier--black">
            <div className="label">Уровень 3</div>
            <div className="tier__name">Black</div>
            <div className="tier__pct">{tiers.BLACK.percent}%</div>
            <div className="muted">возвращается бонусами. От {num(tiers.BLACK.threshold)} ₽ покупок.</div>
          </div>
        </div>
        <div className="perks">
          {referralBonus > 0 && (
            <div className="perk">
              <IconStar size={28} />
              <div>
                <div className="feature__title">Приведи друга</div>
                <div className="feature__text">{num(referralBonus)} бонусов вам после первой покупки друга</div>
              </div>
            </div>
          )}
          {birthdayBonus > 0 && (
            <div className="perk">
              <IconStar size={28} />
              <div>
                <div className="feature__title">День рождения</div>
                <div className="feature__text">{num(birthdayBonus)} бонусов в подарок к празднику</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="support" className="container section">
        <div className="support">
          <div className="stripe" aria-hidden />
          <div style={{ position: "relative", maxWidth: 640 }}>
            <h2 className="h2" style={{ fontSize: "clamp(32px, 4vw, 54px)" }}>
              {home.supportTitle}
            </h2>
            <p>{home.supportText}</p>
          </div>
          <a className="btn btn--dark" style={{ position: "relative" }} href={`https://t.me/${settings.supportTelegram}`}>
            <IconTelegram size={22} className="gold" />@{settings.supportTelegram}
          </a>
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson([
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: SITE.name,
              url: SITE.url,
              logo: `${SITE.url}/icons/icon-512.png`,
              sameAs: [`https://t.me/${settings.supportTelegram}`],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: SITE.name,
              url: SITE.url,
              inLanguage: "ru",
              potentialAction: { "@type": "SearchAction", target: `${SITE.url}/catalog?q={search_term_string}`, "query-input": "required name=search_term_string" },
            },
          ]),
        }}
      />
    </>
  );
}
