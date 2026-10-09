"use client";
import { useActionState } from "react";
import type { SiteSettings } from "@/lib/settings-defaults";
import { updateSettings } from "../actions";

export function SettingsForm({ s }: { s: SiteSettings }) {
  const [state, action, pending] = useActionState(updateSettings, {});
  const t = s.loyalty.tiers;
  return (
    <form action={action} className="stack">
      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Режим техработ</h2>
        <label className="check">
          <input type="checkbox" name="maintenance" defaultChecked={s.maintenance} />
          <span>Закрыть магазин для покупателей (админы продолжают видеть сайт)</span>
        </label>
        <label className="field">
          Текст на заглушке
          <input className="input" name="maintenanceMessage" defaultValue={s.maintenanceMessage} maxLength={500} />
        </label>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Поддержка</h2>
        <div className="form-grid">
          <label className="field">
            Telegram поддержки (без @) — кнопка в окне бана и на сайте
            <input className="input" name="supportTelegram" defaultValue={s.supportTelegram} required />
          </label>
          <label className="field">
            Почта для покупателей
            <input className="input" type="email" name="supportEmail" defaultValue={s.supportEmail} required />
          </label>
        </div>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Бонусы и уровни</h2>
        <div className="form-grid">
          <label className="field">
            Silver, % бонусами
            <input className="input" type="number" step="0.5" name="silverPercent" defaultValue={t.SILVER.percent} />
          </label>
          <label className="field">
            Gold, % бонусами
            <input className="input" type="number" step="0.5" name="goldPercent" defaultValue={t.GOLD.percent} />
          </label>
          <label className="field">
            Black, % бонусами
            <input className="input" type="number" step="0.5" name="blackPercent" defaultValue={t.BLACK.percent} />
          </label>
          <label className="field">
            Gold — от суммы покупок, ₽
            <input className="input" type="number" name="goldThreshold" defaultValue={t.GOLD.threshold} />
          </label>
          <label className="field">
            Black — от суммы покупок, ₽
            <input className="input" type="number" name="blackThreshold" defaultValue={t.BLACK.threshold} />
          </label>
          <label className="field">
            Оплата бонусами — до % заказа
            <input className="input" type="number" name="maxSpendPercent" defaultValue={s.loyalty.maxSpendPercent} />
          </label>
          <label className="field">
            Бонусы за регистрацию
            <input className="input" type="number" name="welcomeBonus" defaultValue={s.loyalty.welcomeBonus} />
          </label>
          <label className="field">
            За приглашённого друга
            <input className="input" type="number" name="referralBonus" defaultValue={s.loyalty.referralBonus} />
          </label>
          <label className="field">
            В день рождения
            <input className="input" type="number" name="birthdayBonus" defaultValue={s.loyalty.birthdayBonus} />
          </label>
          <label className="field">
            Бонусы сгорают через, дней (0 — не сгорают)
            <input className="input" type="number" name="expiryDays" defaultValue={s.loyalty.expiryDays} />
          </label>
        </div>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить настройки"}
        </button>
      </div>
    </form>
  );
}
