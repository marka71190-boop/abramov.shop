"use client";
import { useActionState, useState } from "react";
import { deleteAttribute, saveAttribute } from "./actions";

interface A {
  id: string;
  name: string;
  key: string;
  unit: string;
  type: "number" | "select" | "text";
  options: string[];
  categoryIds: string[];
  filterable: boolean;
  sortOrder: number;
}

export function AttributeForm({ attr, cats, used, canDelete = false }: { attr: A | null; cats: { id: string; name: string }[]; used: number; canDelete?: boolean }) {
  const [state, action, pending] = useActionState(saveAttribute, {});
  const [type, setType] = useState(attr?.type ?? "select");
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      {attr && <input type="hidden" name="id" value={attr.id} />}
      {attr && <span className="muted small">Заполнено у {used} товаров</span>}
      <div className="form-grid">
        <label className="field">
          Название
          <input className="input" name="name" defaultValue={attr?.name ?? ""} required maxLength={60} placeholder="Например: Покрытие" />
        </label>
        <label className="field">
          Что вписывать
          <select className="select" name="type" value={type} onChange={(e) => setType(e.target.value as A["type"])}>
            <option value="select">Выбор из вариантов (фильтр галочками)</option>
            <option value="number">Число (фильтр «от–до»)</option>
            <option value="text">Любой текст (только в карточке)</option>
          </select>
        </label>
        {type === "number" && (
          <label className="field">
            Единица
            <input className="input" name="unit" defaultValue={attr?.unit ?? ""} maxLength={12} placeholder="г, см, мм, шт" />
          </label>
        )}
      </div>
      {type === "select" && (
        <label className="field">
          Варианты — по одному в строке или через запятую
          <textarea className="textarea" name="options" defaultValue={attr?.options.join("\n") ?? ""} style={{ minHeight: 90, paddingTop: 10 }} />
        </label>
      )}
      {cats.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="label">Для категорий (ничего не отмечено — для всех)</div>
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            {cats.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={attr?.categoryIds.includes(c.id)} />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {type !== "text" && (
        <label className="check">
          <input type="checkbox" name="filterable" defaultChecked={attr?.filterable ?? true} />
          <span>Показывать в фильтрах каталога</span>
        </label>
      )}
      <details className="small">
        <summary className="muted">Дополнительно</summary>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label className="field">
            Код для адреса фильтра (латиницей)
            <input className="input" name="key" defaultValue={attr?.key ?? ""} maxLength={40} placeholder="заполнится сам" />
          </label>
          <label className="field">
            Порядок (меньше — выше)
            <input className="input" name="sortOrder" type="number" defaultValue={attr?.sortOrder ?? 0} />
          </label>
        </div>
      </details>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {attr ? "Сохранить" : "Добавить"}
        </button>
        {attr && canDelete && (
          <button type="button" className="btn btn--danger btn--sm" onClick={() => confirm(`Удалить «${attr.name}»? Значения у товаров тоже удалятся.`) && deleteAttribute(attr.id).then(() => location.reload())}>
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
