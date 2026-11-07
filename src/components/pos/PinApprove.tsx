"use client";
/**
 * Подтверждение менеджера для кассы: кассир выбирает менеджера и жмёт «Продать» / «Оформить возврат» —
 * открывается окно «Ждём подтверждения». Менеджеру уходит письмо, он открывает ссылку у себя,
 * вводит свой PIN и подтверждает. Касса сама продолжает, когда пришло подтверждение.
 */
import { useEffect, useRef, useState } from "react";
import { posApprovalCancel, posApprovalStatus } from "@/app/admin/pos/actions";

export function ApproverPick({ approvers, value, onChange, title }: { approvers: { id: string; name: string }[]; value: string; onChange: (id: string) => void; title: string }) {
  if (!approvers.length) {
    return <div className="form-error small">Ни у одного менеджера нет PIN. Задать его: Админка → «Касса» → «Мой PIN».</div>;
  }
  return (
    <div className="pin-approve stack" style={{ gap: 8 }}>
      <div className="small">
        <b>{title}</b>
        <div className="muted">Менеджеру придёт письмо: он откроет его у себя, введёт свой PIN и подтвердит.</div>
      </div>
      <label className="field" style={{ margin: 0 }}>
        Кто подтверждает
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— выберите менеджера —</option>
          {approvers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export interface WaitRequest {
  id: string;
  approver: string;
  expiresAt: string;
}

/** Окно «Ждём подтверждения»: опрашивает статус, по подтверждению вызывает onApproved */
export function ApprovalWait({
  request,
  what,
  onApproved,
  onClose,
  deniedHint = "Поменяйте скидку или оформите без неё.",
}: {
  request: WaitRequest;
  what: string;
  onApproved: () => Promise<void> | void;
  onClose: () => void;
  deniedHint?: string;
}) {
  const [status, setStatus] = useState("PENDING");
  const [left, setLeft] = useState(() => Math.max(0, Math.round((+new Date(request.expiresAt) - Date.now()) / 1000)));
  const done = useRef(false);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (stop || done.current) return;
      const r = await posApprovalStatus(request.id).catch(() => null);
      if (stop || done.current) return;
      if (r?.status === "APPROVED") {
        done.current = true;
        setStatus("APPROVED");
        try {
          navigator.vibrate?.(80);
        } catch {}
        await onApproved();
        return;
      }
      if (r && r.status !== "PENDING") {
        done.current = true;
        setStatus(r.status);
        return;
      }
      setTimeout(poll, 2000);
    };
    poll();
    const t = setInterval(() => setLeft(Math.max(0, Math.round((+new Date(request.expiresAt) - Date.now()) / 1000))), 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <div className="approval-wait" role="dialog" aria-modal="true" aria-label="Ждём подтверждения">
      <div className="approval-wait__box stack" style={{ gap: 14 }}>
        {status === "PENDING" && (
          <>
            <div className="approval-wait__spin" aria-hidden />
            <h2 className="h3" style={{ margin: 0 }}>
              Ждём подтверждения
            </h2>
            <p style={{ margin: 0 }}>
              {what}. Письмо отправлено: <b>{request.approver}</b>. Он откроет его у себя, введёт PIN и подтвердит — касса продолжит сама.
            </p>
            <div className="muted small">Запрос действует ещё {mm}</div>
            <button
              type="button"
              className="btn btn--line btn--sm"
              onClick={async () => {
                done.current = true;
                await posApprovalCancel(request.id).catch(() => {});
                onClose();
              }}
            >
              Отменить запрос
            </button>
          </>
        )}
        {status === "APPROVED" && (
          <>
            <h2 className="h3" style={{ margin: 0 }}>
              Подтверждено ✓
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              Проводим…
            </p>
          </>
        )}
        {(status === "DENIED" || status === "EXPIRED" || status === "CANCELLED" || status === "USED") && (
          <>
            <h2 className="h3" style={{ margin: 0 }}>
              {status === "DENIED" ? "Менеджер отклонил" : status === "EXPIRED" ? "Время вышло" : "Запрос отменён"}
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {status === "DENIED" ? deniedHint : "Можно отправить запрос ещё раз."}
            </p>
            <button type="button" className="btn btn--gold btn--sm" onClick={onClose}>
              Понятно
            </button>
          </>
        )}
      </div>
    </div>
  );
}
