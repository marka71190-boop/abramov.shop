"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { addExpense, deleteExpense, saveFinanceSettings, type FormState } from "./actions";

export function ExpenseForm({ categories, today }: { categories: string[]; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addExpense, {});
  const [cat, setCat] = useState(categories[0] ?? "");
  return (
    <form action={action} className="expense-form">
      <label className="field" style={{ margin: 0 }}>
        Дата
        <input className="input" type="date" name="day" defaultValue={today} required />
      </label>
      <label className="field" style={{ margin: 0 }}>
        Категория
        <input className="input" name="category" list="exp-cats" value={cat} onChange={(e) => setCat(e.target.value)} required maxLength={60} />
        <datalist id="exp-cats">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="field" style={{ margin: 0 }}>
        Сумма, ₽
        <input className="input" name="amount" inputMode="decimal" required placeholder="15000" />
      </label>
      <label className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
        Комментарий
        <input className="input" name="note" maxLength={300} placeholder="Например: таргет ВКонтакте, ноябрь" />
      </label>
      <div className="row" style={{ gap: 10, alignItems: "center", gridColumn: "1 / -1" }}>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Добавить расход"}
        </button>
        {state.ok && <span className="form-ok small">{state.ok}</span>}
        {state.error && <span className="form-error small">{state.error}</span>}
      </div>
    </form>
  );
}

export function DeleteExpense({ id }: { id: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="linklike small"
      disabled={pending}
      onClick={() => {
        if (!ask) return setAsk(true);
        start(async () => {
          await deleteExpense(id);
          router.refresh();
        });
      }}
    >
      {ask ? "Удалить?" : "Удалить"}
    </button>
  );
}

export function FinanceSettingsForm({ v }: { v: { feeYookassa: number; feeSbp: number; feeRobokassa: number; taxPercent: number; dailyReport: boolean; reportHour: number } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFinanceSettings, {});
  const num = (name: string, label: string, val: number, hint?: string) => (
    <label className="field" style={{ margin: 0 }}>
      {label}
      <input className="input" name={name} defaultValue={String(val).replace(".", ",")} inputMode="decimal" />
      {hint && <span className="muted small">{hint}</span>}
    </label>
  );
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <div className="expense-form" style={{ alignItems: "start" }}>
        {num("feeYookassa", "Комиссия ЮKassa (карты), %", v.feeYookassa, "Если ЮKassa не прислала точную сумму")}
        {num("feeSbp", "Комиссия за СБП, %", v.feeSbp)}
        {num("feeRobokassa", "Комиссия Робокассы, %", v.feeRobokassa)}
        {num("taxPercent", "Налог с выручки, %", v.taxPercent, "УСН «доходы» — 6; 0 — не учитывать")}
      </div>
      <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label className="check" style={{ margin: 0 }}>
          <input type="checkbox" name="dailyReport" defaultChecked={v.dailyReport} />
          <span>Присылать вечернюю сводку в Telegram в</span>
        </label>
        <select className="select" name="reportHour" defaultValue={v.reportHour} style={{ width: "auto" }} aria-label="Час сводки">
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
        <span className="muted small">по Москве</span>
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <button className="btn btn--line btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        {state.ok && <span className="form-ok small">{state.ok}</span>}
        {state.error && <span className="form-error small">{state.error}</span>}
      </div>
    </form>
  );
}
