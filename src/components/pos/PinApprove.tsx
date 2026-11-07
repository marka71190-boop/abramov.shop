"use client";
/** Подтверждение менеджером: выбрать себя и ввести 6-значный PIN (на телефоне кассира, при нём) */

export interface Approval {
  approverId: string;
  pin: string;
}

export function PinApprove({
  approvers,
  value,
  onChange,
  title,
}: {
  approvers: { id: string; name: string }[];
  value: Approval;
  onChange: (v: Approval) => void;
  title: string;
}) {
  if (!approvers.length) {
    return <div className="form-error small">Ни у одного менеджера нет PIN. Задать его: Админка → «Касса» → «Мой PIN».</div>;
  }
  return (
    <div className="pin-approve stack" style={{ gap: 8 }}>
      <div className="small">
        <b>{title}</b>
        <div className="muted">Менеджер вводит свой PIN сам. Ему придёт письмо о подтверждении.</div>
      </div>
      <div className="pos-grid">
        <label className="field" style={{ margin: 0 }}>
          Менеджер
          <select className="input" value={value.approverId} onChange={(e) => onChange({ ...value, approverId: e.target.value })}>
            <option value="">— кто подтверждает —</option>
            {approvers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          PIN
          <input
            className="input pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={value.pin}
            onChange={(e) => onChange({ ...value, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="••••••"
          />
        </label>
      </div>
    </div>
  );
}

export const approvalReady = (a: Approval) => !!a.approverId && /^\d{6}$/.test(a.pin);
