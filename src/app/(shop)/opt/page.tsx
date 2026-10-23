import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { og } from "@/lib/seo";
import { isPlaceholderEmail } from "@/lib/site";
import { getViewer } from "@/lib/viewer";
import { innLookupEnabled, ORG_KIND, orgOf, wholesaleCatalog } from "@/lib/wholesale";
import { ApplicationForm } from "./ApplicationForm";
import { WholesaleList } from "./WholesaleList";

const DESC = "Оптовые цены для бильярдных клубов, магазинов и тренеров: заявка онлайн, отдельный оптовый каталог, оплата по счёту.";

export const metadata: Metadata = {
  title: "Опт для клубов и бизнеса",
  description: DESC,
  alternates: { canonical: "/opt" },
  openGraph: og({ url: "/opt", title: "Опт для клубов и бизнеса — Abramov Shop", description: DESC }),
};

export default async function OptPage() {
  const [settings, me] = await Promise.all([getSettings(), getViewer()]);
  const b = settings.b2b;
  const org = me ? await orgOf(me.id) : null;

  return (
    <section className="container page-pad stack" style={{ gap: 28 }}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Для клубов и бизнеса</div>
        <h1 className="h2">{org?.status === "APPROVED" ? "Оптовый каталог" : "Оптовые цены"}</h1>
        {org?.status === "APPROVED" ? (
          <p>
            {org.name} · цены для организаций. Оплата картой или по счёту — выберите при оформлении.
            {b.minOrder > 0 ? ` Минимальная сумма оптовых товаров в заказе — ${b.minOrder.toLocaleString("ru-RU")} ₽.` : ""}
          </p>
        ) : (
          b.intro && <p>{b.intro}</p>
        )}
      </div>

      {org?.status === "APPROVED" ? (
        <Catalog />
      ) : !b.enabled ? (
        <div className="panel">Приём заявок временно закрыт. Напишите нам — <Link href="/#support">поддержка</Link>.</div>
      ) : (
        <>
          <div className="opt-perks">
            <div>
              <b>Оптовые цены</b>
              <span>Отдельный каталог для организаций — открывается после проверки заявки.</span>
            </div>
            <div>
              <b>Оплата по счёту</b>
              <span>Счёт с реквизитами и QR-кодом формируется сразу — товар резервируем до оплаты.</span>
            </div>
            <div>
              <b>Доставка и самовывоз</b>
              <span>СДЭК по всей России или самовывоз из наших клубов.</span>
            </div>
          </div>
          {!me ? (
            <div className="panel stack">
              <p style={{ margin: 0 }}>Чтобы подать заявку, войдите или зарегистрируйтесь — заявка привяжется к вашему аккаунту.</p>
              <div className="row" style={{ gap: 10 }}>
                <Link href="/login?next=/opt" className="btn btn--gold">
                  Войти
                </Link>
                <Link href="/register?next=/opt" className="btn btn--line">
                  Регистрация
                </Link>
              </div>
            </div>
          ) : org?.status === "PENDING" ? (
            <div className="panel stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 className="h3" style={{ margin: 0 }}>
                  Заявка на проверке
                </h2>
                <span className="pill pill--warn">{ORG_KIND[org.kind] ?? org.kind}</span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {org.name}, ИНН {org.inn}. Проверим организацию и пришлём письмо на {org.contactEmail} — обычно в течение рабочего дня.
              </p>
            </div>
          ) : org?.status === "BLOCKED" ? (
            <div className="panel">Доступ организации к оптовым ценам закрыт. Если это ошибка — напишите нам.</div>
          ) : (
            <>
              {org?.status === "REJECTED" && (
                <div className="form-error">
                  Заявка отклонена{org.rejectReason ? `: ${org.rejectReason}` : ""}. Можно исправить данные и отправить снова.
                </div>
              )}
              <ApplicationForm
                lookup={innLookupEnabled()}
                initial={{
                  inn: org?.inn ?? "",
                  name: org?.name ?? "",
                  kpp: org?.kpp ?? "",
                  ogrn: org?.ogrn ?? "",
                  legalAddress: org?.legalAddress ?? "",
                  kind: org?.kind ?? "CLUB",
                  city: org?.city ?? "",
                  tables: org?.tables ? String(org.tables) : "",
                  website: org?.website ?? "",
                  contactName: org?.contactName ?? me.name,
                  contactPhone: org?.contactPhone ?? me.phone ?? "",
                  contactEmail: org?.contactEmail ?? (isPlaceholderEmail(me.email) ? "" : me.email),
                  comment: org?.comment ?? "",
                }}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}

async function Catalog() {
  const { items, categories } = await wholesaleCatalog();
  if (!items.length) return <div className="panel muted">Оптовый каталог наполняется — скоро здесь появятся товары.</div>;
  return <WholesaleList items={items} categories={categories} />;
}
