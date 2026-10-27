import type { Metadata } from "next";
import { InstallButton, ShareIcon } from "@/components/pwa/InstallButton";
import { PushToggle } from "@/components/pwa/PushToggle";
import { pushPublicKey } from "@/lib/push";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Приложение Abramov Shop",
  description: "Установите Abramov Shop на телефон: статус заказа и трек-номер СДЭК приходят уведомлением, каталог открывается в одно касание.",
  alternates: { canonical: "/app" },
};

const PERKS = [
  { t: "Уведомления о заказе", d: "Оплата, отправка с трек-номером, «можно забирать в клубе», готовность кия из мастерской — сразу на экран телефона." },
  { t: "В одно касание", d: "Значок Abramov на главном экране: каталог, корзина и заказы открываются как обычное приложение, без адресной строки." },
  { t: "Ничего не скачивать", d: "Не нужен магазин приложений и место на телефоне. Обновляется само — всегда актуальные цены и наличие." },
  { t: "Без лишнего", d: "Только ваши заказы и бонусы. Рекламу уведомлениями не шлём, выключить можно одной кнопкой." },
];

export default async function AppPage() {
  const viewer = await getViewer();
  const key = pushPublicKey();
  return (
    <section className="container page-pad stack" style={{ gap: 48 }}>
      <div className="app-hero">
        <div className="stack" style={{ gap: 20 }}>
          <div className="eyebrow">Приложение</div>
          <h1 className="h2" style={{ margin: 0 }}>
            Abramov Shop
            <br />
            <span className="gold">в вашем телефоне</span>
          </h1>
          <p className="muted" style={{ margin: 0, maxWidth: 520, fontSize: 17 }}>
            Установите магазин на экран телефона — и узнавайте об оплате, отправке и трек-номере заказа из уведомлений.
          </p>
          <div>
            <InstallButton />
          </div>
        </div>
        <div className="app-phone" aria-hidden>
          <div className="app-note">
            <img src="/icons/icon-192.png" alt="" width={28} height={28} />
            <div>
              <b>Заказ A-1024 оплачен</b>
              <span>Соберём и пришлём трек-номер СДЭК.</span>
            </div>
          </div>
          <div className="app-note">
            <img src="/icons/icon-192.png" alt="" width={28} height={28} />
            <div>
              <b>Заказ A-1024 передан в СДЭК</b>
              <span>Трек-номер 1234567890, в пути ~3 дн.</span>
            </div>
          </div>
          <div className="app-note">
            <img src="/icons/icon-192.png" alt="" width={28} height={28} />
            <div>
              <b>Мастерская: кий готов</b>
              <span>Можно забирать в клубе.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="app-perks">
        {PERKS.map((p) => (
          <div key={p.t} className="panel stack" style={{ gap: 8 }}>
            <b>{p.t}</b>
            <span className="muted small">{p.d}</span>
          </div>
        ))}
      </div>

      {key && (
        <div className="panel stack" id="push">
          <h2 style={{ margin: 0 }}>Уведомления о заказах</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Включаются на каждом устройстве отдельно. В уведомлениях только номер и статус заказа — без имени, адреса и телефона.
          </p>
          <PushToggle publicKey={key} signedIn={!!viewer} />
        </div>
      )}

      <div className="form-grid">
        <div className="panel stack">
          <h2 style={{ margin: 0 }}>iPhone и iPad</h2>
          <ol className="install-steps">
            <li>
              Откройте <b>abramov.shop</b> в Safari
            </li>
            <li>
              Нажмите «Поделиться» <ShareIcon /> внизу экрана
            </li>
            <li>
              Выберите <b>«На экран «Домой»»</b> → «Добавить»
            </li>
            <li>Откройте Abramov с экрана и включите уведомления на этой странице</li>
          </ol>
        </div>
        <div className="panel stack">
          <h2 style={{ margin: 0 }}>Android и компьютер</h2>
          <ol className="install-steps">
            <li>
              Нажмите <b>«Установить приложение»</b> вверху этой страницы
            </li>
            <li>Нет кнопки — меню браузера ⋮ → «Установить приложение» или «Добавить на главный экран»</li>
            <li>В Яндекс Браузере: меню ≡ → «Добавить ярлык на экран»</li>
            <li>На компьютере — значок установки справа в адресной строке</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
