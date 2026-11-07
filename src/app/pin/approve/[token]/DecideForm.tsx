"use client";
import { useActionState } from "react";
import type { DecideState } from "./actions";

/** Ввод PIN и «Подтвердить» / «Отклонить». action — серверное действие с уже привязанным запросом (по ссылке из письма или из админки) */
export function DecideForm({ action: decide, autoFocus = true }: { action: (s: DecideState, fd: FormData) => Promise<DecideState>; autoFocus?: boolean }) {
  const [state, action, pending] = useActionState<DecideState, FormData>(decide, {});
  if (state.final) return <div className={state.ok?.startsWith("Подтвержд") ? "form-ok" : "notice notice--muted"}>{state.ok}</div>;
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <label className="field">
        Ваш PIN
        <input
          className="input pin-input"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          autoFocus={autoFocus}
          onInput={(e) => (e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
        />
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn--gold" name="decision" value="APPROVE" disabled={pending}>
          {pending ? "Проверяем…" : "Подтвердить"}
        </button>
        <button className="btn btn--line" name="decision" value="DENY" disabled={pending} formNoValidate>
          Отклонить
        </button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Чтобы отклонить, PIN не нужен. 5 неверных PIN подряд — PIN заблокируется.
      </p>
    </form>
  );
}
