import Link from "next/link";
import { KeepBeta } from "@/components/RichText";
import { IconArrow, IconArrowUpRight, IconCard, IconStar, IconTelegram, IconTruck } from "@/components/Icons";
import { Logo } from "@/components/Logo";
import { getFeaturedLimited, getPublicCategories } from "@/lib/catalog";
import { num, rub } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export default async function HomePage() {
  const [categories, drop, settings] = await Promise.all([getPublicCategories(), getFeaturedLimited(), getSettings()]);
  const { tiers, referralBonus, birthdayBonus } = settings.loyalty;

  return (
    <>
      <section id="top" className="hero">
        <div className="container hero__grid">
          <div className="hero__copy">
            <div className="eyebrow">Abramov Shop</div>
            <h1 className="h1">
              Экипировка
              <br />
              для тех, кто
              <br />
              <span className="gold">играет на победу</span>
            </h1>
            <p className="hero__lead">
              Всё для бильярда в одном месте. Доставка СДЭК по всей России, удобная оплата и бонусы с каждой покупки.
            </p>
            <div className="hero__actions">
              <Link href="#catalog" className="btn btn--gold btn--cut">
                В каталог <IconArrow size={18} />
              </Link>
              <Link href="#bonus" className="btn btn--line">
                Бонусная программа
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
              <div className="feature__title">Доставка СДЭК</div>
              <div className="feature__text">Курьер или пункт выдачи по всей России</div>
            </div>
          </div>
          <div className="feature">
            <IconCard size={28} />
            <div>
              <div className="feature__title">Оплата ЮKassa</div>
              <div className="feature__text">Банковские карты и СБП, чек на почту</div>
            </div>
          </div>
          <div className="feature">
            <IconStar size={28} />
            <div>
              <div className="feature__title">Бонусы</div>
              <div className="feature__text">Начисляем с каждого заказа, оплачивайте ими покупки</div>
            </div>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section id="catalog" className="container section">
          <div className="section-head">
            <h2 className="h2">Каталог</h2>
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

      {drop && (
        <section id="drop" className="container section">
          <div className="drop">
            <div className="drop__media">
              {drop.image && <img src={drop.image.url} alt={drop.image.alt} />}
              <span className="tag">Limited</span>
            </div>
            <div className="drop__body">
              <div className="eyebrow">Лимитированная серия</div>
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
                    <div className="meter__fill" style={{ width: `${Math.min(100, (drop.stock / drop.limitedTotal) * 100)}%` }} />
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

      <section id="bonus" className="container section">
        <div className="section-head">
          <h2 className="h2">
            Бонусная
            <br />
            программа
          </h2>
          <p>
            Чем больше покупаете, тем выше уровень и тем больше бонусов возвращается. Бонусами можно оплатить до{" "}
            {settings.loyalty.maxSpendPercent}% следующего заказа.
          </p>
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
              Есть вопрос?
            </h2>
            <p>Поможем с выбором, заказом и доставкой. Пишите в Telegram.</p>
          </div>
          <a className="btn btn--dark" style={{ position: "relative" }} href={`https://t.me/${settings.supportTelegram}`}>
            <IconTelegram size={22} className="gold" />@{settings.supportTelegram}
          </a>
        </div>
      </section>
    </>
  );
}
