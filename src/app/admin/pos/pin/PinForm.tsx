"use client";
import { useActionState, useState } from "react";
import { pinConfirmAction, pinRequestAction, type PinState } from "../pin-actions";

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [req, reqAction, reqPending] = useActionState<PinState, FormData>(pinRequestAction, {});
  const [conf, confAction, confPending] = useActionState<PinState, FormData>(pinConfirmAction, {});
  const [again, setAgain] = useState(false);
  const digits = (e: React.FormEvent<HTMLInputElement>) => (e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 6));

  if (conf.step === "done") return <div className="form-ok">{conf.ok}</div>;

  if (req.step === "code" && !again) {
    return (
      <form action={confAction} className="stack" style={{ gap: 12, maxWidth: 420 }}>
        <div className="form-ok">{req.ok}</div>
        <label className="field">
          Код из письма
          <input className="input pin-input" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} onInput={digits} autoFocus required />
        </label>
        {conf.error && <div className="form-error">{conf.error}</div>}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--gold btn--sm" disabled={confPending}>
            {confPending ? "Проверяем…" : "Подтвердить PIN"}
          </button>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setAgain(true)}>
            Задать другой PIN
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={(fd) => (setAgain(false), reqAction(fd))} className="stack" style={{ gap: 12, maxWidth: 420 }}>
      <div className="form-grid">
        <label className="field">
          {hasPin ? "Новый PIN" : "PIN"} — 6 цифр
          <input className="input pin-input" name="pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} onInput={digits} required />
        </label>
        <label className="field">
          Ещё раз
          <input className="input pin-input" name="pin2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} onInput={digits} required />
        </label>
      </div>
      {req.error && <div className="form-error">{req.error}</div>}
      <button className="btn btn--gold btn--sm" disabled={reqPending} style={{ justifySelf: "start", alignSelf: "flex-start" }}>
        {reqPending ? "Отправляем код…" : "Получить код на почту"}
      </button>
    </form>
  );
}
