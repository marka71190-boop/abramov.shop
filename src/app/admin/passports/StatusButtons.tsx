"use client";
import { useTransition } from "react";
import { detachAction, statusAction } from "./actions";

export function StatusButtons({ id, active, hasOwner }: { id: string; active: boolean; hasOwner: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {hasOwner && (
        <button
          type="button"
          className="btn btn--line btn--sm"
          disabled={pending}
          onClick={() => window.confirm("Отвязать владельца? Старый код карточки перестанет работать — распечатайте новую карточку.") && start(() => detachAction(id))}
        >
          Отвязать владельца
        </button>
      )}
      <button
        type="button"
        className="btn btn--line btn--sm"
        disabled={pending}
        onClick={() => window.confirm(active ? "Аннулировать паспорт? В нём будет написано, что он недействителен." : "Восстановить паспорт?") && start(() => statusAction(id, active ? "VOID" : "ACTIVE"))}
      >
        {active ? "Аннулировать" : "Восстановить"}
      </button>
    </div>
  );
}
