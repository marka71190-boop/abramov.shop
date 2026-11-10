"use client";
import { useState, useTransition } from "react";
import { checkNowAction, testAlertAction } from "./actions";

export function HealthButtons() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => start(async () => (setMsg({}), await checkNowAction()))}>
          {pending ? "Проверяем…" : "Проверить сейчас"}
        </button>
        <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => start(async () => setMsg(await testAlertAction()))}>
          Прислать проверочное сообщение
        </button>
      </div>
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
      {msg.error && <div className="form-error">{msg.error}</div>}
    </div>
  );
}
