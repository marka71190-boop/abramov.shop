"use client";
import { useActionState } from "react";
import { addEventAction, type FormState } from "./actions";

/** Запись в историю кия: обслуживание в мастерской или заметка */
export function EventForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addEventAction, {});
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="id" value={id} />
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <select className="input" name="kind" style={{ maxWidth: 200 }} defaultValue="SERVICE">
          <option value="SERVICE">🔧 Обслуживание</option>
          <option value="NOTE">📝 Заметка</option>
        </select>
        <input className="input" name="service" placeholder="Заявка мастерской RM-… (необязательно)" maxLength={30} style={{ maxWidth: 260 }} />
      </div>
      <input className="input" name="text" required maxLength={300} placeholder="Например: замена наклейки, выравнивание шафта" />
      <p className="muted small" style={{ margin: 0 }}>
        Запись увидит любой, кто откроет паспорт, — без имён и телефонов.
      </p>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <button className="btn btn--line btn--sm" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "…" : "Добавить в историю"}
      </button>
    </form>
  );
}
