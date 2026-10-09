"use client";
import { useActionState, useState } from "react";
import { orderAction } from "../../shop-actions";

interface Props {
  id: string;
  status: string;
  track: string | null;
  cdek: { enabled: boolean; uuid: string | null; canCreate: boolean };
  testPay: boolean;
  paid: boolean;
}

function Op({ op, label, tone = "line", confirmText, extra }: { op: string; label: string; tone?: "gold" | "line" | "danger"; confirmText?: string; extra?: React.ReactNode }) {
  return (
    <>
      <input type="hidden" name="op" value={op} />
      {extra}
      <button
        className={`btn btn--${tone} btn--sm`}
        onClick={(e) => {
          if (confirmText && !confirm(confirmText)) e.preventDefault();
        }}
      >
        {label}
      </button>
    </>
  );
}

export function OrderControls({ id, status, track, cdek, testPay, paid }: Props) {
  const [state, action, pending] = useActionState(orderAction, {});
  const [refundOpen, setRefundOpen] = useState(false);
  const form = (children: React.ReactNode, key: string) => (
    <form key={key} action={action} className="row" style={{ alignItems: "flex-end" }}>
      <input type="hidden" name="id" value={id} />
      <fieldset disabled={pending} className="row" style={{ border: 0, padding: 0, margin: 0, alignItems: "flex-end" }}>
        {children}
      </fieldset>
    </form>
  );

  return (
    <div className="panel stack">
      <h2 style={{ marginBottom: 0 }}>Действия</h2>

      {status === "AWAITING_PAYMENT" && (
        <div className="row">
          {testPay && form(<Op op="testpay" label="Отметить оплаченным (тест)" tone="gold" />, "tp")}
          {form(<Op op="cancel" label="Отменить заказ" tone="danger" confirmText="Отменить заказ? Товар и бонусы вернутся." />, "c")}
        </div>
      )}

      {(status === "PAID" || status === "ASSEMBLING") && (
        <div className="stack" style={{ gap: 12 }}>
          {cdek.enabled && !cdek.uuid && cdek.canCreate && (
            <div className="row">
              {form(<Op op="cdek" label="Создать отправление в СДЭК" tone="gold" />, "cd")}
              <span className="muted small">Заказ появится в кабинете СДЭК, трек подтянется сам</span>
            </div>
          )}
          <div className="row">
            {status === "PAID" && form(<Op op="assembling" label="Собираем" />, "as")}
            {form(
              <Op
                op="shipped"
                label="Отправлен"
                extra={
                  <label className="field">
                    Трек-номер (если отправили не через кнопку СДЭК)
                    <input className="input" name="track" defaultValue={track ?? ""} style={{ minHeight: 40 }} />
                  </label>
                }
              />,
              "sh",
            )}
          </div>
        </div>
      )}

      {status === "SHIPPED" && (
        <div className="row">
          {cdek.uuid && form(<Op op="cdek-sync" label="Обновить статус из СДЭК" />, "cs")}
          {form(<Op op="delivered" label="Получен — начислить бонусы" tone="gold" confirmText="Отметить заказ полученным? Клиенту начислятся бонусы." />, "dl")}
        </div>
      )}
      {(status === "PAID" || status === "ASSEMBLING") && cdek.uuid && <div className="row">{form(<Op op="cdek-sync" label="Обновить из СДЭК" />, "cs2")}</div>}
      {(status === "PAID" || status === "ASSEMBLING") && (
        <div className="row">{form(<Op op="delivered" label="Клиент получил (самовывоз)" confirmText="Отметить заказ полученным? Клиенту начислятся бонусы." />, "dl2")}</div>
      )}

      {paid && (
        <div className="stack" style={{ gap: 10, borderTop: "1px solid var(--c-line)", paddingTop: 16 }}>
          {!refundOpen ? (
            <div>
              <button type="button" className="btn btn--danger btn--sm" onClick={() => setRefundOpen(true)}>
                Вернуть деньги…
              </button>
            </div>
          ) : (
            form(
              <>
                <label className="field" style={{ flex: "1 1 260px" }}>
                  Причина возврата
                  <input className="input" name="reason" required placeholder="Клиент передумал" style={{ minHeight: 40 }} />
                </label>
                <label className="check" style={{ alignSelf: "center" }}>
                  <input type="checkbox" name="restock" defaultChecked={status === "PAID" || status === "ASSEMBLING"} />
                  <span>Вернуть товар на склад</span>
                </label>
                <Op op="refund" label="Вернуть всю сумму" tone="danger" confirmText="Вернуть клиенту всю сумму через ЮKassa? Отменить это нельзя." />
              </>,
              "rf",
            )
          )}
        </div>
      )}

      {status === "DELIVERED" && <p className="muted" style={{ margin: 0 }}>Заказ получен, бонусы начислены. Если клиент вернул товар — оформите возврат денег.</p>}
      {(status === "CANCELLED" || status === "REFUNDED") && <p className="muted" style={{ margin: 0 }}>Заказ закрыт.</p>}

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
    </div>
  );
}
