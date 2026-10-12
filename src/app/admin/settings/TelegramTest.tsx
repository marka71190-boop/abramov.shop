"use client";
import { useActionState } from "react";
import { telegramTest } from "../shop-actions";

export function TelegramTest() {
  const [state, action, pending] = useActionState(telegramTest, {});
  return (
    <form action={action} className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
      <button className="btn btn--line btn--sm" disabled={pending}>
        {pending ? "…" : "Проверить"}
      </button>
      {state.error && <span className="small" style={{ color: "var(--c-danger)" }}>{state.error}</span>}
      {state.ok && <span className="small" style={{ color: "var(--c-success)" }}>{state.ok}</span>}
    </form>
  );
}
