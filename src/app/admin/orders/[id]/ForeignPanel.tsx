"use client";
import { useActionState } from "react";
import { foreignShippingAction, orderAction, orderTinAction } from "../../shop-actions";

/**
 * Заказ из-за рубежа: страна, сбор, расчёт доставки (если страна не из списка СДЭК),
 * «Перевод получен» и продление резерва для оплаты переводом.
 */
export function ForeignPanel({
  id,
  country,
  method,
  percent,
  fee,
  pending,
  shipping,
  awaiting,
  cancelled,
  until,
  transferReady,
  readonly,
  tin,
}: {
  id: string;
  country: string;
  method: string;
  percent: number;
  fee: string;
  pending: boolean;
  shipping: number; // копейки — текущая стоимость доставки для покупателя
  awaiting: boolean;
  cancelled: boolean;
  until: string | null;
  transferReady: boolean;
  readonly: boolean;
  /** ИИН / ПИН получателя: label — «ИИН», value — номер; null — для страны не нужен */
  tin: { label: string; value: string } | null;
}) {
  const [tinState, tinAction, tinPending] = useActionState(orderTinAction, {});
  const [ship, shipAction, shipPending] = useActionState(foreignShippingAction, {});
  const [state, action, pendingOp] = useActionState(orderAction, {});
  const transfer = method === "TRANSFER";
  return (
    <div className="panel stack" style={{ gap: 10, borderColor: pending ? "var(--c-gold)" : undefined }}>
      <h2 style={{ margin: 0 }}>Заказ из-за рубежа · {country}</h2>
      <div className="small">
        Оплата: <b>{transfer ? "перевод на карту" : "Робокасса"}</b> · сбор {percent} % — {fee}
      </div>
      <div className="small muted">
        {pending
          ? "Доставку считаете вы: впишите стоимость — сайт пересчитает сбор и итог и отправит покупателю письмо с суммой" +
            (transfer ? " и реквизитами." : " и ссылкой на оплату.")
          : awaiting
            ? `Ждём оплату${until ? ` до ${until}` : ""} — потом заказ отменится и товар вернётся в продажу.`
            : cancelled
              ? "Заказ отменён. Если перевод всё же пришёл — отметьте оплату, товар снова зарезервируется."
              : "Оплачен."}
      </div>
      {tin && (
        <form action={tinAction} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input type="hidden" name="id" value={id} />
          <label className="field" style={{ flex: "0 1 260px" }}>
            {tin.label} получателя — для таможни
            <input className="input" name="tin" defaultValue={tin.value} inputMode="numeric" readOnly={readonly} />
          </label>
          {!readonly && (
            <button className="btn btn--line btn--sm" disabled={tinPending} style={{ minHeight: 48 }}>
              Сохранить
            </button>
          )}
          {!tin.value && <span className="form-error small">Не указан — СДЭК не примет посылку</span>}
        </form>
      )}
      {tinState.error && <div className="form-error">{tinState.error}</div>}
      {tinState.ok && <div className="form-ok">{tinState.ok}</div>}
      {transfer && !transferReady && (awaiting || pending) && (
        <div className="form-error">Не заполнены реквизиты для перевода: Настройки → Заказы из-за рубежа.</div>
      )}

      {awaiting && !readonly && (
        <form action={shipAction} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input type="hidden" name="id" value={id} />
          <label className="field" style={{ flex: "0 1 180px" }}>
            Доставка для покупателя, ₽
            <input className="input" name="cost" inputMode="decimal" defaultValue={pending ? "" : String(shipping / 100)} required />
          </label>
          <label className="field" style={{ flex: "0 1 180px" }}>
            Нам обойдётся, ₽ <span className="muted small">(для прибыли)</span>
            <input className="input" name="carrier" inputMode="decimal" placeholder="как для покупателя" />
          </label>
          <button className="btn btn--gold btn--sm" disabled={shipPending} style={{ minHeight: 48 }}>
            {pending ? "Вписать и отправить сумму" : "Изменить доставку"}
          </button>
        </form>
      )}
      {ship.error && <div className="form-error">{ship.error}</div>}
      {ship.ok && <div className="form-ok">{ship.ok}</div>}

      {transfer && !pending && (awaiting || cancelled) && !readonly && (
        <form action={action} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input type="hidden" name="id" value={id} />
          <button
            className="btn btn--gold btn--sm"
            name="op"
            value="transfer-paid"
            disabled={pendingOp}
            onClick={(e) => {
              if (!confirm("Перевод пришёл на карту, сумма совпадает?")) e.preventDefault();
            }}
          >
            Перевод получен
          </button>
          {awaiting && (
            <>
              <button className="btn btn--line btn--sm" name="op" value="transfer-extend" disabled={pendingOp}>
                Продлить резерв
              </button>
              <button className="btn btn--line btn--sm" name="op" value="transfer-resend" disabled={pendingOp}>
                Отправить реквизиты ещё раз
              </button>
            </>
          )}
        </form>
      )}
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
    </div>
  );
}
