"use client";
import { useState, useTransition } from "react";
import { mailDnsCheck } from "../shop-actions";

type R = Awaited<ReturnType<typeof mailDnsCheck>>;

/** Кнопка «Проверить DKIM, SPF, DMARC» и результат по каждой записи */
export function MailDnsCheck() {
  const [res, setRes] = useState<R | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <button
          type="button"
          className="btn btn--line btn--sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null);
              try {
                setRes(await mailDnsCheck());
              } catch {
                setErr("Не удалось проверить — попробуйте ещё раз");
              }
            })
          }
        >
          {pending ? "Проверяем DNS…" : "Проверить DKIM, SPF, DMARC"}
        </button>
        {res && <span className="small muted">домен {res.domain}</span>}
      </div>
      {err && <div className="form-error small">{err}</div>}
      {res && (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {res.checks.map((c) => (
                <tr key={c.title}>
                  <td style={{ width: 28 }}>
                    <span className={`pill ${c.ok && !c.warn ? "pill--ok" : c.ok || c.warn ? "" : "pill--bad"}`}>{c.ok && !c.warn ? "✓" : c.ok || c.warn ? "!" : "✕"}</span>
                  </td>
                  <td>
                    <b>{c.title}</b>
                    <div className="small muted">{c.host}</div>
                    {c.value && <div className="small" style={{ wordBreak: "break-all", fontFamily: "monospace", marginTop: 4 }}>{c.value}</div>}
                    <div className="small" style={{ marginTop: 4 }}>{c.note}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
