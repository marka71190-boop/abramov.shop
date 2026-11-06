"use client";
import { useActionState, useState, useTransition } from "react";
import { ROLE_HINTS, ROLE_LABELS, STAFF_ROLES } from "@/lib/roles";
import { adjustBonus, banUser, setAdminSections, setRoles, type ActionState } from "../../actions";
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

/** Роли сотрудника: можно отметить несколько */
export function RoleForm({ userId, roles, clubId, clubs, self }: { userId: string; roles: string[]; clubId: string | null; clubs: { id: string; name: string; city: string }[]; self: boolean }) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set(roles));
  const [club, setClub] = useState(clubId ?? "");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const owner = picked.has("OWNER");
  const dirty = [...picked].sort().join() !== [...roles].sort().join() || (picked.has("CLUB") && club !== (clubId ?? ""));
  const flip = (r: string) => {
    const n = new Set(picked);
    if (n.has(r)) n.delete(r);
    else n.add(r);
    setPicked(n);
    setMsg({});
  };
  return (
    <div className="stack" style={{ gap: 8, marginTop: 8 }}>
      <div>
        <strong>Роли</strong>
        <div className="muted small">Можно несколько: например, тренер и кассир. Ничего не отмечено — обычный покупатель.</div>
      </div>
      <div className="roles-grid">
        {STAFF_ROLES.map((r) => {
          // Касса и отчёты уже входят в старшие роли
          const impliedBy = owner && ["MANAGER", "DIRECTOR", "CASHIER"].includes(r) ? "Владельца" : picked.has("MANAGER") && r === "CASHIER" ? "Менеджера" : null;
          const implied = !!impliedBy;
          return (
            <label key={r} className={`check roles-grid__item${implied ? " is-implied" : ""}`} style={{ margin: 0 }}>
              <input type="checkbox" checked={picked.has(r) || implied} disabled={pending || implied || (self && r === "OWNER")} onChange={() => flip(r)} />
              <span>
                {ROLE_LABELS[r]}
                <span className="muted small"> — {impliedBy ? `уже входит в роль «${impliedBy}»` : ROLE_HINTS[r]}</span>
              </span>
            </label>
          );
        })}
      </div>
      {picked.has("CLUB") && (
        <label className="field" style={{ margin: 0 }}>
          Клуб администратора
          <select className="select" value={club} disabled={pending} onChange={(e) => setClub(e.target.value)}>
            <option value="">— выберите клуб —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}, {c.city}
              </option>
            ))}
          </select>
          <span className="muted small">Раздел «Клуб»: заказы на выдачу и кии для мастерской только этого клуба. Уведомления — в Telegram или на почту.</span>
        </label>
      )}
      {picked.has("CASHIER") && !owner && !picked.has("MANAGER") && (
        <span className="muted small">Кассир: касса на /kassa — цены не меняет, скидка в пределах лимита из «Финансов», оплаченные продажи не отменяет.</span>
      )}
      {picked.has("DIRECTOR") && !owner && !picked.has("MANAGER") && (
        <span className="muted small">Руководитель: финансы, аналитика, заказы, касса, склад — только просмотр. В Telegram — отчёты с прибылью и вечерняя сводка.</span>
      )}
      {picked.has("DIRECTOR") && picked.has("MANAGER") && !owner && (
        <span className="muted small">Менеджер + руководитель: работает в админке как менеджер и вдобавок видит финансы и аналитику.</span>
      )}
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <button
          type="button"
          className="btn btn--line btn--sm"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              setMsg(await setRoles(userId, [...picked], picked.has("CLUB") ? club : null));
            })
          }
        >
          {pending ? "Сохраняем…" : "Сохранить роли"}
        </button>
        {msg.ok && <span className="form-ok small">{msg.ok}</span>}
        {msg.error && <span className="form-error small">{msg.error}</span>}
      </div>
    </div>
  );
}

/** Разделы админки, которые видит менеджер */
export function SectionsForm({ userId, value, groups }: { userId: string; value: string[] | null; groups: { label: string; items: { key: string; label: string }[] }[] }) {
  const all = groups.flatMap((g) => g.items.map((i) => i.key));
  const [picked, setPicked] = useState<Set<string>>(new Set(value?.length ? value : all));
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const flip = (k: string) => {
    const n = new Set(picked);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setPicked(n);
    setMsg({});
  };
  return (
    <div className="stack" style={{ gap: 10, marginTop: 8 }}>
      <div>
        <strong>Разделы админки</strong>
        <div className="muted small">Сотрудник видит в меню и может открыть только отмеченное. «Обзор» открыт всегда, настройки и управление сайтом остаются только у владельца.</div>
      </div>
      <div className="sections-grid">
        {groups.map((g) => (
          <fieldset key={g.label} className="sections-grid__group">
            <legend className="muted small">{g.label}</legend>
            {g.items.map((i) => (
              <label key={i.key} className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={picked.has(i.key)} onChange={() => flip(i.key)} />
                <span>{i.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <button
          type="button"
          className="btn btn--line btn--sm"
          disabled={pending || !picked.size}
          onClick={() =>
            start(async () => {
              setMsg(await setAdminSections(userId, [...picked]));
            })
          }
        >
          {pending ? "Сохраняем…" : "Сохранить разделы"}
        </button>
        <button type="button" className="linklike small" onClick={() => setPicked(new Set(all))}>
          Отметить все
        </button>
        {!picked.size && <span className="small form-error">Отметьте хотя бы один раздел</span>}
        {msg.ok && <span className="form-ok small">{msg.ok}</span>}
        {msg.error && <span className="form-error small">{msg.error}</span>}
      </div>
    </div>
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
