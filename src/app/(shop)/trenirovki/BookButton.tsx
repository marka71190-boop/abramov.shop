"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { goal } from "@/lib/track";
import { bookTraining, cancelMyTraining } from "./actions";

export function BookButton({ slotId, left, signedIn, next, mineId }: { slotId: string; left: number; signedIn: boolean; next: string; mineId: string | null }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [booked, setBooked] = useState(!!mineId);
  const [pending, start] = useTransition();

  if (booked && mineId)
    return (
      <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
        <span className="pill pill--ok">Вы записаны</span>
        <button
          type="button"
          className="linklike small"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await cancelMyTraining(mineId);
              setMsg(r);
              if (r.ok) setBooked(false);
            })
          }
        >
          Отменить запись
        </button>
        {msg.error && <span className="form-error small">{msg.error}</span>}
      </div>
    );
  if (msg.ok)
    return (
      <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
        <span className="pill pill--ok">Вы записаны</span>
        <span className="small muted">{msg.ok}</span>
      </div>
    );
  if (left <= 0) return <span className="pill">Мест нет</span>;
  if (!signedIn)
    return (
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn--gold btn--sm">
        Записаться
      </Link>
    );
  if (!open)
    return (
      <button type="button" className="btn btn--gold btn--sm" onClick={() => setOpen(true)}>
        Записаться
      </button>
    );
  return (
    <div className="book-box">
      <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Пожелание тренеру (необязательно): уровень, что подтянуть" />
      <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="linklike small" onClick={() => setOpen(false)}>
          Отмена
        </button>
        <button
          type="button"
          className="btn btn--gold btn--sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await bookTraining(slotId, comment);
              setMsg(r);
              if (r.ok) goal("training_booked");
            })
          }
        >
          {pending ? "Записываем…" : "Подтвердить запись"}
        </button>
      </div>
      {msg.error && <div className="form-error small">{msg.error}</div>}
    </div>
  );
}
