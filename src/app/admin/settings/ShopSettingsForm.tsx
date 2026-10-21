"use client";
import { useActionState } from "react";
import type { SiteSettings } from "@/lib/settings-defaults";
import { updateShopSettings } from "../shop-actions";

export function ShopSettingsForm({ s }: { s: SiteSettings }) {
  const [state, action, pending] = useActionState(updateShopSettings, {});
  const d = s.delivery;
  return (
    <form action={action} className="panel stack">
      <h2 style={{ marginBottom: 0 }}>Доставка и оформление</h2>
      <div className="row" style={{ gap: 24 }}>
        <label className="check">
          <input type="checkbox" name="pvzEnabled" defaultChecked={d.pvzEnabled} />
          <span>До пункта выдачи СДЭК</span>
        </label>
        <label className="check">
          <input type="checkbox" name="courierEnabled" defaultChecked={d.courierEnabled} />
          <span>Курьером СДЭК до двери</span>
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Код города отправки в СДЭК (Краснодар — 435)
          <input className="input" name="fromCityCode" type="number" defaultValue={d.fromCityCode} />
        </label>
        <label className="field">
          ПВЗ, где сдаёте посылки
          <input className="input" name="shipmentPoint" defaultValue={d.shipmentPoint} />
        </label>
        <label className="field">
          Тариф до ПВЗ (136 — посылка склад-склад)
          <input className="input" name="tariffPvz" type="number" defaultValue={d.tariffPvz} />
        </label>
        <label className="field">
          Тариф курьером (137 — посылка склад-дверь)
          <input className="input" name="tariffCourier" type="number" defaultValue={d.tariffCourier} />
        </label>
        <label className="field">
          Наценка к цене СДЭК, ₽ (упаковка)
          <input className="input" name="markup" type="number" min={0} defaultValue={d.markup} />
        </label>
        <label className="field">
          Бесплатная доставка от, ₽ (0 — нет)
          <input className="input" name="freeFrom" type="number" min={0} defaultValue={d.freeFrom} />
        </label>
        <label className="field">
          Пока СДЭК не подключён: до ПВЗ, ₽
          <input className="input" name="flatPvz" type="number" min={0} defaultValue={d.flatPvz} />
        </label>
        <label className="field">
          Пока СДЭК не подключён: курьер, ₽
          <input className="input" name="flatCourier" type="number" min={0} defaultValue={d.flatCourier} />
        </label>
        <label className="field">
          Сколько ждать оплату, минут
          <input className="input" name="paymentMinutes" type="number" min={15} defaultValue={s.checkout.paymentMinutes} />
        </label>
        <label className="field">
          Максимум одного товара в заказе, шт.
          <input className="input" name="maxQtyPerItem" type="number" min={1} defaultValue={s.checkout.maxQtyPerItem} />
        </label>
        <label className="field">
          Напомнить о брошенной корзине через, часов (0 — не напоминать)
          <input className="input" name="abandonedHours" type="number" min={0} max={168} defaultValue={s.checkout.abandonedHours} />
        </label>
      </div>
      <div className="form-grid" id="abandoned-promo">
        <label className="field">
          Корзина лежит дольше, часов — прислать промокод (0 — не присылать)
          <input className="input" name="abandonedPromoHours" type="number" min={0} max={168} defaultValue={s.checkout.abandonedPromoHours} />
        </label>
        <label className="field">
          Скидка по этому промокоду, %
          <input className="input" name="abandonedPromoPercent" type="number" min={1} max={50} defaultValue={s.checkout.abandonedPromoPercent} />
        </label>
        <label className="field">
          Промокод действует, часов
          <input className="input" name="abandonedPromoValidHours" type="number" min={1} max={336} defaultValue={s.checkout.abandonedPromoValidHours} />
        </label>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Промокод персональный: только этому покупателю, на один заказ. Приходит подписчикам на рассылку, днём, не чаще раза в 30 дней на человека.
      </p>
      <label className="field">
        Объявление на странице оформления (например, «Отправка после 15 октября»)
        <input className="input" name="notice" defaultValue={s.checkout.notice} maxLength={500} />
      </label>
      <label className="field" style={{ maxWidth: 420 }} id="stock-settings">
        Предупреждать в Telegram, когда остаток варианта не больше, шт (0 — не предупреждать)
        <input className="input" name="lowStock" type="number" min={0} defaultValue={s.stock.lowThreshold} />
      </label>
      <label className="field" style={{ maxWidth: 420 }} id="review-settings">
        Попросить оценить покупку письмом через, дней после получения (0 — не просить)
        <input className="input" name="reviewRequestDays" type="number" min={0} max={29} defaultValue={s.reviews.requestDays} />
      </label>
      <h2 style={{ margin: "12px 0 0" }} id="gift-settings">
        Подарочные сертификаты
      </h2>
      <label className="check">
        <input type="checkbox" name="giftEnabled" defaultChecked={s.giftCards.enabled} />
        <span>Продавать сертификаты на сайте (страница /gift). Выпускать в админке можно всегда</span>
      </label>
      <div className="form-grid">
        <label className="field">
          Номиналы, ₽ — через запятую
          <input className="input" name="giftNominals" defaultValue={s.giftCards.nominals.join(", ")} />
        </label>
        <label className="field">
          Своя сумма от, ₽ (0 — без своей суммы)
          <input className="input" name="giftCustomMin" type="number" min={0} defaultValue={s.giftCards.customMin} />
        </label>
        <label className="field">
          Своя сумма до, ₽
          <input className="input" name="giftCustomMax" type="number" min={0} defaultValue={s.giftCards.customMax} />
        </label>
        <label className="field">
          Срок действия, дней (0 — бессрочно)
          <input className="input" name="giftValidityDays" type="number" min={0} max={3650} defaultValue={s.giftCards.validityDays} />
        </label>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
