"use client";
import { useActionState } from "react";
import { installStandard } from "./actions";

export function InstallStandard() {
  const [state, action, pending] = useActionState(installStandard, {});
  return (
    <form action={action} className="panel stack" style={{ gap: 8 }}>
      <b>Стандартные характеристики для бильярдных товаров</b>
      <div className="small muted">
        Кии — игра, уровень, длина, вес, наклейка, жёсткость, конструкция, древко, турняк, запилы, баланс, соединение, ручная работа, чехол. Наклейки —
        диаметр, жёсткость, слои. Мел — штук в упаковке. Шары — диаметр, комплект. Сукно — ширина, плотность, шерсть. Столы — размер, плита. Перчатки и
        одежда — размер, рука. Чехлы — сколько киёв вмещает. Каждая характеристика добавится только к своей категории; уже заполненное не меняется.
        Создали новую категорию (например, «Шары») — нажмите ещё раз.
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Добавляем…" : "Добавить стандартные"}
        </button>
        {state.ok && <span className="form-ok small">{state.ok}</span>}
        {state.error && <span className="form-error small">{state.error}</span>}
      </div>
    </form>
  );
}
