"use client";
import { useActionState } from "react";
import { moderateReview } from "../shop-actions";

export function ReviewModeration({ id, status, reply }: { id: string; status: string; reply: string | null }) {
  const [state, action, pending] = useActionState(moderateReview, {});
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="id" value={id} />
      <textarea className="textarea" name="reply" defaultValue={reply ?? ""} placeholder="Ответ магазина (необязательно) — будет виден под отзывом" style={{ minHeight: 60, paddingTop: 10 }} />
      <div className="row">
        {status !== "APPROVED" && (
          <button className="btn btn--gold btn--sm" name="op" value="approve" disabled={pending}>
            Опубликовать
          </button>
        )}
        {status === "APPROVED" && (
          <button className="btn btn--line btn--sm" name="op" value="reply" disabled={pending}>
            Сохранить ответ
          </button>
        )}
        {status !== "REJECTED" && (
          <button className="btn btn--line btn--sm" name="op" value="reject" disabled={pending}>
            Отклонить
          </button>
        )}
        <button
          className="btn btn--danger btn--sm"
          name="op"
          value="delete"
          disabled={pending}
          onClick={(e) => {
            if (!confirm("Удалить отзыв безвозвратно?")) e.preventDefault();
          }}
        >
          Удалить
        </button>
        {state.error && <span className="small" style={{ color: "var(--c-danger)" }}>{state.error}</span>}
        {state.ok && <span className="small" style={{ color: "var(--c-success)" }}>{state.ok}</span>}
      </div>
    </form>
  );
}
