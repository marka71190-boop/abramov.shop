"use client";
import { useActionState, useState } from "react";
import { HOME_FIELDS, type HomeContent, type HomeKey } from "@/lib/home-content-fields";
import { saveHomeAction } from "./actions";

export function HomeForm({ values }: { values: HomeContent }) {
  const [state, action, pending] = useActionState(saveHomeAction, {});
  const [v, setV] = useState<HomeContent>(values);
  const groups = [...new Set(HOME_FIELDS.map((f) => f.group))];
  const set = (k: HomeKey, val: string) => setV((cur) => ({ ...cur, [k]: val }));

  return (
    <form action={action} className="stack">
      {groups.map((g) => (
        <div key={g} className="panel stack">
          <h2 style={{ marginBottom: 0 }}>{g}</h2>
          <div className="form-grid" style={g.startsWith("Преимущества") ? { gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)" } : undefined}>
            {HOME_FIELDS.filter((f) => f.group === g).map((f) => {
              const changed = v[f.key] !== f.def;
              const lines = "lines" in f ? f.lines : 1;
              return (
                <label key={f.key} className="field" style={lines > 1 ? { gridColumn: "1 / -1" } : undefined}>
                  <span className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                    <span>{f.label}</span>
                    {changed && (
                      <button type="button" className="linklike small" onClick={() => set(f.key, f.def)}>
                        вернуть исходный
                      </button>
                    )}
                  </span>
                  {lines > 1 ? (
                    <textarea
                      className="textarea"
                      name={f.key}
                      value={v[f.key]}
                      onChange={(e) => set(f.key, e.target.value)}
                      maxLength={f.max}
                      rows={lines}
                      style={{ minHeight: lines * 28 + 24, paddingTop: 12 }}
                    />
                  ) : (
                    <input className="input" name={f.key} value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} maxLength={f.max} />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row">
        <button className="btn btn--gold" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <a className="btn btn--line" href="/" target="_blank" rel="noreferrer">
          Открыть главную
        </a>
      </div>
    </form>
  );
}
