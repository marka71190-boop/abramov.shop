"use client";
import { useActionState, useOptimistic, useTransition } from "react";
import { setRealEmail } from "./actions";

export function Toggle({ label, on, action }: { label: string; on: boolean; action: (v: boolean) => Promise<void> }) {
  const [optimistic, setOptimistic] = useOptimistic(on);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="toggle"
      aria-label={label}
      aria-pressed={optimistic}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await action(!optimistic);
        })
      }
    >
      <span />
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="btn btn--gold"
      onClick={async (e) => {
        const btn = e.currentTarget;
        await navigator.clipboard.writeText(text).catch(() => {});
        btn.textContent = "Скопировано";
        setTimeout(() => (btn.textContent = "Копировать"), 1600);
      }}
    >
      Копировать
    </button>
  );
}

export function RealEmailForm() {
  const [state, action, pending] = useActionState(setRealEmail, {});
  return (
    <form action={action} className="panel stack" style={{ borderColor: "var(--c-gold)" }}>
      <div>
        <strong>Укажите почту</strong>
        <div className="muted small">Вы вошли через VK ID без почты. На неё придут кассовые чеки и статусы заказов.</div>
      </div>
      <div className="row">
        <input className="input" type="email" name="email" required placeholder="you@example.com" style={{ flex: "1 1 240px", width: "auto" }} />
        <button className="btn btn--gold" disabled={pending}>
          Сохранить
        </button>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
    </form>
  );
}
