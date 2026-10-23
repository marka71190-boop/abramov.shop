"use client";
import { useState, useTransition } from "react";
import { updateTurnkeyRequest } from "../actions";

const OPTIONS = [
  ["NEW", "Новая"],
  ["IN_WORK", "В работе"],
  ["OFFER", "КП отправлено"],
  ["WON", "Договор"],
  ["LOST", "Отказ"],
] as const;

export function RequestControls({ id, status, note }: { id: string; status: string; note: string }) {
  const [st, setSt] = useState(status);
  const [n, setN] = useState(note);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="panel stack">
      <h2 style={{ marginBottom: 0 }}>Работа с заявкой</h2>
      <label className="field">
        Статус
        <select className="select" value={st} onChange={(e) => setSt(e.target.value)}>
          {OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Заметка менеджера (клиент не видит)
        <textarea className="textarea" value={n} onChange={(e) => setN(e.target.value)} style={{ minHeight: 90, paddingTop: 10 }} />
      </label>
      {res?.error && <div className="form-error">{res.error}</div>}
      {res?.ok && <div className="form-ok">{res.ok}</div>}
      <button type="button" className="btn btn--gold btn--sm" style={{ justifySelf: "start" }} disabled={pending} onClick={() => start(async () => setRes(await updateTurnkeyRequest(id, st, n)))}>
        Сохранить
      </button>
    </div>
  );
}
