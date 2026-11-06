"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { VariantPicker, type PickOption } from "@/components/admin/VariantPicker";
import { saveMoves, type MoveResult } from "../actions";

type Kind = "RECEIPT" | "WRITE_OFF" | "INVENTORY";
type Line = { o: PickOption; qty: string; cost: string };

const rubStr = (k: number | null) => (k == null ? "" : String(k / 100));
const toKop = (v: string) => Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100);
const fmt = (kop: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(kop / 100) + " ₽";

const TEXT: Record<Kind, { qty: string; btn: string; note: string; notePh: string }> = {
  RECEIPT: { qty: "Пришло, шт", btn: "Провести приход", note: "Поставщик, номер накладной", notePh: "Например: Longoni, накладная 154" },
  WRITE_OFF: { qty: "Списать, шт", btn: "Списать", note: "Причина списания", notePh: "Брак, порча, подарок, для себя…" },
  INVENTORY: { qty: "Стало, шт", btn: "Сохранить остатки", note: "Комментарий", notePh: "Пересчёт склада 6 ноября" },
};

export function MoveForm({ kind, options }: { kind: Kind; options: PickOption[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [res, setRes] = useState<MoveResult>({});
  const [pending, start] = useTransition();
  const t = TEXT[kind];
  const picked = useMemo(() => new Set(lines.map((l) => l.o.id)), [lines]);

  const add = (o: PickOption) =>
    setLines((ls) => [...ls, { o, qty: kind === "INVENTORY" ? String(o.stock) : "1", cost: kind === "RECEIPT" ? rubStr(o.cost) : "" }]);
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const total = kind === "RECEIPT" ? lines.reduce((a, l) => a + (Number(l.qty) || 0) * (toKop(l.cost) || 0), 0) : 0;

  function submit() {
    setRes({});
    const out: { variantId: string; qty: number; unitCost: number | null }[] = [];
    for (const l of lines) {
      const qty = Math.trunc(Number(l.qty));
      if (!Number.isFinite(qty) || qty < (kind === "INVENTORY" ? 0 : 1)) return setRes({ error: `«${l.o.name}»: проверьте количество` });
      if (kind === "WRITE_OFF" && qty > l.o.stock) return setRes({ error: `«${l.o.name}»: свободно только ${l.o.stock} шт` });
      let unitCost: number | null = null;
      if (kind === "RECEIPT" && l.cost.trim()) {
        unitCost = toKop(l.cost);
        if (!(unitCost >= 0)) return setRes({ error: `«${l.o.name}»: закупочная цена — в рублях, например 1250` });
      }
      out.push({ variantId: l.o.id, qty, unitCost });
    }
    start(async () => {
      const r = await saveMoves({ type: kind, note: note.trim() || undefined, lines: out });
      setRes(r);
      if (r.ok) {
        setLines([]);
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <VariantPicker
        options={options}
        onPick={add}
        exclude={picked}
        autoFocus
        hint={(o) => `в наличии ${o.stock} шт${o.cost != null ? ` · закупка ${fmt(o.cost)}` : ""}`}
        placeholder="Найдите товар: название или артикул (можно сканером)"
      />

      {lines.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Товар</th>
                <th style={{ textAlign: "right" }}>Сейчас</th>
                <th>{t.qty}</th>
                {kind === "RECEIPT" && <th>Закупка за 1 шт, ₽</th>}
                {kind === "INVENTORY" && <th style={{ textAlign: "right" }}>Разница</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const diff = kind === "INVENTORY" ? (Math.trunc(Number(l.qty)) || 0) - l.o.stock : 0;
                return (
                  <tr key={l.o.id}>
                    <td>
                      {l.o.name}
                      {l.o.sku && <div className="muted small">{l.o.sku}</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>{l.o.stock}</td>
                    <td>
                      <input className="input bulk-input" inputMode="numeric" value={l.qty} onChange={(e) => upd(i, { qty: e.target.value })} style={{ width: 90 }} aria-label={t.qty} />
                    </td>
                    {kind === "RECEIPT" && (
                      <td>
                        <input className="input bulk-input" inputMode="decimal" value={l.cost} placeholder="—" onChange={(e) => upd(i, { cost: e.target.value })} style={{ width: 120 }} aria-label="Закупочная цена" />
                      </td>
                    )}
                    {kind === "INVENTORY" && (
                      <td style={{ textAlign: "right" }} className={diff < 0 ? "form-error" : diff > 0 ? "form-ok" : "muted"}>
                        {diff > 0 ? `+${diff}` : diff || "—"}
                      </td>
                    )}
                    <td>
                      <button type="button" className="linklike small" onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}>
                        Убрать
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!lines.length && <p className="muted small">Начните вводить название товара — он появится в списке. Можно добавить сколько угодно строк.</p>}

      <label className="field">
        {t.note}
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePh} maxLength={300} />
      </label>

      {kind === "RECEIPT" && total > 0 && <p style={{ margin: 0 }}>Сумма прихода по закупке: <b>{fmt(total)}</b></p>}
      {kind === "RECEIPT" && (
        <p className="muted small" style={{ margin: 0 }}>
          Закупочная цена усредняется: если на складе было 2 шт по 1 000 ₽ и пришло 2 шт по 1 200 ₽, станет 1 100 ₽. Пустая цена — остаётся прежняя.
        </p>
      )}
      {kind === "INVENTORY" && (
        <p className="muted small" style={{ margin: 0 }}>
          Указывайте, сколько товара <b>свободно для продажи</b>: не считайте то, что отложено под оплаченные, но ещё не отправленные заказы.
        </p>
      )}

      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <button type="button" className="btn btn--gold" disabled={pending || !lines.length} onClick={submit}>
          {pending ? "Сохраняем…" : t.btn}
        </button>
        <Link href="/admin/stock" className="btn btn--line">
          К остаткам
        </Link>
        {res.ok && <span className="form-ok">{res.ok}</span>}
        {res.error && <span className="form-error">{res.error}</span>}
      </div>
    </div>
  );
}
