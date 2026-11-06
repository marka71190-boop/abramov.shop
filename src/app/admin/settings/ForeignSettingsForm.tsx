"use client";
import { useActionState } from "react";
import type { SiteSettings } from "@/lib/settings-defaults";
import { saveForeignSettings } from "../shop-actions";

/** Заказы из-за рубежа: страны СДЭК, сборы, реквизиты для перевода */
export function ForeignSettingsForm({ s, robokassa }: { s: SiteSettings["foreign"]; robokassa: boolean }) {
  const [state, action, pending] = useActionState(saveForeignSettings, {});
  return (
    <form action={action} className="panel stack" id="foreign">
      <h2 style={{ marginBottom: 0 }}>Заказы из-за рубежа</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Россия платит только через ЮKassa. Страны из списка ниже — доставка СДЭК, оплата через Робокассу{robokassa ? "" : " (не подключена)"} или переводом на карту. Остальные страны
        покупатель вписывает сам: доставку считаете вы, оплата — переводом. Сбор добавляется к сумме заказа и отдельной строкой идёт в чек Робокассы.
      </p>
      <label className="check">
        <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
        <span>Принимать заказы из-за рубежа</span>
      </label>
      <label className="field">
        Страны, куда возит СДЭК — по одной в строке: код и название
        <textarea className="textarea" name="cdekCountries" defaultValue={s.cdekCountries} style={{ minHeight: 120, paddingTop: 10 }} placeholder={"BY Беларусь\nKZ Казахстан"} />
        <span className="muted small">Код — две латинские буквы, как в СДЭК: BY, KZ, AM, KG, UZ…</span>
      </label>
      <div className="form-grid">
        <label className="field">
          Сбор при оплате через Робокассу, %
          <input className="input" name="robokassaPercent" type="number" min={0} max={50} defaultValue={s.robokassaPercent} />
        </label>
        <label className="field">
          Сбор при оплате переводом, %
          <input className="input" name="transferPercent" type="number" min={0} max={50} defaultValue={s.transferPercent} />
        </label>
        <label className="field">
          Сколько дней ждём перевод
          <input className="input" name="paymentDays" type="number" min={1} max={30} defaultValue={s.paymentDays} />
          <span className="muted small">Потом заказ отменяется, товар возвращается в продажу</span>
        </label>
      </div>
      <label className="field">
        Куда переводить — видят только покупатели с заказом из-за рубежа
        <textarea
          className="textarea"
          name="transferDetails"
          defaultValue={s.transferDetails}
          style={{ minHeight: 100, paddingTop: 10 }}
          placeholder={"Карта: 2200 0000 0000 0000\nПолучатель: Иван И.\nБанк: …"}
        />
        <span className="muted small">Пока пусто, оплата переводом на сайте не предлагается</span>
      </label>
      <label className="field">
        Пояснение на оформлении (необязательно)
        <textarea className="textarea" name="intro" defaultValue={s.intro} style={{ minHeight: 60, paddingTop: 10 }} placeholder="Например: сроки отправки за рубеж, таможня" />
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <button className="btn btn--gold" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </button>
    </form>
  );
}
