"use client";
import { useState, useTransition } from "react";
import { approveAction, completeAction, receiveAction, refundAction, rejectAction, type ReturnActionState } from "../actions";

interface Props {
  id: string;
  status: "NEW" | "APPROVED" | "RECEIVED" | "COMPLETED" | "REJECTED" | "CANCELLED";
  kind: "QUALITY" | "DEFECT";
  resolution: "REFUND" | "EXCHANGE" | "DISCOUNT";
  restocked: boolean;
  instructions: string;
  suggested: number; // рубли
  max: number | null;
  hasBonuses: boolean;
  /** Вернуть деньги может только владелец */
  canRefund: boolean;
}

export function ReturnControls(p: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ReturnActionState>({});
  const [answer, setAnswer] = useState(p.instructions);
  const [reject, setReject] = useState("");
  // Скидка за брак — товар остаётся у покупателя, на склад ничего не возвращаем
  const [restock, setRestock] = useState(p.resolution !== "DISCOUNT" && !p.restocked);
  const [amount, setAmount] = useState(String(Math.floor(p.suggested * 100) / 100));
  const [bonuses, setBonuses] = useState(p.resolution !== "DISCOUNT");
  const [note, setNote] = useState("");
  const run = (fn: () => Promise<ReturnActionState>) => start(async () => setMsg(await fn()));

  if (["COMPLETED", "REJECTED", "CANCELLED"].includes(p.status))
    return <div className="panel muted">Заявка закрыта.{msg.ok ? ` ${msg.ok}` : ""}</div>;

  return (
    <div className="stack">
      {p.status === "NEW" && (
        <>
          <div className="panel stack">
            <strong>Одобрить</strong>
            <label className="field">
              Инструкция покупателю — придёт на почту
              <textarea className="textarea" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 150 }} maxLength={2000} />
            </label>
            <div className="muted small">
              {p.kind === "DEFECT" && p.resolution === "DISCOUNT"
                ? "Покупатель хочет скидку и оставляет товар: можно одобрить и сразу вернуть часть денег ниже — отправлять ничего не нужно."
                : "После одобрения дождитесь посылки, отметьте «Товар получен» и верните деньги."}
            </div>
            <div>
              <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => run(() => approveAction(p.id, answer))}>
                Одобрить
              </button>
            </div>
          </div>
        </>
      )}

      {p.status === "APPROVED" && (
        <div className="panel stack">
          <strong>Посылка пришла?</strong>
          <label className="check">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            <span>Вернуть товар на склад (если он в продаваемом виде)</span>
          </label>
          <div>
            <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => run(() => receiveAction(p.id, restock))}>
              Товар получен — на проверку мастеру
            </button>
          </div>
        </div>
      )}

      {(p.status === "APPROVED" || p.status === "RECEIVED") && (
        <>
          {!p.canRefund && <div className="panel muted small">Вернуть деньги может только владелец магазина — передайте ему заявку.</div>}
          {p.canRefund && (
          <div className="panel stack">
            <strong>{p.resolution === "DISCOUNT" ? "Вернуть часть денег (скидка)" : "Вернуть деньги"}</strong>
            <label className="field">
              Сумма, ₽{p.max != null ? ` (не больше ${p.max.toLocaleString("ru-RU")})` : ""}
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
            </label>
            {!p.restocked && p.status === "APPROVED" && (
              <label className="check">
                <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                <span>Вернуть товар на склад</span>
              </label>
            )}
            {p.hasBonuses && (
              <label className="check">
                <input type="checkbox" checked={bonuses} onChange={(e) => setBonuses(e.target.checked)} />
                <span>Вернуть бонусы, которыми платили за эти товары, и списать начисленные за них</span>
              </label>
            )}
            <label className="field">
              Комментарий покупателю — необязательно
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </label>
            <div>
              <button
                type="button"
                className="btn btn--gold btn--sm"
                disabled={pending}
                onClick={() =>
                  confirm(`Вернуть ${amount} ₽ покупателю через ЮKassa? Отменить возврат будет нельзя.`) &&
                  run(() => refundAction(p.id, Number(amount), restock && p.status === "APPROVED", bonuses, note))
                }
              >
                Вернуть деньги
              </button>
            </div>
          </div>
          )}
          <div className="panel stack">
            <strong>Завершить без возврата денег</strong>
            <div className="muted small">Например, обмен: отправили покупателю такой же товар.</div>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: отправили замену, трек 1234567890" maxLength={500} />
            <div>
              <button
                type="button"
                className="btn btn--line btn--sm"
                disabled={pending}
                onClick={() => run(() => completeAction(p.id, note, restock && p.status === "APPROVED"))}
              >
                Завершить
              </button>
            </div>
          </div>
        </>
      )}

      <div className="panel stack">
        <strong>Отклонить</strong>
        <textarea
          className="textarea"
          value={reject}
          onChange={(e) => setReject(e.target.value)}
          placeholder="Причина — её увидит покупатель. Например: прошло больше 7 дней с получения, у товара следы использования"
          style={{ minHeight: 90 }}
          maxLength={2000}
        />
        <div>
          <button
            type="button"
            className="btn btn--line btn--danger btn--sm"
            disabled={pending}
            onClick={() => confirm("Отклонить заявку?") && run(() => rejectAction(p.id, reject))}
          >
            Отклонить
          </button>
        </div>
      </div>

      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
    </div>
  );
}
