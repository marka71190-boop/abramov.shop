"use client";
import { useActionState, useState, useTransition } from "react";
import { adjustBonus, banUser, setRole, type ActionState } from "../../actions";
import { adminSetBirthday } from "../../shop-actions";

function Result({ state }: { state: ActionState }) {
  if (state.error) return <div className="form-error">{state.error}</div>;
  if (state.ok) return <div className="form-ok">{state.ok}</div>;
  return null;
}

export function BanForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(banUser, {});
  const [duration, setDuration] = useState("7");
  return (
    <form action={action} className="stack">
      <input type="hidden" name="userId" value={userId} />
      <label className="field">
        Причина — её увидит клиент в окне блокировки
        <textarea className="textarea" name="reason" required minLength={3} maxLength={500} style={{ minHeight: 80 }} />
      </label>
      <div className="form-grid">
        <label className="field">
          Срок
          <select className="select" name="duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
            <option value="1">1 день</option>
            <option value="3">3 дня</option>
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
            <option value="custom">До даты…</option>
            <option value="forever">Навсегда</option>
          </select>
        </label>
        {duration === "custom" && (
          <label className="field">
            Дата окончания
            <input className="input" type="date" name="until" required />
          </label>
        )}
      </div>
      <Result state={state} />
      <div>
        <button className="btn btn--danger btn--sm" disabled={pending}>
          {pending ? "Блокируем…" : "Заблокировать"}
        </button>
      </div>
    </form>
  );
}

export function BonusForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(adjustBonus, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="userId" value={userId} />
      <div className="form-grid">
        <label className="field">
          Сколько (минус — списать)
          <input className="input" name="amount" type="number" step="1" required placeholder="500" />
        </label>
        <label className="field" style={{ gridColumn: "span 2" }}>
          Комментарий
          <input className="input" name="comment" required placeholder="Компенсация за задержку доставки" />
        </label>
      </div>
      <Result state={state} />
      <div>
        <button className="btn btn--line btn--sm" disabled={pending}>
          Провести
        </button>
      </div>
    </form>
  );
}

export function RoleForm({ userId, role }: { userId: string; role: "CUSTOMER" | "MANAGER" | "OWNER" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="field" style={{ marginTop: 8 }}>
      Роль
      <select
        className="select"
        defaultValue={role}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value as typeof role;
          setError(null);
          start(async () => {
            try {
              await setRole(userId, v);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Не получилось");
            }
          });
        }}
      >
        <option value="CUSTOMER">Покупатель</option>
        <option value="MANAGER">Менеджер (доступ в админку)</option>
        <option value="OWNER">Владелец (всё, включая настройки)</option>
      </select>
      {error && <span className="form-error">{error}</span>}
    </label>
  );
}

export function BirthdayAdminForm({ userId, value }: { userId: string; value: string | null }) {
  const [state, action, pending] = useActionState(adminSetBirthday, {});
  return (
    <form action={action} className="row" style={{ alignItems: "center" }}>
      <input type="hidden" name="userId" value={userId} />
      <span className="muted">День рождения:</span>
      <input className="input" type="date" name="birthday" defaultValue={value ?? ""} style={{ width: "auto", minHeight: 36 }} />
      <button className="btn btn--line btn--sm" disabled={pending}>
        Сохранить
      </button>
      {state.error && <span className="small" style={{ color: "var(--c-danger)" }}>{state.error}</span>}
      {state.ok && <span className="small" style={{ color: "var(--c-success)" }}>{state.ok}</span>}
    </form>
  );
}
