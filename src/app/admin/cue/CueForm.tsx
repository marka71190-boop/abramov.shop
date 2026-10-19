"use client";
import { useActionState, useState } from "react";
import { SPLICE_PATTERNS, type CueConfig, type CueGroupId, type SplicePattern } from "@/lib/cue-config";
import { saveCueAction } from "./actions";

type OptF = { id: string; name: string; price: string; color: string; pattern?: SplicePattern; hidden: boolean };
type GroupF = { id: CueGroupId; title: string; help: string; hidden: boolean; options: OptF[]; price: string; maxLength: string };

const rubStr = (k: number | undefined) => (k == null ? "" : String(k / 100));
const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", ".")) || 0;
const newId = (taken: string[]) => {
  for (;;) {
    const id = Math.random().toString(36).slice(2, 6);
    if (!taken.includes(id)) return id;
  }
};

export function CueForm({ initial, meta }: { initial: CueConfig; meta: { id: CueGroupId; title: string; color: boolean; text?: boolean; pattern?: boolean }[] }) {
  const [state, action, pending] = useActionState(saveCueAction, {});
  const [enabled, setEnabled] = useState(initial.enabled);
  const [title, setTitle] = useState(initial.title);
  const [intro, setIntro] = useState(initial.intro);
  const [base, setBase] = useState(rubStr(initial.basePrice));
  const [lead, setLead] = useState(String(initial.leadDays));
  const [groups, setGroups] = useState<GroupF[]>(
    initial.groups.map((g) => ({
      id: g.id,
      title: g.title,
      help: g.help ?? "",
      hidden: !!g.hidden,
      price: rubStr(g.price),
      maxLength: String(g.maxLength ?? 24),
      options: g.options.map((o) => ({ id: o.id, name: o.name, price: rubStr(o.price), color: o.color ?? "", pattern: o.pattern, hidden: !!o.hidden })),
    })),
  );

  const setG = (gi: number, patch: Partial<GroupF>) => setGroups((gs) => gs.map((g, j) => (j === gi ? { ...g, ...patch } : g)));
  const setO = (gi: number, oi: number, patch: Partial<OptF>) =>
    setGroups((gs) => gs.map((g, j) => (j === gi ? { ...g, options: g.options.map((o, k) => (k === oi ? { ...o, ...patch } : o)) } : g)));
  const moveO = (gi: number, oi: number, d: number) =>
    setGroups((gs) =>
      gs.map((g, j) => {
        if (j !== gi) return g;
        const a = [...g.options];
        const k = oi + d;
        if (k < 0 || k >= a.length) return g;
        [a[oi], a[k]] = [a[k], a[oi]];
        return { ...g, options: a };
      }),
    );

  const payload = JSON.stringify({
    enabled,
    title,
    intro,
    basePrice: num(base),
    leadDays: Math.trunc(num(lead)),
    groups: groups.map((g) => ({
      id: g.id,
      title: g.title,
      help: g.help,
      hidden: g.hidden,
      ...(g.id === "e" ? { price: num(g.price), maxLength: Math.trunc(num(g.maxLength)) } : {}),
      options: g.id === "e" ? [] : g.options.map((o) => ({ id: o.id, name: o.name, price: num(o.price), color: o.color, ...(o.pattern ? { pattern: o.pattern } : {}), hidden: o.hidden })),
    })),
  });

  return (
    <form action={action} className="stack">
      <input type="hidden" name="config" value={payload} />

      <div className="panel stack">
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>
            <b>Принимать заказы</b> — страница /cue видна покупателям, ссылка «Кий на заказ» появится в меню
          </span>
        </label>
        <div className="form-grid">
          <label className="field">
            Заголовок страницы
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </label>
          <label className="field">
            Базовая цена, ₽
            <input className="input" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} />
          </label>
          <label className="field">
            Срок изготовления, дней
            <input className="input" inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value)} />
          </label>
        </div>
        <label className="field">
          Текст под заголовком
          <textarea className="textarea" value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={600} style={{ minHeight: 80, paddingTop: 12 }} />
        </label>
      </div>

      {groups.map((g, gi) => {
        const m = meta.find((x) => x.id === g.id)!;
        return (
          <div key={g.id} className="panel stack" style={{ opacity: g.hidden ? 0.6 : 1 }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ margin: 0 }}>{m.title}</h2>
              <label className="check">
                <input type="checkbox" checked={!g.hidden} onChange={(e) => setG(gi, { hidden: !e.target.checked })} />
                <span>Показывать</span>
              </label>
            </div>
            <div className="form-grid">
              <label className="field">
                Название для покупателя
                <input className="input" value={g.title} onChange={(e) => setG(gi, { title: e.target.value })} maxLength={60} />
              </label>
              <label className="field">
                Подсказка (необязательно)
                <input className="input" value={g.help} onChange={(e) => setG(gi, { help: e.target.value })} maxLength={200} />
              </label>
              {m.text && (
                <>
                  <label className="field">
                    Доплата за гравировку, ₽
                    <input className="input" inputMode="decimal" value={g.price} onChange={(e) => setG(gi, { price: e.target.value })} />
                  </label>
                  <label className="field">
                    Максимум знаков
                    <input className="input" inputMode="numeric" value={g.maxLength} onChange={(e) => setG(gi, { maxLength: e.target.value })} />
                  </label>
                </>
              )}
            </div>
            {!m.text && (
              <>
                <div className="table-wrap">
                  <table className="table cue-opts">
                    <thead>
                      <tr>
                        <th>Вариант</th>
                        <th style={{ width: 130 }}>Доплата, ₽</th>
                        {m.color && <th style={{ width: 70 }}>Цвет</th>}
                        {m.pattern && <th style={{ width: 210 }}>Рисунок на схеме</th>}
                        <th style={{ width: 90 }}>Виден</th>
                        <th style={{ width: 160 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {g.options.map((o, oi) => (
                        <tr key={o.id}>
                          <td>
                            <input className="input" value={o.name} onChange={(e) => setO(gi, oi, { name: e.target.value })} maxLength={60} style={{ minHeight: 40 }} />
                          </td>
                          <td>
                            <input className="input" inputMode="decimal" value={o.price} onChange={(e) => setO(gi, oi, { price: e.target.value })} style={{ minHeight: 40 }} />
                          </td>
                          {m.color && (
                            <td>
                              <input
                                type="color"
                                value={o.color || "#888888"}
                                onChange={(e) => setO(gi, oi, { color: e.target.value })}
                                aria-label={`Цвет: ${o.name}`}
                                style={{ width: 44, height: 36, padding: 0, border: 0, background: "none" }}
                              />
                            </td>
                          )}
                          {m.pattern && (
                            <td>
                              <select className="select" value={o.pattern ?? "classic"} onChange={(e) => setO(gi, oi, { pattern: e.target.value as SplicePattern })} style={{ minHeight: 40 }}>
                                {Object.entries(SPLICE_PATTERNS).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                          <td>
                            <input type="checkbox" checked={!o.hidden} onChange={(e) => setO(gi, oi, { hidden: !e.target.checked })} aria-label="Показывать вариант" />
                          </td>
                          <td>
                            <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                              <button type="button" className="btn btn--line btn--sm" onClick={() => moveO(gi, oi, -1)} disabled={oi === 0} aria-label="Выше">
                                ↑
                              </button>
                              <button type="button" className="btn btn--line btn--sm" onClick={() => moveO(gi, oi, 1)} disabled={oi === g.options.length - 1} aria-label="Ниже">
                                ↓
                              </button>
                              <button
                                type="button"
                                className="btn btn--line btn--sm"
                                aria-label="Удалить"
                                onClick={() => confirm(`Удалить «${o.name}»? Если этот вариант уже лежит у кого-то в корзине, его попросят собрать кий заново.`) && setG(gi, { options: g.options.filter((_, k) => k !== oi) })}
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <button
                    type="button"
                    className="btn btn--line btn--sm"
                    onClick={() => setG(gi, { options: [...g.options, { id: newId(g.options.map((x) => x.id)), name: "", price: "0", color: m.color ? "#b08a5a" : "", ...(m.pattern ? { pattern: "classic" as SplicePattern } : {}), hidden: false }] })}
                  >
                    + Вариант
                  </button>
                  <span className="small muted">Первый видимый вариант выбран у покупателя по умолчанию.</span>
                </div>
              </>
            )}
          </div>
        );
      })}

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row">
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <a className="btn btn--line btn--sm" href="/cue" target="_blank" rel="noreferrer">
          Открыть конструктор
        </a>
      </div>
    </form>
  );
}
