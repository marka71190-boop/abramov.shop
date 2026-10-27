"use client";
import { useState, useTransition } from "react";
import { quickAddAttribute, type QuickAttr } from "./actions";

/**
 * «+ Своя характеристика» — прямо в карточке товара или в таблице заполнения.
 * Без вложенной формы (живёт внутри формы товара): кнопка вызывает действие напрямую.
 */
export function NewAttribute({ categoryId, categoryName, onCreated }: { categoryId: string; categoryName?: string; onCreated: (a: QuickAttr, existed: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"select" | "number" | "text">("select");
  const [unit, setUnit] = useState("");
  const [options, setOptions] = useState("");
  const [forAll, setForAll] = useState(!categoryId);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();

  if (!open)
    return (
      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen(true)}>
          + Своя характеристика
        </button>
        {msg.ok && <span className="form-ok small">{msg.ok}</span>}
      </div>
    );

  const submit = () =>
    start(async () => {
      setMsg({});
      const r = await quickAddAttribute({ name, type, unit, options, categoryId, forAll });
      if (r.error || !r.attr) return setMsg({ error: r.error ?? "Не получилось" });
      onCreated(r.attr, !!r.existed);
      setMsg({ ok: r.existed ? `«${r.attr.name}» уже была — добавили сюда` : `«${r.attr.name}» добавлена` });
      setName("");
      setUnit("");
      setOptions("");
      setOpen(false);
    });

  return (
    <div className="new-attr stack" style={{ gap: 10 }}>
      <b>Новая характеристика</b>
      <div className="form-grid">
        <label className="field">
          Название
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Например: Покрытие"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>
        <label className="field">
          Что вписывать
          <select className="select" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="select">Выбор из вариантов</option>
            <option value="number">Число</option>
            <option value="text">Любой текст</option>
          </select>
        </label>
        {type === "number" && (
          <label className="field">
            Единица
            <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={12} placeholder="г, см, мм, шт" />
          </label>
        )}
      </div>
      {type === "select" && (
        <label className="field">
          Варианты через запятую
          <input className="input" value={options} onChange={(e) => setOptions(e.target.value)} maxLength={3000} placeholder="Лак, Масло, Воск" />
        </label>
      )}
      {categoryId && (
        <label className="check small">
          <input type="checkbox" checked={forAll} onChange={(e) => setForAll(e.target.checked)} />
          <span>Для всех товаров, а не только {categoryName ? `категории «${categoryName}»` : "этой категории"}</span>
        </label>
      )}
      {msg.error && <div className="form-error">{msg.error}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn--gold btn--sm" disabled={pending || name.trim().length < 2} onClick={submit}>
          {pending ? "Добавляем…" : "Добавить"}
        </button>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </div>
  );
}
