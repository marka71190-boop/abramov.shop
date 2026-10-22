import type { Metadata } from "next";
import Link from "next/link";
import { clubMapUrl, listClubs } from "@/lib/clubs";
import { getActiveConsent } from "@/lib/consent";
import { prettyPhone, rub } from "@/lib/format";
import { og } from "@/lib/seo";
import { servicePrices } from "@/lib/service";
import { getSettings } from "@/lib/settings";
import { isPlaceholderEmail } from "@/lib/site";
import { getActiveBan, getViewer } from "@/lib/viewer";
import { ServiceForm } from "./ServiceForm";

const DESC = "Мастерская Abramov: замена наклейки, ремонт и реставрация бильярдных киёв. Принесите кий в клуб «Чемпион» или «Абрамов» или пришлите СДЭК.";

export const metadata: Metadata = {
  title: "Мастерская: ремонт киёв и замена наклейки",
  description: DESC,
  alternates: { canonical: "/service" },
  openGraph: og({ url: "/service", title: "Мастерская Abramov — ремонт киёв", description: DESC }),
};

const days = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "день" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "дня" : "дней"}`;

export default async function ServicePage() {
  const [settings, prices, clubs, user] = await Promise.all([getSettings(), servicePrices(), listClubs({ service: true }), getViewer()]);
  const consent = user ? await getActiveConsent(user.id, "PERSONAL_DATA") : null;
  const st = settings.service;
  const blocked = !st.enabled
    ? "Приём заявок временно приостановлен — напишите нам в Telegram."
    : settings.pdPause
      ? settings.pdPauseMessage
      : !prices.length
        ? "Прайс мастерской скоро появится."
        : null;

  return (
    <section className="container page-pad stack" style={{ gap: 28 }}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Мастерская</div>
        <h1 className="h2">Ремонт киёв и замена наклейки</h1>
        {st.intro && <p>{st.intro}</p>}
      </div>

      {prices.length > 0 && (
        <div className="panel stack">
          <h2 style={{ margin: 0 }}>Цены и сроки</h2>
          <div className="service-prices">
            {prices.map((p) => (
              <div key={p.id} className="service-prices__row">
                <div>
                  <b>{p.name}</b>
                  {p.description && <div className="muted small">{p.description}</div>}
                </div>
                <div className="service-prices__meta">
                  <strong>
                    {p.priceFrom ? "от " : ""}
                    {rub(p.price)}
                  </strong>
                  <span className="muted small">{days(p.days)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Точную цену и срок мастер назовёт, когда посмотрит кий. Оплата — онлайн по ссылке или на месте в клубе.
          </p>
        </div>
      )}

      {clubs.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <h2 className="h3" style={{ margin: 0 }}>Где принять кий</h2>
          <div className="club-list">
            {clubs.map((c) => (
              <div key={c.id} className="addr-card" style={{ cursor: "default" }}>
                <span className="label">{c.city}</span>
                <strong>{c.name}</strong>
                <span className="small">{c.address}</span>
                {c.workTime && <span className="muted small">{c.workTime}</span>}
                <a href={clubMapUrl(c)} target="_blank" rel="noreferrer" className="small">
                  Как добраться →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {blocked ? (
        <div className="notice" style={{ margin: 0 }}>
          {blocked}
        </div>
      ) : !user ? (
        <div className="notice" style={{ margin: 0 }}>
          Чтобы оставить заявку, <Link href="/login?next=/service">войдите в аккаунт</Link> — так вы будете видеть, что с кием, и получать письма.
        </div>
      ) : getActiveBan(user) ? (
        <div className="notice" style={{ margin: 0 }}>
          Аккаунт заблокирован.
        </div>
      ) : !consent ? (
        <div className="notice" style={{ margin: 0 }}>
          Нужно согласие на обработку персональных данных — откройте <Link href="/account">личный кабинет</Link>.
        </div>
      ) : (
        <ServiceForm
          prices={prices.map((p) => ({ id: p.id, name: p.name, price: p.price, priceFrom: p.priceFrom, days: p.days }))}
          clubs={clubs.map((c) => ({ id: c.id, name: c.name, city: c.city, address: c.address }))}
          cdek={!!st.cdekAddress.trim()}
          user={{ name: user.name, phone: prettyPhone(user.phone), email: isPlaceholderEmail(user.email) ? "" : user.email }}
        />
      )}
    </section>
  );
}
