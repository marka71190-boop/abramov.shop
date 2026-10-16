"use client";
import { useActionState, useState } from "react";
import { purgeAction } from "./pd-actions";

const phrase = "УДАЛИТЬ";

export function PurgeForm() {
  const [state, action, pending] = useActionState(purgeAction, {});
  const [text, setText] = useState("");
  const ready = text.trim().toUpperCase() === phrase;
  return (
    <form
      action={action}
      className="stack"
      onSubmit={(e) => {
        if (!confirm("Удалить всех пользователей и обезличить заказы? Отменить нельзя.")) e.preventDefault();
      }}
    >
      <label className="field" style={{ maxWidth: 320 }}>
        Для подтверждения впишите {phrase}
        <input className="input" name="confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--danger" disabled={!ready || pending}>
          {pending ? "Удаляем…" : "Удалить данные пользователей"}
        </button>
      </div>
    </form>
  );
}
