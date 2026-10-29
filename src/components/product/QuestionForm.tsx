"use client";
import { useState, useTransition } from "react";
import { askQuestion } from "@/app/(shop)/product/actions";
import { goal } from "@/lib/track";

export function QuestionForm({ productId }: { productId: string }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="question-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await askQuestion({ productId, text });
          setMsg(r);
          if (r.ok) {
            setText("");
            goal("question_asked");
          }
        });
      }}
    >
      <label className="field" style={{ margin: 0 }}>
        <span className="sr-only">Ваш вопрос</span>
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Например: подойдёт ли этот кий для пула? Какой вес у древка?"
          style={{ minHeight: 84, paddingTop: 12 }}
          required
        />
      </label>
      <div className="row" style={{ gap: 12, justifyContent: "space-between" }}>
        <span className="small muted">Ответим в течение дня. Контакты в вопросе не пишите — ответ придёт на почту аккаунта</span>
        <button className="btn btn--gold btn--sm" disabled={pending || text.trim().length < 8}>
          {pending ? "Отправляем…" : "Задать вопрос"}
        </button>
      </div>
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
      {msg.error && <div className="form-error">{msg.error}</div>}
    </form>
  );
}
