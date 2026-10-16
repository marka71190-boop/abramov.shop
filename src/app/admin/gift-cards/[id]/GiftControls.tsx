"use client";
import { useState, useTransition } from "react";
import type { ActionState } from "../../actions";
import { refundGiftAction, resendGiftAction, voidGiftAction } from "../actions";

interface Props {
  id: string;
  active: boolean;
  canRefund: boolean;
  refundAmount: string; // «3 000 ₽»
  canResendBuyer: boolean;
  canSendRecipient: boolean;
}

export function GiftControls(p: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>({});
  const run = (fn: () => Promise<ActionState>) => start(async () => setMsg(await fn()));
  if (!p.active && !p.canResendBuyer && !msg.ok && !msg.error) return null;
  return (
    <div className="panel stack">
      <h2 style={{ marginBottom: 0 }}>Действия</h2>
      <div className="row">
        {p.canSendRecipient && (
          <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => run(() => resendGiftAction(p.id, "recipient"))}>
            Отправить получателю сейчас
          </button>
        )}
        {p.canResendBuyer && (
          <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => run(() => resendGiftAction(p.id, "buyer"))}>
            Письмо покупателю ещё раз
          </button>
        )}
        {p.canRefund && (
          <button
            type="button"
            className="btn btn--danger btn--sm"
            disabled={pending}
            onClick={() =>
              confirm(`Вернуть покупателю ${p.refundAmount} через ЮKassa и закрыть сертификат? Отменить нельзя.`) && run(() => refundGiftAction(p.id))
            }
          >
            Вернуть деньги за остаток · {p.refundAmount}
          </button>
        )}
        {p.active && (
          <button
            type="button"
            className="btn btn--line btn--sm"
            disabled={pending}
            onClick={() => confirm("Аннулировать сертификат? Им больше нельзя будет платить. Деньги при этом не возвращаются.") && run(() => voidGiftAction(p.id))}
          >
            Аннулировать
          </button>
        )}
      </div>
      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
    </div>
  );
}
