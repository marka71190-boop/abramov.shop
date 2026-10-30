"use client";
import { useState, useTransition } from "react";
import { cancelMyTraining } from "./actions";

export function CancelTraining({ bookingId, label = "Отменить" }: { bookingId: string; label?: string }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  if (msg.ok) return <span className="small muted">{msg.ok}</span>;
  return (
    <span className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
      <button type="button" className="linklike small" disabled={pending} onClick={() => start(async () => setMsg(await cancelMyTraining(bookingId)))}>
        {pending ? "…" : label}
      </button>
      {msg.error && <span className="form-error small">{msg.error}</span>}
    </span>
  );
}
