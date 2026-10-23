"use client";
import { useActionState } from "react";
import { orderAction } from "../../shop-actions";

/** Заказ по счёту: ссылка на счёт, «Оплата получена», продление резерва */
export function InvoicePanel({ id, number, awaiting, cancelled, until, org }: { id: string; number: string; awaiting: boolean; cancelled: boolean; until: string | null; org: string | null }) {
  const [state, action, pending] = useActionState(orderAction, {});
  return (
    <div className="panel stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Оплата по счёту</h2>
        <a className="btn btn--line btn--sm" href={`/print/invoice/${number}`} target="_blank" rel="noreferrer">
          Открыть счёт
        </a>
      </div>
      <div className="small muted">
        {org ? `Покупатель: ${org}. ` : ""}
        {awaiting ? `Ждём оплату${until ? ` до ${until}` : ""} — потом заказ отменится и товар вернётся в продажу.` : cancelled ? "Заказ отменён: срок оплаты вышел. Если деньги всё же пришли — отметьте оплату, товар снова зарезервируется." : "Оплачен."}
      </div>
      {(awaiting || cancelled) && (
        <form action={action} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input type="hidden" name="id" value={id} />
          <button
            className="btn btn--gold btn--sm"
            name="op"
            value="invoice-paid"
            disabled={pending}
            onClick={(e) => {
              if (!confirm("Деньги по счёту поступили на расчётный счёт?")) e.preventDefault();
            }}
          >
            Оплата получена
          </button>
          {awaiting && (
            <button className="btn btn--line btn--sm" name="op" value="invoice-extend" disabled={pending}>
              Продлить резерв
            </button>
          )}
        </form>
      )}
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
    </div>
  );
}
