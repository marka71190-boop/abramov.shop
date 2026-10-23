"use client";
import { useActionState } from "react";
import type { SiteSettings } from "@/lib/settings-defaults";
import { saveB2bSettings } from "../shop-actions";

export function B2bSettingsForm({ s }: { s: SiteSettings["b2b"] }) {
  const [state, action, pending] = useActionState(saveB2bSettings, {});
  return (
    <form action={action} className="panel stack" id="b2b">
      <h2 style={{ marginBottom: 0 }}>Опт и счета</h2>
      <label className="check">
        <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
        <span>Принимать заявки организаций (страница /opt)</span>
      </label>
      <label className="field">
        Текст на странице «Опт»
        <textarea className="textarea" name="intro" defaultValue={s.intro} style={{ minHeight: 70, paddingTop: 10 }} />
      </label>
      <div className="form-grid">
        <label className="field">
          Срок оплаты счёта, дней
          <input className="input" name="invoiceDays" type="number" min={1} max={60} defaultValue={s.invoiceDays} />
          <span className="muted small">Потом неоплаченный заказ отменяется, товар возвращается в продажу</span>
        </label>
        <label className="field">
          Минимальная сумма опта, ₽
          <input className="input" name="minOrder" type="number" min={0} defaultValue={s.minOrder} />
          <span className="muted small">0 — без минимума</span>
        </label>
        <label className="field">
          Строка про НДС в счёте
          <input className="input" name="vatNote" defaultValue={s.vatNote} />
        </label>
      </div>
      <h3 style={{ margin: "8px 0 0" }}>Банк для счетов</h3>
      <p className="small muted" style={{ margin: 0 }}>
        Пока реквизиты не заполнены, оплата по счёту на сайте не предлагается. Они печатаются в счёте и зашиваются в QR-код для оплаты.
      </p>
      <div className="form-grid">
        <label className="field">
          Банк
          <input className="input" name="bankName" defaultValue={s.bankName} placeholder="ПАО Сбербанк, г. Краснодар" />
        </label>
        <label className="field">
          БИК
          <input className="input" name="bik" defaultValue={s.bik} inputMode="numeric" maxLength={9} />
        </label>
        <label className="field">
          Расчётный счёт
          <input className="input" name="account" defaultValue={s.account} inputMode="numeric" maxLength={20} />
        </label>
        <label className="field">
          Корр. счёт
          <input className="input" name="corrAccount" defaultValue={s.corrAccount} inputMode="numeric" maxLength={20} />
        </label>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <button className="btn btn--gold" disabled={pending} style={{ justifySelf: "start" }}>
        Сохранить
      </button>
    </form>
  );
}
