"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { VariantPicker, type PickOption } from "@/components/admin/VariantPicker";
import { transferAction, type MoveResult } from "../actions";

type Loc = { id: string; title: string }; // id "" — склад

export function TransferForm({ locations, from, to, options }: { locations: Loc[]; from: string; to: string; options: PickOption[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<{ o: PickOption; qty: string }[]>([]);
  const [note, setNote] = useState("");
  const [res, setRes] = useState<MoveResult>({});
  const [pending, start] = useTransition();
  const picked = useMemo(() => new Set(lines.map((l) => l.o.id)), [lines]);
  const go = (f: string, t: string) => router.replace(`/admin/stock/transfer?from=${f || "wh"}&to=${t || "wh"}`);
  const fromTitle = locations.find((l) => l.id === from)?.title ?? "Склад";

  function submit() {
    setRes({});
    const out: { variantId: string; qty: number }[] = [];
    for (const l of lines) {
      const q = Math.trunc(Number(l.qty));
      if (!(q >= 1)) return setRes({ error: `«${l.o.name}»: проверьте количество` });
      if (q > l.o.stock) return setRes({ error: `«${l.o.name}»: в месте «${fromTitle}» только ${l.o.stock} шт` });
      out.push({ variantId: l.o.id, qty: q });
    }
    start(async () => {
      const r = await transferAction({ from: from || null, to: to || null, note: note.trim() || undefined, lines: out });
      setRes(r);
      if (r.ok) {
        setLines([]);
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="panel stack" style={{ gap: 14 }}>
      <div className="form-grid">
        <label className="field">
          Откуда
          <select className="input" value={from} onChange={(e) => (setLines([]), go(e.target.value, to === e.target.value ? from : to))}>
            {locations.map((l) => (
              <option key={l.id || "wh"} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Куда
          <select className="input" value={to} onChange={(e) => go(from === e.target.value ? to : from, e.target.value)}>
            {locations.map((l) => (
              <option key={l.id || "wh"} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {from === to ? (
        <div className="form-error">Откуда и куда — одно место. Выберите другое.</div>
      ) : (
        <>
          <VariantPicker
            options={options.filter((o) => o.stock > 0)}
            exclude={picked}
            onPick={(o) => setLines((ls) => [...ls, { o, qty: "1" }])}
            placeholder="Товар: название или артикул (можно сканером)"
            hint={(o) => `${fromTitle}: ${o.stock} шт`}
          />
          {lines.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Есть</th>
                    <th style={{ width: 120 }}>Везём, шт</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.o.id}>
                      <td>
                        {l.o.name}
                        {l.o.sku && <div className="muted small">{l.o.sku}</div>}
                      </td>
                      <td>{l.o.stock}</td>
                      <td>
                        <input className="input" inputMode="numeric" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, qty: e.target.value } : x)))} />
                      </td>
                      <td>
                        <button type="button" className="linklike small" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}>
                          убрать
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <label className="field">
            Комментарий
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Например: отвёз Иван" />
          </label>
          {res.error && <div className="form-error">{res.error}</div>}
          {res.ok && <div className="form-ok">{res.ok}</div>}
          <button type="button" className="btn btn--gold" disabled={pending || !lines.length} onClick={submit} style={{ justifySelf: "start", alignSelf: "flex-start" }}>
            {pending ? "Перемещаем…" : "Переместить"}
          </button>
        </>
      )}
    </div>
  );
}
