"use client";
import { useActionState, useState } from "react";
import { issueGiftAction } from "./actions";

export function IssueForm({ defaultExpires }: { defaultExpires: string }) {
  const [state, action, pending] = useActionState(issueGiftAction, {});
  const [forever, setForever] = useState(false);
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="stack">
      <div className="form-grid">
        <label className="field">
          Сумма, ₽
          <input className="input" name="amount" type="number" min={1} required />
        </label>
        <label className="field">
          Действует до
          <input className="input" name="expires" type="date" defaultValue={defaultExpires} disabled={forever} />
        </label>
        <label className="check" style={{ alignSelf: "end", minHeight: 48 }}>
          <input type="checkbox" name="forever" checked={forever} onChange={(e) => setForever(e.target.checked)} />
          <span>Бессрочно</span>
        </label>
        <label className="field">
          Для кого — необязательно
          <input className="input" name="recipientName" maxLength={60} />
        </label>
        <label className="field">
          От кого
          <input className="input" name="senderName" maxLength={60} defaultValue="Abramov Shop" />
        </label>
        <label className="field">
          Почта получателя — отправим сертификат
          <input className="input" name="recipientEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {email && (
          <label className="field">
            Отправить в день (10:00 МСК) — пусто: сразу
            <input className="input" name="sendDate" type="date" />
          </label>
        )}
      </div>
      <label className="field">
        Пожелание — будет на сертификате
        <textarea className="textarea" name="message" maxLength={300} style={{ minHeight: 70, paddingTop: 12 }} />
      </label>
      <label className="field">
        Заметка для себя (видна только в админке): за что, кому продан, номер чека
        <input className="input" name="note" maxLength={300} />
      </label>
      <p className="muted small" style={{ margin: 0 }}>
        Сертификат из админки сразу действует. Если вы продаёте его за наличные или переводом — чек пробейте сами: сайт его не отправит.
      </p>
      {state.error && <div className="form-error">{state.error}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Выпускаем…" : "Выпустить сертификат"}
        </button>
      </div>
    </form>
  );
}
