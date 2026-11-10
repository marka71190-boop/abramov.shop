import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { InstallButton } from "@/components/pwa/InstallButton";
import { cardToken } from "@/lib/bonus-card";
import { getActiveConsent } from "@/lib/consent";
import { callNameOf } from "@/lib/names";
import { num } from "@/lib/format";
import { TIER_NAME, tierProgress } from "@/lib/loyalty";
import { qrSvg } from "@/lib/qr";
import { getSettings } from "@/lib/settings";
import { getViewer } from "@/lib/viewer";
import { redirect } from "next/navigation";
import { CardQr } from "./CardQr";

export const metadata: Metadata = { title: "Бонусная карта", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Бонусная карта в телефоне: QR для кассы клуба вместо телефона */
export default async function CardPage() {
  const [u, settings] = await Promise.all([getViewer(), getSettings()]);
  if (u?.isDevice) redirect("/kassa");

  if (!u)
    return (
      <section className="container page-pad" style={{ maxWidth: 520 }}>
        <div className="bcard bcard--empty">
          <Logo id="bcard-empty" className="bcard__logo" />
          <h1 className="h3" style={{ margin: 0 }}>
            Бонусная карта
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Войдите — здесь появится ваша карта с QR-кодом. Покажите его на кассе в клубе: бонусы начислятся и спишутся сами.
            {settings.loyalty.welcomeBonus > 0 ? ` За регистрацию — ${num(settings.loyalty.welcomeBonus)} бонусов.` : ""}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn btn--gold" href="/login?next=%2Faccount%2Fcard">
              Войти
            </Link>
            <Link className="btn btn--line" href="/register?next=%2Faccount%2Fcard">
              Регистрация
            </Link>
          </div>
        </div>
      </section>
    );

  // Как и кабинет: без действующего согласия на обработку ПДн карта не работает
  if (!(await getActiveConsent(u.id, "PERSONAL_DATA"))) redirect("/consent");

  const progress = tierProgress(Math.floor(u.totalSpent / 100), settings.loyalty);
  const qr = await qrSvg(cardToken(u.id));
  const name = callNameOf(u);

  return (
    <section className="container page-pad" style={{ maxWidth: 520 }}>
      <div className="bcard">
        <div className="bcard__top">
          <Logo id="bcard" className="bcard__logo" />
          <span className="tag" style={{ padding: "4px 12px" }}>
            {TIER_NAME[progress.current]} · {settings.loyalty.tiers[progress.current].percent} %
          </span>
        </div>
        {name && <div className="bcard__name">{name}</div>}
        <CardQr initial={qr} balance={u.bonusBalance} />
        <p className="small muted" style={{ margin: 0, textAlign: "center" }}>
          Покажите QR кассиру в клубе — бонусы начислятся и спишутся сами. Код меняется каждую минуту — старый скриншот не сработает.
        </p>
        {progress.next && (
          <div className="meter">
            <div className="meter__row small">
              <span className="muted">До уровня {TIER_NAME[progress.next]}</span>
              <span>осталось {num(progress.left)} ₽</span>
            </div>
            <div className="meter__bar" style={{ height: 4 }}>
              <div className="meter__fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="stack" style={{ gap: 12, marginTop: 18, alignItems: "center", textAlign: "center" }}>
        <Link href="/account#bonus" className="small">
          История бонусов и приглашение друзей →
        </Link>
        <div className="bcard__install">
          <InstallButton compact />
        </div>
      </div>
    </section>
  );
}
