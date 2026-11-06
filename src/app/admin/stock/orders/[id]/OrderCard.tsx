"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { orderStatus, receive, saveDraft, type SoResult } from "../actions";

interface Item {
  id: string;
  name: string;
  sku: string | null;
  qty: number;
  unitCost: number | null;
  receivedQty: number | null;
  stock: number | null;
}

const fmt = (kop: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(kop / 100) + " ₽";
const rubStr = (k: number | null) => (k == null ? "" : String(k / 100));
const toKop = (v: string) => (v.trim() ? Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100) : null);

export function OrderCard({ id, status, supplier, note, items, text, canEdit }: { id: string; status: string; supplier: string; note: string | null; items: Item[]; text: string; canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(items.map((i) => ({ ...i, q: String(i.receivedQty ?? i.qty), c: rubStr(i.unitCost) })));
  const [sup, setSup] = useState(supplier);
  const [nt, setNt] = useState(note ?? "");
  const [res, setRes] = useState<SoResult>({});
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const draft = status === "DRAFT";
  const open = status === "DRAFT" || status === "ORDERED";
  const [receiving, setReceiving] = useState(false);
  const editable = canEdit && open && (draft || receiving);

  const upd = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const lines = () => {
    const out = [];
    for (const r of rows) {
      const qty = Math.trunc(Number(r.q));
      const unitCost = toKop(r.c);
      if (!Number.isFinite(qty) || qty < 0) throw new Error(`«${r.name}»: проверьте количество`);
      if (unitCost != null && !(unitCost >= 0)) throw new Error(`«${r.name}»: проверьте цену`);
      out.push({ id: r.id, qty, unitCost });
    }
    return out;
  };
  const run = (fn: () => Promise<SoResult>) => {
    setRes({});
    start(async () => {
      try {
        const r = await fn();
        setRes(r);
        if (r.ok) router.refresh();
      } catch (e) {
        setRes({ error: e instanceof Error ? e.message : "Ошибка" });
      }
    });
  };
  const total = rows.reduce((a, r) => a + (Math.trunc(Number(r.q)) || 0) * (toKop(r.c) ?? 0), 0);

  return (
    <div className="stack" style={{ gap: 14 }}>
      {draft && canEdit ? (
        <div className="pos-grid">
          <label className="field" style={{ margin: 0 }}>
            Поставщик
            <input className="input" value={sup} onChange={(e) => setSup(e.target.value)} maxLength={120} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            Комментарий поставщику
            <input className="input" value={nt} onChange={(e) => setNt(e.target.value)} maxLength={500} />
          </label>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Товар</th>
              <th style={{ textAlign: "right" }}>Сейчас на складе</th>
              <th style={{ textAlign: "right" }}>{receiving ? "Пришло, шт" : status === "RECEIVED" ? "Пришло, шт" : "Заказано, шт"}</th>
              <th style={{ textAlign: "right" }}>Закупка за 1 шт, ₽</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>
                  {r.name}
                  {r.sku && <div className="muted small">{r.sku}</div>}
                  {status === "RECEIVED" && r.receivedQty != null && r.receivedQty !== r.qty && <div className="small is-loss">заказывали {r.qty} шт</div>}
                </td>
                <td style={{ textAlign: "right" }}>{r.stock ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  {editable ? (
                    <input className="input bulk-input" inputMode="numeric" style={{ width: 80, textAlign: "right" }} value={r.q} onChange={(e) => upd(i, { q: e.target.value })} aria-label="Количество" />
                  ) : (
                    (r.receivedQty ?? r.qty)
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  {editable ? (
                    <input className="input bulk-input" inputMode="decimal" style={{ width: 110, textAlign: "right" }} value={r.c} placeholder="—" onChange={(e) => upd(i, { c: e.target.value })} aria-label="Закупочная цена" />
                  ) : r.unitCost != null ? (
                    fmt(r.unitCost)
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 0 && <p style={{ margin: 0 }}>Сумма по закупке: <b>{fmt(total)}</b></p>}
      {draft && canEdit && <p className="muted small" style={{ margin: 0 }}>0 шт — строка уберётся из заказа.</p>}

      {res.ok && <div className="form-ok">{res.ok}</div>}
      {res.error && <div className="form-error">{res.error}</div>}

      {canEdit && open && (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {draft && (
            <>
              <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => run(() => saveDraft(id, { supplier: sup, note: nt || undefined, items: lines() }))}>
                Сохранить
              </button>
              <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => run(() => orderStatus(id, "ORDERED"))}>
                Заказали у поставщика
              </button>
            </>
          )}
          {!receiving ? (
            <button type="button" className={`btn btn--sm ${status === "ORDERED" ? "btn--gold" : "btn--line"}`} onClick={() => setReceiving(true)}>
              Товар пришёл — принять
            </button>
          ) : (
            <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => run(() => receive(id, lines()))}>
              {pending ? "Принимаем…" : "Принять на склад"}
            </button>
          )}
          <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => run(() => orderStatus(id, "CANCELLED"))}>
            Отменить заказ
          </button>
        </div>
      )}
      {receiving && open && <p className="muted small" style={{ margin: 0 }}>Проверьте, сколько пришло на самом деле и по какой цене — товар встанет на склад приходом, закупочная цена усреднится.</p>}

      <div className="panel stack" style={{ gap: 8, padding: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>Текст для поставщика</strong>
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
            }}
          >
            {copied ? "Скопировано ✓" : "Скопировать"}
          </button>
        </div>
        <pre className="so-text">{text}</pre>
      </div>
    </div>
  );
}
