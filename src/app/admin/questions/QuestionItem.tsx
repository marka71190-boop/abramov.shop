"use client";
import { useActionState } from "react";
import { deleteQuestion, saveQuestion } from "./actions";

interface Q {
  id: string;
  text: string;
  answer: string | null;
  status: "NEW" | "PUBLISHED" | "HIDDEN";
}

export function QuestionItem({ q, canDelete }: { q: Q; canDelete: boolean }) {
  const [state, action, pending] = useActionState(saveQuestion, {});
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="id" value={q.id} />
      <label className="field">
        Вопрос — можно поправить опечатки или убрать контакты
        <textarea className="textarea" name="text" defaultValue={q.text} maxLength={1000} style={{ minHeight: 60, paddingTop: 10 }} />
      </label>
      <label className="field">
        Ответ
        <textarea className="textarea" name="answer" defaultValue={q.answer ?? ""} maxLength={3000} style={{ minHeight: 90, paddingTop: 10 }} placeholder="Ответ увидят все покупатели, автору придёт письмо" />
      </label>
      <label className="check">
        <input type="checkbox" name="publish" defaultChecked={q.status !== "HIDDEN"} />
        <span>Показать вопрос и ответ на странице товара</span>
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : q.answer ? "Сохранить" : "Ответить"}
        </button>
        {canDelete && (
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={() => {
              if (confirm("Удалить вопрос?")) void deleteQuestion(q.id);
            }}
          >
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
