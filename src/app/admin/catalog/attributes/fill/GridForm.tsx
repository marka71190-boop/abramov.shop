"use client";
import { useActionState, useMemo, useState } from "react";
import { saveGrid } from "../actions";

type A = { id: string; name: string; unit: string; type: "number" | "select" | "text"; options: string[] };
type P = { id: string; name: string; sku: string | null; visibility: string };

export function GridForm({ categoryId, products, attrs, values }: { categoryId: string; products: P[]; attrs: A[]; values: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveGrid, {});
  const [v, setV] = useState(values);
  const [dirty, setDirty] = useState(false);
  // Набор строк фиксируем в момент включения фильтра — строка не исчезает, пока её заполняют
  const [onlyEmpty, setOnlyEmpty] = useState<Set<string> | null>(null);
  const set = (k: string, x: string) => {
    setV((o) => ({ ...o, [k]: x }));
    setDirty(true);
  };
  const filled = useMemo(() => Object.fromEntries(attrs.map((a) => [a.id, products.filter((p) => (v[`${p.id}:${a.id}`] ?? "").trim()).length])), [attrs, products, v]);
  const total = attrs.length * products.length;
  const done = Object.values(filled).reduce((x, y) => x + y, 0);
  const rows = onlyEmpty ? products.filter((p) => onlyEmpty.has(p.id)) : products;

  return (
    <form
      action={(fd) => {
        setDirty(false);
        action(fd);
      }}
      className="stack"
      style={{ gap: 12 }}
    >
      <input type="hidden" name="categoryId" value={categoryId} />
      {/* Скрытые строки тоже отправляем, чтобы фильтр «только незаполненные» не стирал значения */}
      {products
        .filter((p) => !rows.includes(p))
        .flatMap((p) => attrs.map((a) => <input key={`${p.id}:${a.id}`} type="hidden" name={`v:${p.id}:${a.id}`} value={v[`${p.id}:${a.id}`] ?? ""} />))}
      <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div className="small muted">
          Заполнено {done} из {total} ({total ? Math.round((done / total) * 100) : 0}%)
        </div>
        <label className="check small">
          <input
            type="checkbox"
            checked={!!onlyEmpty}
            onChange={(e) =>
              setOnlyEmpty(e.target.checked ? new Set(products.filter((p) => attrs.some((a) => !(v[`${p.id}:${a.id}`] ?? "").trim())).map((p) => p.id)) : null)
            }
          />
          <span>Только товары с пустыми полями</span>
        </label>
      </div>
      <div className="table-wrap attr-grid">
        <table className="table">
          <thead>
            <tr>
              <th className="attr-grid__name">Товар</th>
              {attrs.map((a) => (
                <th key={a.id}>
                  {a.name}
                  {a.unit && <span className="muted">, {a.unit}</span>}
                  <div className="small" style={{ fontWeight: 400, color: filled[a.id] === products.length ? "var(--c-success)" : "var(--c-dim)" }}>
                    {filled[a.id]}/{products.length}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="attr-grid__name">
                  <a href={`/admin/catalog/product/${p.id}`} target="_blank" rel="noreferrer">
                    {p.name}
                  </a>
                  {p.sku && <div className="muted small">{p.sku}</div>}
                </td>
                {attrs.map((a) => {
                  const k = `${p.id}:${a.id}`;
                  const val = v[k] ?? "";
                  const props = { name: `v:${k}`, "aria-label": `${p.name} — ${a.name}`, className: `input input--sm${val ? "" : " is-empty"}` };
                  return (
                    <td key={a.id}>
                      {a.type === "select" ? (
                        <select {...props} className={`select input--sm${val ? "" : " is-empty"}`} value={val} onChange={(e) => set(k, e.target.value)}>
                          <option value="">—</option>
                          {a.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                          {val && !a.options.includes(val) && <option value={val}>{val}</option>}
                        </select>
                      ) : (
                        <input {...props} inputMode={a.type === "number" ? "decimal" : undefined} value={val} onChange={(e) => set(k, e.target.value)} maxLength={200} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && !dirty && <div className="form-ok">{state.ok}</div>}
      <div className="row attr-grid__save">
        <button className="btn btn--gold" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить всё"}
        </button>
        {dirty && <span className="small muted">Есть несохранённые изменения</span>}
      </div>
    </form>
  );
}
