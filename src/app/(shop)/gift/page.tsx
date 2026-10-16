import type { Metadata } from "next";
import { getActiveConsent } from "@/lib/consent";
import { og } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { isPlaceholderEmail } from "@/lib/site";
import { getActiveBan, getViewer } from "@/lib/viewer";
import { yookassaEnabled } from "@/lib/yookassa";
import { GiftBuyForm } from "./GiftBuyForm";

const DESC = "Электронный подарочный сертификат Abramov Shop: от 1 000 ₽, придёт получателю на почту в выбранный день. Им можно оплатить кии, мел и аксессуары.";

export const metadata: Metadata = {
  title: "Подарочный сертификат",
  description: DESC,
  alternates: { canonical: "/gift" },
  openGraph: og({ url: "/gift", title: "Подарочный сертификат — Abramov Shop", description: DESC }),
};

export default async function GiftPage() {
  const [user, settings] = await Promise.all([getViewer(), getSettings()]);
  const g = settings.giftCards;
  const consent = user ? await getActiveConsent(user.id, "PERSONAL_DATA") : null;
  const blocked = !g.enabled
    ? { text: "Продажа сертификатов временно приостановлена. Баланс уже купленного сертификата можно проверить справа." }
    : settings.pdPause
      ? { text: settings.pdPauseMessage }
      : !yookassaEnabled()
        ? { text: "Онлайн-оплата подключается. Пока сертификат можно купить через поддержку в Telegram." }
        : !user
          ? { text: "Чтобы купить сертификат, войдите в аккаунт — так он сохранится в личном кабинете.", login: true }
          : getActiveBan(user)
            ? { text: "Аккаунт заблокирован." }
            : !consent
              ? { text: "Нужно согласие на обработку персональных данных — откройте личный кабинет." }
              : null;

  return (
    <section className="container page-pad stack" style={{ gap: 28 }}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Подарок бильярдисту</div>
        <h1 className="h2">Подарочный сертификат</h1>
        <p>Не знаете, какой кий или мел выбрать? Подарите сертификат — получатель выберет сам.</p>
      </div>
      <ol className="gift-steps">
        <li>
          <b>Выберите сумму</b>и напишите пожелание
        </li>
        <li>
          <b>Мы пришлём сертификат</b>получателю на почту в нужный день — или вручите сами
        </li>
        <li>
          <b>Получатель оплатит им заказ</b>целиком или частично, остаток сохранится
        </li>
      </ol>
      <GiftBuyForm
        nominals={g.nominals}
        customMin={g.customMin}
        customMax={g.customMax}
        validityDays={g.validityDays}
        email={user && !isPlaceholderEmail(user.email) ? user.email : ""}
        name={user?.name ?? ""}
        blocked={blocked}
      />
    </section>
  );
}
