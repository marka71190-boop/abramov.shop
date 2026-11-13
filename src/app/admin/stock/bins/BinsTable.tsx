"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { normBin, parseBins } from "@/lib/bin-code";
import { saveBinsAction } from "./actions";

interface Row {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  bin: string | null;
}

const FORMATS = [
  { key: "58x40", label: "Термопринтер 58×40 мм" },
  { key: "50x30", label: "Термопринтер 50×30 мм" },
  { key: "a4", label: "Лист A4: 3×8 наклеек 70×37 мм" },
];

/** Наклейки на полки: все ячейки или свои — «A-1..A-10» развернётся в десять */
export function BinPrint({ bins }: { bins: string[] }) {
  const [text, setText] = useState(bins.join(", "));
  const [format, setFormat] = useState("58x40");
  const list = parseBins(text);
  return (
    <details className="panel" open={bins.length === 0}>
      <summary>
        <b>Наклейки на полки</b> <span className="muted small">— QR-код и крупное имя ячейки</span>
      </summary>
      <div className="stack" style={{ gap: 10, marginTop: 10 }}>
        <label className="field" style={{ margin: 0 }}>
          Какие ячейки печатать
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="A-1..A-10, Б-1, Б-2" />
        </label>
        <p className="muted small" style={{ margin: 0 }}>
          Через запятую. «A-1..A-10» — сразу десять наклеек. Ячейки можно напечатать заранее, а товары вписать потом — или отсканировать наклейку и добавить товар
          сканером прямо у полки.
        </p>
        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto", minHeight: 40 }} aria-label="Формат наклеек">
            {FORMATS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--gold btn--sm"
            disabled={!list.length}
            onClick={() => window.open(`/print/bins?f=${format}&c=${encodeURIComponent(list.join(","))}`, "_blank", "noopener")}
          >
            Печать наклеек{list.length ? ` · ${list.length} шт` : ""}
          </button>
        </div>
      </div>
    </details>
  );
}

/** Раскладка: каждому товару — ячейка. Сохраняются только изменённые строки */
export function BinsTable({ rows, readonly }: { rows: Row[]; readonly: boolean }) {
  const router = useRouter();
  const [val, setVal] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [loose, setLoose] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        (r) => (!loose || (!r.bin && r.stock > 0)) && (!needle || `${r.name} ${r.sku ?? ""} ${r.barcode ?? ""} ${r.bin ?? ""}`.toLowerCase().includes(needle)),
      ),
    [rows, needle, loose],
  );
  const changed = rows.filter((r) => val[r.id] !== undefined && normBin(val[r.id]) !== (r.bin ?? ""));

  function save() {
    start(async () => {
      const r = await saveBinsAction(Object.fromEntries(changed.map((x) => [x.id, normBin(val[x.id]) || null])));
      setMsg(r);
      if (r.ok) {
        setVal({});
        router.refresh();
      }
    });
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="field" style={{ flex: "1 1 220px", margin: 0 }}>
          Поиск
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, артикул или ячейка" />
        </label>
        <label className="check" style={{ margin: 0 }}>
          <input type="checkbox" checked={loose} onChange={(e) => setLoose(e.target.checked)} />
          <span>Только без ячейки</span>
        </label>
      </div>
      <div className="table-wrap" style={{ maxHeight: 620, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Товар</th>
              <th style={{ textAlign: "right" }}>На складе</th>
              <th>Ячейка</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name}
                  {r.sku && <div className="muted small">{r.sku}</div>}
                </td>
                <td style={{ textAlign: "right" }} className={r.stock <= 0 ? "muted" : undefined}>
                  {r.stock}
                </td>
                <td>
                  <div className="row" style={{ gap: 6, alignItems: "center" }}>
                    <input
                      className="input bulk-input"
                      style={{ width: 110, textTransform: "uppercase" }}
                      value={val[r.id] ?? r.bin ?? ""}
                      disabled={readonly}
                      placeholder="—"
                      maxLength={14}
                      onChange={(e) => setVal({ ...val, [r.id]: e.target.value })}
                      onBlur={(e) => val[r.id] !== undefined && setVal({ ...val, [r.id]: normBin(e.target.value) })}
                      aria-label={`Ячейка: ${r.name}`}
                    />
                    {r.bin && val[r.id] === undefined && (
                      <Link href={`/admin/stock/bins/${encodeURIComponent(r.bin)}`} className="small">
                        открыть
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={3} className="muted">
                  {loose ? "Всё, что есть на складе, разложено по ячейкам" : "Ничего не нашли"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
      <button type="button" className="btn btn--gold" style={{ alignSelf: "flex-start" }} disabled={pending || readonly || !changed.length} onClick={save}>
        {pending ? "Сохраняем…" : `Сохранить ячейки${changed.length ? ` (${changed.length})` : ""}`}
      </button>
    </div>
  );
}
