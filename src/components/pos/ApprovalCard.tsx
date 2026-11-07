import { rub } from "@/lib/format";
import type { ApprovalDetails } from "@/lib/pos-approval";

/** Что просит касса: позиции, скидка, где и кто на смене. Без данных покупателя */
export function ApprovalCard({ kind, summary, details: d }: { kind: string; summary: string; details: ApprovalDetails }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <b>{summary}</b>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {d.lines.map((l, i) => (
          <li key={i}>
            {l.name} × {l.qty} — {rub(l.amount)}
          </li>
        ))}
      </ul>
      {kind === "DISCOUNT" && (
        <div className="small">
          Скидка {rub(d.discount ?? 0)} ({d.percent} %), к оплате {rub(d.total)}
        </div>
      )}
      <div className="muted small">
        Касса: {d.kassa}
        {d.staffName ? ` · на смене ${d.staffName}` : ""}
        {d.place && !d.kassa.includes(d.place) ? ` · ${d.place}` : ""}
      </div>
    </div>
  );
}
