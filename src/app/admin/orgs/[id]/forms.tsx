"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { addMember, orgDecision, removeMember, type OrgResult } from "../actions";

export function Decision({ id, status }: { id: string; status: "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED" }) {
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<OrgResult | null>(null);
  const [pending, start] = useTransition();
  const go = (s: "APPROVED" | "REJECTED" | "BLOCKED") => start(async () => setRes(await orgDecision(id, s, reason)));
  return (
    <div className="panel stack">
      <h2 style={{ marginBottom: 0 }}>Решение</h2>
      <label className="field">
        Причина (для отказа или блокировки — её увидит организация)
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Например: не нашли организацию в ЕГРЮЛ" />
      </label>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {status !== "APPROVED" && (
          <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => go("APPROVED")}>
            {status === "BLOCKED" ? "Открыть доступ снова" : "Одобрить"}
          </button>
        )}
        {status === "PENDING" && (
          <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => go("REJECTED")}>
            Отклонить
          </button>
        )}
        {status === "APPROVED" && (
          <button type="button" className="btn btn--danger btn--sm" disabled={pending} onClick={() => go("BLOCKED")}>
            Закрыть доступ
          </button>
        )}
      </div>
      {res?.error && <div className="form-error">{res.error}</div>}
      {res?.ok && <div className="form-ok">{res.ok}</div>}
    </div>
  );
}

export function Members({ id, members }: { id: string; members: { id: string; name: string; email: string }[] }) {
  const [email, setEmail] = useState("");
  const [res, setRes] = useState<OrgResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="panel stack">
      <h2 style={{ marginBottom: 0 }}>Сотрудники</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Все сотрудники организации видят оптовый каталог и могут заказывать по счёту. Добавить можно уже зарегистрированный на сайте аккаунт.
      </p>
      {members.map((m) => (
        <div key={m.id} className="row-line">
          <span>
            <Link href={`/admin/customers/${m.id}`}>{m.name}</Link> <span className="muted small">· {m.email}</span>
          </span>
          <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => start(async () => setRes(await removeMember(id, m.id)))}>
            Убрать
          </button>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Почта аккаунта сотрудника" style={{ maxWidth: 320 }} />
        <button type="button" className="btn btn--line btn--sm" disabled={pending || !email.includes("@")} onClick={() => start(async () => setRes(await addMember(id, email)))}>
          Добавить
        </button>
      </div>
      {res?.error && <div className="form-error">{res.error}</div>}
      {res?.ok && <div className="form-ok">{res.ok}</div>}
    </div>
  );
}
