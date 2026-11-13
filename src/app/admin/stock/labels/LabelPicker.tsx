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

interface Club {
  id: string;
  title: string;
}

export function LabelPicker({ rows, missing, clubs, club, preset }: { rows: Row[]; missing: number; clubs: Club[]; club: Club | null; preset: Record<string, string> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [copies, setCopies] = useState<Record<string, string>>(preset);
  // В клубе по умолчанию — только то, что там лежит (и то, что пришло отмеченным после перемещения)
  const [onlyHere, setOnlyHere] = useState(!!club);
  const [sign, setSign] = useState(!!club);
  const [tag, setTag] = useState("big");
  const where = club ? "В клубе" : "На складе";
  const [format, setFormat] = useState("50x30");
  const [price, setPrice] = useState(true);
  const [qr, setQr] = useState(true);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        (r) => (!onlyHere || r.stock > 0 || preset[r.id]) && (!needle || `${r.name} ${r.sku ?? ""} ${r.barcode ?? ""}`.toLowerCase().includes(needle)),
      ),
    [rows, needle, onlyHere, preset],
  );
  const n = (id: string) => Math.max(0, Math.min(500, Math.trunc(Number(copies[id] ?? 0)) || 0));
  const chosen = rows.filter((r) => r.ok && n(r.id) > 0);
  const total = chosen.reduce((a, r) => a + n(r.id), 0);

  const items = () => encodeURIComponent(chosen.map((r) => `${r.id}:${n(r.id)}`).join(","));
  const signQ = club && sign ? `&c=${club.id}` : "";
  const print = () => window.open(`/print/labels?f=${format}&p=${price ? 1 : 0}&q=${qr ? 1 : 0}${signQ}&i=${items()}`, "_blank", "noopener");
  const tags = () => window.open(`/print/pricetags?s=${tag}&q=${qr ? 1 : 0}&i=${items()}`, "_blank", "noopener");
  // NIIMBOT печатает только из своего приложения — отдаём таблицу, приложение само сделает штрихкоды и QR
  const niimbot = () => {
    window.location.href = `/admin/stock/labels/niimbot?p=${price ? 1 : 0}${signQ}&i=${items()}`;
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {clubs.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }} role="group" aria-label="Для чего печатаем">
          <span className="muted small">Печатаем для:</span>
          <button type="button" className={`btn btn--sm ${club ? "btn--line" : "btn--gold"}`} onClick={() => router.replace("/admin/stock/labels")}>
            Склад
          </button>
          {clubs.map((c) => (
            <button key={c.id} type="button" className={`btn btn--sm ${club?.id === c.id ? "btn--gold" : "btn--line"}`} onClick={() => router.replace(`/admin/stock/labels?club=${c.id}`)}>
              {c.title}
            </button>
          ))}
        </div>
      )}
      {club && Object.keys(preset).length > 0 && (
        <div className="form-ok">
          Отметили привезённое в «{club.title}»: {Object.keys(preset).length} поз., {Object.values(preset).reduce((a, x) => a + Number(x), 0)} шт — проверьте и печатайте.
        </div>
      )}
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
        <button
          type="button"
          className="btn btn--line btn--sm"
          onClick={() => setCopies(Object.fromEntries(shown.filter((r) => r.ok && r.stock > 0).map((r) => [r.id, String(r.stock)])))}
        >
          Сколько {club ? "в клубе" : "на складе"}
        </button>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setCopies(Object.fromEntries(shown.filter((r) => r.ok).map((r) => [r.id, "1"])))}>
          По одной
        </button>
        <button type="button" className="btn btn--line btn--sm" onClick={() => setCopies({})}>
          Очистить
        </button>
        <label className="check" style={{ margin: 0 }}>
          <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} />
          <span>Только в наличии</span>
        </label>
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
              <th style={{ textAlign: "right" }}>{where}</th>
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
            {!shown.length && (
              <tr>
                <td colSpan={5} className="muted">
                  {onlyHere && club ? "В клубе пока пусто — снимите «Только в наличии» или привезите товар перемещением." : "Ничего не нашли"}
                </td>
              </tr>
            )}
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
          {club && (
            <label className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} />
              <span>Подпись клуба</span>
            </label>
          )}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn--gold btn--sm" disabled={!total} onClick={niimbot}>
            Файл для NIIMBOT {total ? `· ${total} шт` : ""}
          </button>
          <button type="button" className="btn btn--line btn--sm" disabled={!total} onClick={print}>
            Печать из браузера
          </button>
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className="btn btn--line btn--sm" disabled={!total} onClick={tags} title="Лист A4: название, крупная цена и QR-код — на полку рядом с товаром">
              Ценники на витрину
            </button>
            <select className="select" value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: "auto", minHeight: 40 }} aria-label="Размер ценника">
              <option value="big">крупные · 8 на A4</option>
              <option value="mid">средние · 21 на A4</option>
            </select>
          </span>
        </div>
      </div>
    </div>
  );
}
