"use client";
import { useState, useTransition } from "react";
import type { CostItem, TurnkeyConfig } from "@/lib/turnkey-config";
import { TABLE_KINDS, type TableKind, type TableModel } from "@/lib/turnkey-geom";
import { saveTurnkeyConfig } from "../actions";

const rubIn = (k: number) => (k ? String(k / 100) : "");
const kop = (v: string) => Math.max(0, Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100) || 0);
const uid = () => Math.random().toString(36).slice(2, 8);

export function TurnkeySettingsForm({ initial }: { initial: TurnkeyConfig }) {
  const [c, setC] = useState(initial);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const setModel = (i: number, patch: Partial<TableModel>) => setC({ ...c, models: c.models.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setItem = (key: "perTable" | "perClub", i: number, patch: Partial<CostItem>) => setC({ ...c, [key]: c[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="panel stack">
        <label className="check">
          <input type="checkbox" checked={c.enabled} onChange={(e) => setC({ ...c, enabled: e.target.checked })} />
          <span>Конструктор открыт на сайте</span>
        </label>
        <label className="field">
          Текст в начале страницы
          <textarea className="textarea" value={c.intro} onChange={(e) => setC({ ...c, intro: e.target.value })} style={{ minHeight: 70, paddingTop: 10 }} />
        </label>
        <div className="form-grid">
          <label className="field">
            От борта до стены, мм
            <input className="input" type="number" min={600} max={3000} value={c.gaps.wall} onChange={(e) => setC({ ...c, gaps: { ...c.gaps, wall: Number(e.target.value) } })} />
          </label>
          <label className="field">
            Между столами — минимум, мм
            <input className="input" type="number" min={1800} max={4000} value={c.gaps.table} onChange={(e) => setC({ ...c, gaps: { ...c.gaps, table: Number(e.target.value) } })} />
          </label>
          <label className="field">
            КП действует, дней
            <input className="input" type="number" min={1} max={365} value={c.validDays} onChange={(e) => setC({ ...c, validDays: Number(e.target.value) })} />
          </label>
        </div>
        <label className="field">
          Примечание в КП
          <textarea className="textarea" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} style={{ minHeight: 60, paddingTop: 10 }} />
        </label>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Модели столов</h2>
        {c.models.map((m, i) => (
          <div key={m.id} className="tk-model">
            <div className="form-grid">
              <label className="field">
                Название
                <input className="input" value={m.name} onChange={(e) => setModel(i, { name: e.target.value })} />
              </label>
              <label className="field">
                Тип
                <select
                  className="select"
                  value={m.kind}
                  onChange={(e) => {
                    const k = e.target.value as TableKind;
                    setModel(i, { kind: k, length: TABLE_KINDS[k].length, width: TABLE_KINDS[k].width });
                  }}
                >
                  {Object.entries(TABLE_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Цена, ₽
                <input className="input" inputMode="decimal" defaultValue={rubIn(m.price)} onBlur={(e) => setModel(i, { price: kop(e.target.value) })} placeholder="по запросу" />
              </label>
              <label className="field">
                Длина × ширина, мм
                <span className="row" style={{ gap: 6 }}>
                  <input className="input" type="number" value={m.length} onChange={(e) => setModel(i, { length: Number(e.target.value) })} />
                  <input className="input" type="number" value={m.width} onChange={(e) => setModel(i, { width: Number(e.target.value) })} />
                </span>
              </label>
              <label className="field">
                Сукно и корпус
                <span className="row" style={{ gap: 6 }}>
                  <input type="color" value={m.cloth} onChange={(e) => setModel(i, { cloth: e.target.value })} aria-label="Цвет сукна" />
                  <input type="color" value={m.frame} onChange={(e) => setModel(i, { frame: e.target.value })} aria-label="Цвет корпуса" />
                </span>
              </label>
              <label className="field">
                Подпись
                <input className="input" value={m.note} onChange={(e) => setModel(i, { note: e.target.value })} />
              </label>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <label className="check">
                <input type="checkbox" checked={m.active} onChange={(e) => setModel(i, { active: e.target.checked })} />
                <span>Показывать</span>
              </label>
              <button type="button" className="linklike small" onClick={() => setC({ ...c, models: c.models.filter((_, j) => j !== i) })}>
                Удалить модель
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn--line btn--sm"
          style={{ justifySelf: "start" }}
          onClick={() =>
            setC({ ...c, models: [...c.models, { id: `m${uid()}`, kind: "RB12", name: "Новый стол", length: TABLE_KINDS.RB12.length, width: TABLE_KINDS.RB12.width, price: 0, cloth: TABLE_KINDS.RB12.cloth, frame: "#3b2416", note: "", active: true }] })
          }
        >
          + Модель стола
        </button>
      </div>

      {(
        [
          ["perTable", "На каждый стол", "Светильник, комплект аксессуаров, доставка и сборка — умножается на число столов"],
          ["perClub", "На весь клуб", "Выезд на замер, проект — один раз"],
        ] as const
      ).map(([key, title, hint]) => (
        <div key={key} className="panel stack">
          <h2 style={{ marginBottom: 0 }}>{title}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {hint}
          </p>
          {c[key].map((x, i) => (
            <div key={x.id} className="row" style={{ gap: 8 }}>
              <input className="input" value={x.name} onChange={(e) => setItem(key, i, { name: e.target.value })} style={{ flex: 1 }} />
              <input className="input" inputMode="decimal" defaultValue={rubIn(x.price)} onBlur={(e) => setItem(key, i, { price: kop(e.target.value) })} placeholder="₽, пусто — по запросу" style={{ width: 180 }} />
              <button type="button" className="btn btn--line btn--sm" onClick={() => setC({ ...c, [key]: c[key].filter((_, j) => j !== i) })} aria-label="Удалить">
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--line btn--sm" style={{ justifySelf: "start" }} onClick={() => setC({ ...c, [key]: [...c[key], { id: uid(), name: "Новая позиция", price: 0 }] })}>
            + Позиция
          </button>
        </div>
      ))}

      {res?.error && <div className="form-error">{res.error}</div>}
      {res?.ok && <div className="form-ok">{res.ok}</div>}
      <button type="button" className="btn btn--gold" style={{ justifySelf: "start" }} disabled={pending} onClick={() => start(async () => setRes(await saveTurnkeyConfig(c)))}>
        Сохранить
      </button>
    </div>
  );
}
