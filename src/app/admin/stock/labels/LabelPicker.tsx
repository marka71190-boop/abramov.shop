"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { fillLabelSkus } from "./actions";

interface Row {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  price: number;
  ok: boolean; // артикул можно закодировать
}

const FORMATS = [
  { key: "58x40", label: "Термопринтер 58×40 мм" },
  { key: "58x30", label: "Термопринтер 58×30 мм" },
  { key: "a4", label: "Лист A4: 3×8 наклеек 70×37 мм" },
];

export function LabelPicker({ rows, missing }: { rows: Row[]; missing: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [format, setFormat] = useState("58x40");
  const [price, setPrice] = useState(true);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => rows.filter((r) => !needle || `${r.name} ${r.sku ?? ""}`.toLowerCase().includes(needle)), [rows, needle]);
  const n = (id: string) => Math.max(0, Math.min(500, Math.trunc(Number(copies[id] ?? 0)) || 0));
  const chosen = rows.filter((r) => r.ok && n(r.id) > 0);
  const total = chosen.reduce((a, r) => a + n(r.id), 0);

  const print = () => {
    const items = chosen.map((r) => `${r.id}:${n(r.id)}`).join(",");
    window.open(`/print/labels?f=${format}&p=${price ? 1 : 0}&i=${encodeURIComponent(items)}`, "_blank", "noopener");
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {missing > 0 && (
        <div className="notice notice--muted row" style={{ gap: 12, alignItems: "center", margin: 0 }}>
          <span>
            У {missing} поз. нет артикула (или он с русскими буквами) — для них штрихкод не напечатать.
          </span>
          <button
            type="button"
            className="btn btn--line btn--sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await fillLabelSkus();
                setMsg(r.ok ?? r.error ?? "");
                router.refresh();
              })
            }
          >
            {pending ? "Проставляем…" : "Проставить артикулы"}
          </button>
        </div>
      )}
      {msg && <div className="form-ok">{msg}</div>}

      <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="field" style={{ flex: "1 1 220px", margin: 0 }}>
          Поиск
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или артикул" />
        </label>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setCopies(Object.fromEntries(shown.filter((r) => r.ok).map((r) => [r.id, String(Math.max(0, r.stock))])))}>
          Сколько на складе
        </button>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setCopies(Object.fromEntries(shown.filter((r) => r.ok).map((r) => [r.id, "1"])))}>
          По одной
        </button>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setCopies({})}>
          Очистить
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Товар</th>
              <th>Штрихкод</th>
              <th style={{ textAlign: "right" }}>На складе</th>
              <th style={{ textAlign: "right" }}>Этикеток</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="small">{r.ok ? r.sku : <span className="is-loss">{r.sku ? "русские буквы в артикуле" : "нет артикула"}</span>}</td>
                <td style={{ textAlign: "right" }}>{r.stock}</td>
                <td style={{ textAlign: "right" }}>
                  <input
                    className="input bulk-input"
                    inputMode="numeric"
                    style={{ width: 80, textAlign: "right" }}
                    disabled={!r.ok}
                    value={copies[r.id] ?? ""}
                    placeholder="0"
                    onChange={(e) => setCopies({ ...copies, [r.id]: e.target.value })}
                    aria-label={`Сколько этикеток: ${r.name}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bulk-save">
        <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto", minHeight: 40 }} aria-label="Формат">
            {FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={price} onChange={(e) => setPrice(e.target.checked)} />
            <span>С ценой</span>
          </label>
        </div>
        <button type="button" className="btn btn--gold btn--sm" disabled={!total} onClick={print}>
          Печатать {total ? `${total} шт` : ""}
        </button>
      </div>
    </div>
  );
}
