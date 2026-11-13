"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fmtDate, rub } from "@/lib/format";
import { addPayAction, deletePayAction, payVisibleAction, saveRateAction } from "./actions";

const KIND: Record<string, string> = { PAYOUT: "Выплата", BONUS: "Премия", FINE: "Штраф" };
const toRub = (kop: number) => (kop ? String(kop / 100).replace(".", ",") : "");

export interface PayRow {
  name: string;
  perShift: number;
  perHour: number;
  percent: number;
  ownPercent: boolean;
  due: number;
  pays: { id: string; kind: string; amount: number; note: string | null; at: string }[];
}

/** Ставка сотрудника и его выплаты за месяц */
export function StaffPay({ row, month, owner, commonPercent }: { row: PayRow; month: string; owner: boolean; commonPercent: number }) {
  const router = useRouter();
  const [perShift, setPerShift] = useState(toRub(row.perShift));
  const [perHour, setPerHour] = useState(toRub(row.perHour));
  const [percent, setPercent] = useState(row.ownPercent ? String(row.percent).replace(".", ",") : "");
  const [kind, setKind] = useState("PAYOUT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok?: string; error?: string }>, done?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) {
        done?.();
        router.refresh();
      }
    });

  return (
    <div className="stack" style={{ gap: 12, padding: "4px 0 8px" }}>
      {owner && (
        <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field" style={{ margin: 0 }}>
            За смену, ₽
            <input className="input" inputMode="decimal" style={{ width: 110 }} value={perShift} placeholder="0" onChange={(e) => setPerShift(e.target.value)} aria-label={`Ставка за смену: ${row.name}`} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            За час, ₽
            <input className="input" inputMode="decimal" style={{ width: 110 }} value={perHour} placeholder="0" onChange={(e) => setPerHour(e.target.value)} aria-label={`Ставка за час: ${row.name}`} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            С продаж, %
            <input className="input" inputMode="decimal" style={{ width: 110 }} value={percent} placeholder={String(commonPercent).replace(".", ",")} onChange={(e) => setPercent(e.target.value)} aria-label={`Процент с продаж: ${row.name}`} />
          </label>
          <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => act(() => saveRateAction({ name: row.name, perShift, perHour, percent }))}>
            Сохранить ставку
          </button>
        </div>
      )}
      <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: "auto", minHeight: 44 }} aria-label={`Что записать: ${row.name}`}>
          <option value="PAYOUT">Выплатили</option>
          <option value="BONUS">Премия</option>
          <option value="FINE">Штраф</option>
        </select>
        <input className="input" inputMode="decimal" style={{ width: 120 }} value={amount} placeholder="Сумма, ₽" onChange={(e) => setAmount(e.target.value)} aria-label={`Сумма: ${row.name}`} />
        <input className="input" style={{ flex: "1 1 180px" }} value={note} placeholder="Комментарий (необязательно)" onChange={(e) => setNote(e.target.value)} aria-label={`Комментарий: ${row.name}`} />
        <button type="button" className="btn btn--gold btn--sm" disabled={pending || !amount.trim()} onClick={() => act(() => addPayAction({ name: row.name, month, kind, amount, note }), () => (setAmount(""), setNote("")))}>
          Записать
        </button>
        {row.due > 0 && (
          <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => (setKind("PAYOUT"), setAmount(toRub(row.due)))}>
            Всё к выплате: {rub(row.due)}
          </button>
        )}
      </div>
      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
      {row.pays.length > 0 && (
        <div className="stack small" style={{ gap: 4 }}>
          {row.pays.map((p) => (
            <div key={p.id} className="row" style={{ gap: 10, alignItems: "center" }}>
              <span className="muted">{fmtDate(p.at)}</span>
              <span>
                {KIND[p.kind] ?? p.kind}: <b>{rub(p.amount)}</b>
                {p.note ? ` — ${p.note}` : ""}
              </span>
              {owner && (
                <button type="button" className="linklike" disabled={pending} onClick={() => act(() => deletePayAction(p.id))} aria-label={`Удалить запись: ${KIND[p.kind]} ${rub(p.amount)}`}>
                  удалить
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Видит ли кассир свою зарплату в приложении кассы */
export function PayVisible({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="check" style={{ margin: 0 }}>
      <input type="checkbox" checked={on} disabled={pending} onChange={(e) => start(async () => (await payVisibleAction(e.target.checked), router.refresh()))} />
      <span>Кассир видит свою зарплату в приложении кассы</span>
    </label>
  );
}
