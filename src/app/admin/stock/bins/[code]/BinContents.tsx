"use client";
/**
 * Содержимое ячейки. Положить товар — отсканировать его штрихкод (пистолетом или камерой телефона)
 * либо найти по названию. Товар из другой ячейки переезжает сюда.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BarcodeScanner, signal } from "@/components/pos/BarcodeScanner";
import { useScanWedge } from "@/components/pos/useScanWedge";
import { codeMatches } from "@/lib/code-match";
import { saveBinsAction } from "../actions";

interface Row {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  oldSku: string | null;
  stock: number;
  bin: string | null;
}

export function BinContents({ code, rows, readonly }: { code: string; rows: Row[]; readonly: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [scan, setScan] = useState(false);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const here = rows.filter((r) => r.bin === code);
  const units = here.reduce((a, r) => a + Math.max(r.stock, 0), 0);
  const needle = q.trim().toLowerCase();
  const found = needle.length >= 2 ? rows.filter((r) => r.bin !== code && `${r.name} ${r.sku ?? ""} ${r.barcode ?? ""}`.toLowerCase().includes(needle)).slice(0, 8) : [];

  const move = (r: Row, to: string | null) =>
    start(async () => {
      const res = await saveBinsAction({ [r.id]: to });
      if (res.error) return setMsg({ text: res.error, ok: false });
      setMsg({ text: to ? `${r.name} — теперь в ячейке ${code}${r.bin ? ` (была ${r.bin})` : ""}` : `${r.name} — убрали из ячейки`, ok: true });
      setQ("");
      router.refresh();
    });

  const onCode = (c: string) => {
    if (readonly) return null;
    const r = rows.find((x) => codeMatches(x, c));
    signal(!!r);
    if (!r) {
      setMsg({ text: `Нет товара с кодом ${c}`, ok: false });
      return `Нет товара с кодом ${c}`;
    }
    if (r.bin === code) {
      setMsg({ text: `${r.name} — уже в этой ячейке, на складе ${r.stock} шт`, ok: true });
      return null;
    }
    move(r, code);
    return null;
  };
  useScanWedge((c) => void onCode(c), !scan && !readonly);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="muted" style={{ margin: 0 }}>
        {here.length ? `Должно лежать: ${here.length} поз., ${units} шт.` : "В ячейке пока ничего нет."}
        {!readonly && " Отсканируйте штрихкод товара — он запишется в эту ячейку."}
      </p>
      {scan && <BarcodeScanner onCode={onCode} onClose={() => setScan(false)} />}
      {msg && (
        <div className={msg.ok ? "form-ok" : "form-error"} role="status">
          {msg.text}
        </div>
      )}
      {here.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Товар</th>
                <th style={{ textAlign: "right" }}>На складе</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {here.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    {r.sku && <div className="muted small">{r.sku}</div>}
                  </td>
                  <td style={{ textAlign: "right" }} className={r.stock <= 0 ? "is-loss" : undefined}>
                    {r.stock}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {!readonly && (
                      <button type="button" className="btn btn--sm btn--line" disabled={pending} onClick={() => move(r, null)} aria-label={`Убрать из ячейки: ${r.name}`}>
                        Убрать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readonly && (
        <div className="panel stack" style={{ gap: 10 }}>
          <b>Положить товар в ячейку</b>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input className="input" style={{ flex: "1 1 220px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или артикул" aria-label="Найти товар" />
            <button type="button" className="btn btn--line btn--sm" onClick={() => setScan(true)}>
              📷 Камерой
            </button>
          </div>
          {found.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span>
                {r.name}
                <span className="muted small">
                  {" "}
                  · {r.stock} шт{r.bin ? ` · сейчас в ${r.bin}` : ""}
                </span>
              </span>
              <button type="button" className="btn btn--sm btn--gold" disabled={pending} onClick={() => move(r, code)} aria-label={`Положить в ячейку: ${r.name}`}>
                Сюда
              </button>
            </div>
          ))}
          {needle.length >= 2 && !found.length && <span className="muted small">Ничего не нашли</span>}
        </div>
      )}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <a href={`/print/bins?f=58x40&c=${encodeURIComponent(code)}`} target="_blank" rel="noopener" className="btn btn--sm btn--line">
          Наклейка на полку
        </a>
        {here.length > 0 && (
          <Link href={`/admin/stock/labels?i=${encodeURIComponent(here.filter((r) => r.stock > 0).map((r) => `${r.id}:${r.stock}`).join(","))}`} className="btn btn--sm btn--line">
            Этикетки на товары ячейки
          </Link>
        )}
      </div>
    </div>
  );
}
