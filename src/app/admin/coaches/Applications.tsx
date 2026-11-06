"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewApplication } from "./actions";

export interface AppView {
  id: string;
  createdAt: string;
  fullName: string;
  phone: string;
  email: string;
  city: string | null;
  rank: string | null;
  games: string[];
  coachYears: number | null;
  achievements: string | null;
  about: string | null;
  clubs: string[];
  price: number | null;
  links: string | null;
}

function One({ a, canDecide }: { a: AppView; canDecide: boolean }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const go = (d: "APPROVE" | "REJECT") =>
    start(async () => {
      const r = await reviewApplication(a.id, d, reply);
      setMsg(r);
      if (r.ok) router.refresh();
    });
  return (
    <article className="panel stack" style={{ gap: 10, padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <strong>{a.fullName}</strong>
          <div className="muted small">
            {[a.rank, a.city, a.coachYears != null ? `тренирует ${a.coachYears} лет` : null, a.price ? `${(a.price / 100).toLocaleString("ru-RU")} ₽/час` : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="small" style={{ textAlign: "right" }}>
          <a href={`tel:${a.phone}`}>{a.phone}</a>
          <div className="muted">{a.email}</div>
        </div>
      </div>
      {a.games.length > 0 && <div className="small">Игры: {a.games.join(", ")}</div>}
      <div className="small">Клубы: {a.clubs.join("; ") || "—"}</div>
      {a.about && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{a.about}</p>}
      {a.achievements && <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>Достижения: {a.achievements}</p>}
      {a.links && <div className="small muted">Ссылки: {a.links}</div>}
      <div className="small muted">Подана {a.createdAt} · согласился, что тренировки только в наших клубах</div>
      {canDecide && !msg.ok && (
        <>
          <label className="field" style={{ margin: 0 }}>
            Ответ заявителю (необязательно)
            <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} placeholder="Например: созвонимся по поводу расписания / почему отказ" />
          </label>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => go("APPROVE")}>
              Одобрить — сделать тренером
            </button>
            <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => go("REJECT")}>
              Отклонить
            </button>
          </div>
        </>
      )}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
      {msg.error && <div className="form-error">{msg.error}</div>}
    </article>
  );
}

export function Applications({ list, canDecide }: { list: AppView[]; canDecide: boolean }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      {list.map((a) => (
        <One key={a.id} a={a} canDecide={canDecide} />
      ))}
    </div>
  );
}
