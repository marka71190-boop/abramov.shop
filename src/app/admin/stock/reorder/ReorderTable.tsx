"use client";
import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { newSupplierOrder, saveReorderSettings, type SoResult } from "../orders/actions";

export interface Row {
  variantId: string;
  productId: string;
  name: string;
  sku: string | null;
  stock: number;
  sold: number;
  perDay: number;
  daysLeft: number | null;
  onOrder: number;
  suggest: number;
  cost: number | null;
  supplier: string | null;
}

const fmt = (kop: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(kop / 100) + " ₽";
const toKop = (v: string) => Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100);

export function ReorderTable({ rows, suppliers, lead, cover, window, canEdit }: { rows: Row[]; suppliers: string[]; lead: number; cover: number; window: number; canEdit: boolean }) {
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.filter((r) => r.suggest > 0).map((r) => r.variantId)));
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [res, setRes] = useState<SoResult>({});
  const [pending, start] = useTransition();

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => rows.filter((r) => (all || r.suggest > 0 || r.onOrder > 0) && (!needle || `${r.name} ${r.sku ?? ""} ${r.supplier ?? ""}`.toLowerCase().includes(needle))),
    [rows, all, needle],
  );
  const qtyOf = (r: Row) => Math.trunc(Number(qty[r.variantId] ?? r.suggest)) || 0;
  const chosen = rows.filter((r) => picked.has(r.variantId) && qtyOf(r) > 0);
  const sum = chosen.reduce((a, r) => a + qtyOf(r) * (r.cost ?? 0), 0);

  // Отметили товары одного поставщика — подставляем его
  const pickSupplier = () => {
    const s = [...new Set(chosen.map((r) => r.supplier).filter(Boolean))];
    if (s.length === 1 && !supplier) setSupplier(s[0]!);
  };

  function create() {
    setRes({});
    if (!supplier.trim()) return setRes({ error: "Укажите поставщика" });
    if (!chosen.length) return setRes({ error: "Отметьте товары и количество" });
    start(async () => {
      const r = await newSupplierOrder({ supplier: supplier.trim(), note: note.trim() || undefined, lines: chosen.map((r) => ({ variantId: r.variantId, qty: qtyOf(r), unitCost: r.cost })) });
      if (r?.error) setRes(r);
    });
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={`btn btn--sm ${!all ? "btn--gold" : "btn--line"}`} onClick={() => setAll(false)}>
            Нужно заказать ({rows.filter((r) => r.suggest > 0).length})
          </button>
          <button type="button" className={`btn btn--sm ${all ? "btn--gold" : "btn--line"}`} onClick={() => setAll(true)}>
            Все товары
          </button>
        </div>
        <label className="field" style={{ flex: "1 1 220px", margin: 0 }}>
          Поиск
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Товар, артикул или поставщик" />
        </label>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {canEdit && <th style={{ width: 36 }} />}
              <th>Товар</th>
              <th style={{ textAlign: "right" }}>Остаток</th>
              <th style={{ textAlign: "right" }} title={`Продано за ${window} дней`}>
                Продано
              </th>
              <th style={{ textAlign: "right" }}>Хватит на</th>
              <th style={{ textAlign: "right" }}>Уже заказано</th>
              <th style={{ textAlign: "right" }}>Заказать</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const urgent = r.daysLeft != null && r.daysLeft <= lead;
              return (
                <tr key={r.variantId}>
                  {canEdit && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Заказать ${r.name}`}
                        checked={picked.has(r.variantId)}
                        onChange={(e) => {
                          const n = new Set(picked);
                          if (e.target.checked) n.add(r.variantId);
                          else n.delete(r.variantId);
                          setPicked(n);
                        }}
                      />
                    </td>
                  )}
                  <td>
                    <Link href={`/admin/catalog/product/${r.productId}`}>{r.name}</Link>
                    <div className="muted small">{[r.sku, r.supplier, r.cost != null ? `закупка ${fmt(r.cost)}` : null].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td style={{ textAlign: "right" }}>{r.stock}</td>
                  <td style={{ textAlign: "right" }}>{r.sold || "—"}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {r.daysLeft == null ? <span className="muted small">нет продаж</span> : <span className={urgent ? "pill pill--bad" : r.suggest > 0 ? "pill pill--warn" : ""}>{r.daysLeft > 365 ? "> года" : `${r.daysLeft} дн.`}</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>{r.onOrder || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {canEdit ? (
                      <input
                        className="input bulk-input"
                        inputMode="numeric"
                        style={{ width: 80, textAlign: "right" }}
                        value={qty[r.variantId] ?? String(r.suggest)}
                        onChange={(e) => {
                          setQty({ ...qty, [r.variantId]: e.target.value });
                          if (Number(e.target.value) > 0) setPicked(new Set(picked).add(r.variantId));
                        }}
                        aria-label="Сколько заказать"
                      />
                    ) : (
                      r.suggest || "—"
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={7} className="muted">
                  {all ? "Товаров нет" : "Сейчас докупать нечего — всего хватает с запасом"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="panel stack" style={{ gap: 12, padding: 16 }}>
          <strong>Заказ поставщику</strong>
          <div className="pos-grid">
            <label className="field" style={{ margin: 0 }}>
              Поставщик
              <input className="input" list="so-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} onFocus={pickSupplier} placeholder="Например: Longoni" maxLength={120} />
              <datalist id="so-suppliers">
                {suppliers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="field" style={{ margin: 0 }}>
              Комментарий поставщику
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сроки, доставка, оплата" maxLength={500} />
            </label>
          </div>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <button type="button" className="btn btn--gold btn--sm" disabled={pending || !chosen.length} onClick={create}>
              {pending ? "Создаём…" : `Создать заказ (${chosen.length} поз.)`}
            </button>
            {sum > 0 && <span className="small muted">≈ {fmt(sum)} по закупочным ценам</span>}
            {res.error && <span className="form-error small">{res.error}</span>}
          </div>
        </div>
      )}

      <p className="muted small" style={{ margin: 0 }}>
        Считаем по продажам за {window} дней (сайт и касса): заказать столько, чтобы хватило на поставку ({lead} дн.) и ещё на {cover} дн. продаж. Уже заказанное у поставщиков вычитается. Штучные кии
        в расчёт не входят.
      </p>
    </div>
  );
}

export function ReorderSettings({ lead, cover, window }: { lead: number; cover: number; window: number }) {
  const [state, action, pending] = useActionState<SoResult, FormData>(saveReorderSettings, {});
  return (
    <details className="panel" style={{ padding: 16 }}>
      <summary>Настройки расчёта</summary>
      <form action={action} className="stack" style={{ gap: 10, marginTop: 12 }}>
        <div className="expense-form">
          <label className="field" style={{ margin: 0 }}>
            Поставка идёт, дней
            <input className="input" name="leadDays" defaultValue={lead} inputMode="numeric" />
          </label>
          <label className="field" style={{ margin: 0 }}>
            Заказывать на, дней продаж
            <input className="input" name="coverDays" defaultValue={cover} inputMode="numeric" />
          </label>
          <label className="field" style={{ margin: 0 }}>
            Скорость продаж — за, дней
            <input className="input" name="salesWindowDays" defaultValue={window} inputMode="numeric" />
          </label>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <button className="btn btn--line btn--sm" disabled={pending}>
            Сохранить
          </button>
          {state.ok && <span className="form-ok small">{state.ok}</span>}
          {state.error && <span className="form-error small">{state.error}</span>}
        </div>
      </form>
    </details>
  );
}
