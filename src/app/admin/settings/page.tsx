import { cdekEnabled } from "@/lib/cdek";
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
                ? `Оплату сайт проверяет сам раз в минуту и при возврате покупателя. Уведомления ЮKassa не обязательны — магазин общий с Kamui, адрес уведомлений оставьте как есть (для отдельного магазина: ${origin}/api/payments/yookassa)`
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
      </div>

      <ShopSettingsForm s={settings} />
      <SettingsForm s={settings} />
    </>
  );
}
