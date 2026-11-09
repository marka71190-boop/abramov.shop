"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { fillLabelSkus } from "./actions";

interface Row {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  price: number;
  ok: boolean; // есть что закодировать: штрихкод EAN-13 или артикул латиницей
}

const FORMATS = [
  { key: "50x30", label: "Термопринтер 50×30 мм" },
  { key: "58x40", label: "Термопринтер 58×40 мм" },
  { key: "58x30", label: "Термопринтер 58×30 мм" },
  { key: "a4", label: "Лист A4: 3×8 наклеек 70×37 мм" },
];

export function LabelPicker({ rows, missing }: { rows: Row[]; missing: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [format, setFormat] = useState("50x30");
  const [price, setPrice] = useState(true);
  const [qr, setQr] = useState(true);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => rows.filter((r) => !needle || `${r.name} ${r.sku ?? ""} ${r.barcode ?? ""}`.toLowerCase().includes(needle)), [rows, needle]);
  const n = (id: string) => Math.max(0, Math.min(500, Math.trunc(Number(copies[id] ?? 0)) || 0));
  const chosen = rows.filter((r) => r.ok && n(r.id) > 0);
  const total = chosen.reduce((a, r) => a + n(r.id), 0);

  const items = () => encodeURIComponent(chosen.map((r) => `${r.id}:${n(r.id)}`).join(","));
  const print = () => window.open(`/print/labels?f=${format}&p=${price ? 1 : 0}&q=${qr ? 1 : 0}&i=${items()}`, "_blank", "noopener");
  // NIIMBOT печатает только из своего приложения — отдаём таблицу, приложение само сделает штрихкоды и QR
  const niimbot = () => {
    window.location.href = `/admin/stock/labels/niimbot?p=${price ? 1 : 0}&i=${items()}`;
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <details className="panel" open>
        <summary>
          <b>Печать на NIIMBOT</b> <span className="muted small">— через приложение NIIMBOT на телефоне</span>
        </summary>
        <ol className="small" style={{ margin: "10px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
          <li>Ниже укажите, сколько этикеток каждого товара, и нажмите <b>«Файл для NIIMBOT»</b> — таблица скачается на телефон.</li>
          <li>
            Один раз сделайте шаблон в приложении NIIMBOT: новая этикетка <b>50×30 мм</b>, добавьте текст (название), текст (цена), штрихкод (тип{" "}
            <b>EAN-13</b>) и QR-код. Сохраните — дальше этот шаг не нужен.
          </li>
          <li>
            В шаблоне откройте источник данных → <b>Excel</b>, выберите скачанный файл и привяжите поля к колонкам: «Название», «Цена», «Штрихкод», «Ссылка».
          </li>
          <li>Печать — по одной этикетке на каждую строку файла. Нужно 3 штуки — в файле будет 3 строки.</li>
        </ol>
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          Названия кнопок в приложении зависят от его версии. Принтер с драйвером на компьютере (Xprinter, TSC и другие) — кнопка «Печать из браузера».
        </p>
      </details>
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
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, артикул или штрихкод" />
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
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  className="labels-check"
                  checked={shown.some((r) => r.ok) && shown.filter((r) => r.ok).every((r) => n(r.id) > 0)}
                  onChange={(e) => {
                    const on = e.target.checked;
                    const next = { ...copies };
                    for (const r of shown) if (r.ok) on ? (next[r.id] = next[r.id] && n(r.id) ? next[r.id] : "1") : delete next[r.id];
                    setCopies(next);
                  }}
                  aria-label="Отметить все в списке"
                />
              </th>
              <th>Товар</th>
              <th>Штрихкод</th>
              <th style={{ textAlign: "right" }}>На складе</th>
              <th style={{ textAlign: "right" }}>Этикеток</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={n(r.id) ? "is-on" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    className="labels-check"
                    disabled={!r.ok}
                    checked={n(r.id) > 0}
                    onChange={(e) => {
                      const next = { ...copies };
                      if (e.target.checked) next[r.id] = "1";
                      else delete next[r.id];
                      setCopies(next);
                    }}
                    aria-label={`Выбрать: ${r.name}`}
                  />
                </td>
                <td
                  style={{ cursor: r.ok ? "pointer" : undefined }}
                  onClick={() => {
                    if (!r.ok) return;
                    const next = { ...copies };
                    if (n(r.id)) delete next[r.id];
                    else next[r.id] = "1";
                    setCopies(next);
                  }}
                >
                  {r.name}
                </td>
                <td className="small">{r.barcode ?? (r.ok ? r.sku : <span className="is-loss">{r.sku ? "русские буквы в артикуле" : "нет артикула"}</span>)}</td>
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
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={qr} onChange={(e) => setQr(e.target.checked)} />
            <span>QR-код — ссылка на товар</span>
          </label>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn--gold btn--sm" disabled={!total} onClick={niimbot}>
            Файл для NIIMBOT {total ? `· ${total} шт` : ""}
          </button>
          <button type="button" className="btn btn--line btn--sm" disabled={!total} onClick={print}>
            Печать из браузера
          </button>
        </div>
      </div>
    </div>
  );
}
