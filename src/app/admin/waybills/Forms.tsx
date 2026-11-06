"use client";
import { useActionState } from "react";
import { createShipmentsAction } from "../shop-actions";

/** «Отметить все» для списка с галочками name="id" внутри формы */
export function CheckAll({ form }: { form: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Отметить все"
      onChange={(e) => {
        const f = document.getElementById(form);
        f?.querySelectorAll<HTMLInputElement>('input[name="id"]').forEach((x) => (x.checked = e.target.checked));
      }}
    />
  );
}

/** Создание отправлений СДЭК пачкой: форма со списком, результат — над кнопкой */
export function CreateShipments({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  const [state, action, pending] = useActionState(createShipmentsAction, {});
  return (
    <form action={action} id="wb-create" className="stack" style={{ gap: 10 }}>
      {children}
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      {!disabled && (
        <button className="btn btn--gold btn--sm" disabled={pending} style={{ justifySelf: "start", alignSelf: "flex-start" }}>
          {pending ? "Создаём в СДЭК…" : "Создать отправления в СДЭК"}
        </button>
      )}
    </form>
  );
}
