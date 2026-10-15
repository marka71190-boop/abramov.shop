"use client";
import { useState, useTransition } from "react";
import { conclusionAction, type ReturnActionState } from "../actions";

export function ConclusionForm({ id, initial }: { id: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ReturnActionState>({});
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="field">
        Заключение мастера — увидит покупатель
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          style={{ minHeight: 100 }}
          placeholder="Например: трещина на шафте от удара — механическое повреждение, не производственный брак. Серийный номер и пломба совпадают с отправкой."
        />
      </label>
      <div>
        <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => start(async () => setMsg(await conclusionAction(id, text)))}>
          Сохранить заключение
        </button>
      </div>
      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
    </div>
  );
}
