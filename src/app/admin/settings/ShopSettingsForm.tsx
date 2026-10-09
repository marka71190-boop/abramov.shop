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
      </div>
      <label className="field">
        Объявление на странице оформления (например, «Отправка после 15 октября»)
        <input className="input" name="notice" defaultValue={s.checkout.notice} maxLength={500} />
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить доставку"}
        </button>
      </div>
    </form>
  );
}
