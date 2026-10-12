import { and, inArray, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { db, schema as sc } from "@/db";
import { cdekEnabled } from "@/lib/cdek";
import { mailEnabled } from "@/lib/mail";
import { botUsername, telegramEnabled, tgStatus } from "@/lib/telegram";
import { TelegramTest } from "./TelegramTest";
import { getOrigin } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { requireAdmin } from "@/lib/viewer";
import { yookassaEnabled, yookassaTestMode } from "@/lib/yookassa";
import { SettingsForm } from "./SettingsForm";
import { ShopSettingsForm } from "./ShopSettingsForm";

export default async function SettingsPage() {
  await requireAdmin("OWNER");
  const [settings, origin] = await Promise.all([getSettings(), getOrigin(SITE.url)]);
  const yk = yookassaEnabled();
  const tg = telegramEnabled();
  const [bot, tgAdmins] = await Promise.all([
    botUsername(),
    db.$count(sc.user, and(inArray(sc.user.role, ["OWNER", "MANAGER"]), isNotNull(sc.user.telegramChatId))),
  ]);
  const cdek = cdekEnabled();
  return (
    <>
      <h1>Настройки</h1>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Подключения</h2>
        <div className="row-line">
          <div>
            <div>ЮKassa</div>
            <div className="muted small">
              {yk
                ? `В ЮKassa → Интеграция → HTTP-уведомления укажите ${origin}/api/payments/yookassa (события payment.succeeded, payment.canceled). Без уведомлений тоже работает: сайт сам проверяет оплату раз в минуту`
                : "Добавьте в Timeweb переменные YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY и пересоберите сайт"}
            </div>
          </div>
          <span className={`pill ${yk ? (yookassaTestMode() ? "pill--warn" : "pill--ok") : "pill--bad"}`}>
            {yk ? (yookassaTestMode() ? "тестовый магазин" : "подключена") : "не подключена"}
          </span>
        </div>
        <div className="row-line">
          <div>
            <div>СДЭК</div>
            <div className="muted small">
              {cdek
                ? process.env.CDEK_TEST_MODE === "true"
                  ? "Учебная среда СДЭК — отправления ненастоящие"
                  : "Расчёт доставки, пункты выдачи и отправления работают"
                : "Добавьте в Timeweb переменные CDEK_CLIENT_ID и CDEK_CLIENT_SECRET. Пока доставка считается по фиксированной цене ниже"}
            </div>
          </div>
          <span className={`pill ${cdek ? (process.env.CDEK_TEST_MODE === "true" ? "pill--warn" : "pill--ok") : "pill--bad"}`}>
            {cdek ? (process.env.CDEK_TEST_MODE === "true" ? "учебный" : "подключён") : "не подключён"}
          </span>
        </div>
        <div className="row-line">
          <div>
            <div>Telegram-бот{bot ? ` @${bot}` : ""}</div>
            <div className="muted small">
              {tg && !bot ? (
                <>
                  Сервер не может связаться с Telegram{tgStatus.lastError ? ` (${tgStatus.lastError})` : ""}. С российских серверов это частая история — нужен релей:
                  инструкция в репозитории, файл relay/README.md{process.env.TELEGRAM_API_URL ? ". Релей задан — проверьте адрес TELEGRAM_API_URL" : ""}.
                </>
              ) : tg ? (
                <>
                  Клиенты подключают бота в личном кабинете. Админов с подключённым Telegram: {tgAdmins} — им приходят новые заказы.{" "}
                  <Link href="/account#settings">Подключить свой</Link>
                </>
              ) : (
                "Создайте бота у @BotFather и добавьте в Timeweb переменную TELEGRAM_BOT_TOKEN"
              )}
            </div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            {tg && <TelegramTest />}
            <span className={`pill ${tg && bot ? "pill--ok" : "pill--bad"}`}>{tg ? (bot ? "подключён" : "нет связи") : "не подключён"}</span>
          </div>
        </div>
        <div className="row-line">
          <div>
            <div>Почта</div>
            <div className="muted small">
              {mailEnabled()
                ? `Письма уходят с ${process.env.SMTP_FROM || process.env.SMTP_USER}: восстановление пароля, оплата, трек-номер, возврат`
                : "Без почты ссылка для восстановления пароля приходит только в Telegram. Добавьте SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS"}
            </div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            {mailEnabled() && <TelegramTest kind="mail" />}
            <span className={`pill ${mailEnabled() ? "pill--ok" : "pill--bad"}`}>{mailEnabled() ? "подключена" : "не подключена"}</span>
          </div>
        </div>
      </div>

      <ShopSettingsForm s={settings} />
      <SettingsForm s={settings} />
    </>
  );
}
