"use client";
import { useState, useTransition } from "react";
import { clubAction, type ClubOp } from "./actions";

/** Кнопка действия в разделе клуба: подтверждение, ожидание, результат */
export function ClubButton({ op, id, label, confirmText, primary = true }: { op: ClubOp; id: string; label: string; confirmText?: string; primary?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  return (
    <div className="club-btn">
      <button
        type="button"
        className={`btn ${primary ? "btn--gold" : "btn--line"} btn--sm`}
        disabled={pending || !!msg?.ok}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          setMsg(null);
          start(async () => setMsg(await clubAction(op, id)));
        }}
      >
        {pending ? "Минуту…" : msg?.ok ? "Готово ✓" : label}
      </button>
      {msg?.error && <span className="form-error small">{msg.error}</span>}
    </div>
  );
}
