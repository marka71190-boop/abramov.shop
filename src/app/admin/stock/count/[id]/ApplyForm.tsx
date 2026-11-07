"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { countApplyAction, countCancelAction } from "../actions";

/** Провести ревизию: остатки клуба станут такими, как насчитали */
export function ApplyForm({ id, full: initialFull, readonly }: { id: string; full: boolean; readonly: boolean }) {
  const router = useRouter();
  const [full, setFull] = useState(initialFull);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  if (msg.ok) return <div className="form-ok">{msg.ok}</div>;
  return (
    <div className="panel stack" style={{ gap: 10 }}>
      <label className="check">
        <input
          type="checkbox"
          checked={full}
          onChange={(e) => {
            setFull(e.target.checked);
            const u = new URL(window.location.href);
            u.searchParams.set("full", e.target.checked ? "1" : "0");
            router.replace(u.pathname + u.search, { scroll: false });
          }}
        />
        <span>Полный пересчёт: что не отсканировали — списать как недостачу</span>
      </label>
      <p className="muted small" style={{ margin: 0 }}>
        Остатки клуба станут такими, как насчитали. Проводите сразу после пересчёта: продажи после него уже учтены в остатке, и их разница попадёт в расхождение.
      </p>
      {msg.error && <div className="form-error">{msg.error}</div>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn--gold"
          disabled={pending || readonly}
          onClick={() =>
            start(async () => {
              const r = await countApplyAction(id, full);
              setMsg(r);
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? "Проводим…" : "Провести ревизию"}
        </button>
        <button
          type="button"
          className="btn btn--line"
          disabled={pending || readonly}
          onClick={() =>
            start(async () => {
              const r = await countCancelAction(id);
              setMsg(r.ok ? { ok: "Ревизия отменена — остатки не менялись" } : r);
              router.refresh();
            })
          }
        >
          Отменить
        </button>
      </div>
    </div>
  );
}
