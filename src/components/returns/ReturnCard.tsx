import Link from "next/link";
import { fmtDate, rub } from "@/lib/format";
import { TONE_PILL } from "@/lib/order-status";
import { RETURN_KIND, RETURN_RESOLUTION, RETURN_STATUS, type ReturnListItem } from "@/lib/returns";
import { CancelReturnButton } from "./CancelReturnButton";

/** Карточка заявки на возврат — в личном кабинете и на странице заказа. */
export function ReturnCard({ r, showOrder = true }: { r: ReturnListItem; showOrder?: boolean }) {
  const st = RETURN_STATUS[r.status];
  return (
    <div className="rcard">
      <div className="rcard__head">
        <div>
          <strong>{r.number}</strong>
          <span className="muted small">
            {" "}
            · {fmtDate(r.createdAt)}
            {showOrder && (
              <>
                {" "}
                · заказ <Link href={`/order/${r.order.number}`}>{r.order.number}</Link>
              </>
            )}
          </span>
        </div>
        <span className={`pill ${TONE_PILL[st.tone]}`}>{st.text}</span>
      </div>
      <div className="small">
        {r.items.map((i) => `${i.orderItem.name} × ${i.quantity}`).join(", ")}
        <div className="muted">
          {RETURN_KIND[r.kind]}
          {r.kind === "DEFECT" ? ` · ${RETURN_RESOLUTION[r.resolution]}` : ""} · {r.reason}
        </div>
      </div>
      {r.status === "NEW" && <div className="muted small">Ответим до {fmtDate(r.decisionDue)}</div>}
      {r.answer && <div className="rcard__answer">{r.answer}</div>}
      {r.refundAmount != null && r.refundAmount > 0 && (
        <div className="small" style={{ color: "var(--c-success)" }}>
          Возвращено {rub(r.refundAmount)}
          {r.bonusReturned ? ` и ${r.bonusReturned} бонусов` : ""}
        </div>
      )}
      {r.status === "NEW" && <CancelReturnButton number={r.number} />}
    </div>
  );
}
