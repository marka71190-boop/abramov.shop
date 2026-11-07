"use client";
import { useState, useTransition } from "react";
import { ownStockAction } from "../actions";

export function OwnStockToggle({ clubId, on, disabled }: { clubId: string; on: boolean; disabled?: boolean }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <span className="stack" style={{ gap: 4 }}>
      <button
        type="button"
        className="toggle"
        aria-pressed={on}
        aria-label="Свой учёт остатков в клубе"
        disabled={pending || disabled}
        onClick={() => {
          if (!on && !confirm("Включить учёт остатков в клубе? Касса клуба будет продавать только то, что вы привезёте туда перемещением со склада.")) return;
          start(async () => setMsg(await ownStockAction(clubId, !on)));
        }}
      >
        <span />
      </button>
      {msg.error && <span className="small is-loss">{msg.error}</span>}
      {msg.ok && <span className="small form-ok-text">{msg.ok}</span>}
    </span>
  );
}
