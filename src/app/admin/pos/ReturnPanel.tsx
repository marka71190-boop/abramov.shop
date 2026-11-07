"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { approvalReady, PinApprove, type Approval } from "@/components/pos/PinApprove";
import { posFindSale, posReturn, type ReturnView } from "./actions";

const fmt = (kop: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(kop / 100) + " ₽";
const METHOD: Record<string, string> = { CASH: "наличные", SBP: "СБП", CARD: "карта" };

/**
 * Возврат в кассе: номер чека → что возвращают → (кассир) PIN менеджера → деньги.
 * Наличные — из кассы текущей смены, СБП и карта — через ЮKassa.
 */
export function ReturnPanel({ approvers, initialNumber = "" }: { approvers: { id: string; name: string }[] | null; initialNumber?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!initialNumber);
  const [number, setNumber] = useState(initialNumber);
  const [sale, setSale] = useState<ReturnView | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [approval, setApproval] = useState<Approval>({ approverId: "", pin: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();

  const find = () => {
    setError("");
    setDone("");
    start(async () => {
      const r = await posFindSale(number);
      if (r.sale) {
        setSale(r.sale);
        setQty(Object.fromEntries(r.sale.items.map((i) => [i.id, 0])));
      } else setError(r.error ?? "Не нашли");
    });
  };
  // Пришли по кнопке «Возврат» из списка продаж — сразу находим чек
  useEffect(() => {
    if (initialNumber) find();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const items = sale?.items ?? [];
  const value = items.reduce((a, i) => a + i.price * (qty[i.id] ?? 0), 0);
  const subtotal = items.reduce((a, i) => a + i.price * i.quantity, 0);
  const left = items.reduce((a, i) => a + i.price * (i.left - (qty[i.id] ?? 0)), 0);
  // Примерно, как посчитает сервер: доля оплаченного деньгами
  const estimate = sale ? (left === 0 ? sale.total - sale.refunded : Math.min(sale.total - sale.refunded, Math.round((sale.total * value) / Math.max(1, subtotal)))) : 0;
  const any = Object.values(qty).some((q) => q > 0);

  const submit = () => {
    if (!sale) return;
    setError("");
    start(async () => {
      const r = await posReturn({ saleId: sale.id, items: Object.entries(qty).map(([saleItemId, q]) => ({ saleItemId, qty: q })), reason: reason || null, approval: approvers ? approval : null });
      if (r.error) {
        if (r.needPin) setApproval((a) => ({ ...a, pin: "" }));
        return setError(r.error);
      }
      setDone(r.ok ?? "Возврат оформлен");
      setSale(null);
      setNumber("");
      setReason("");
      setApproval({ approverId: "", pin: "" });
      router.refresh();
    });
  };

  if (!open) {
    return (
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        {done && <div className="form-ok">{done}</div>}
        <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen(true)}>
          Возврат по чеку
        </button>
      </div>
    );
  }

  return (
    <section className="panel stack pos-return" id="return" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="h4" style={{ margin: 0 }}>
          Возврат
        </h2>
        <button type="button" className="linklike small" onClick={() => (setOpen(false), setSale(null), setError(""))}>
          Закрыть
        </button>
      </div>
      {done && <div className="form-ok">{done}</div>}
      {!sale && (
        <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "nowrap" }}>
          <label className="field" style={{ margin: 0, flex: 1 }}>
            Номер чека
            <input className="input" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} placeholder="K-261107-ABCD" autoComplete="off" spellCheck={false} />
          </label>
          <button type="button" className="btn btn--gold btn--sm" style={{ minHeight: 48 }} disabled={pending || number.trim().length < 8} onClick={find}>
            {pending ? "…" : "Найти"}
          </button>
        </div>
      )}
      {sale && (
        <>
          <div className="small">
            <b>{sale.number}</b> · {sale.date} · {METHOD[sale.method] ?? sale.method} · {fmt(sale.total)}
            {sale.bonusSpent ? ` + ${Math.floor(sale.bonusSpent / 100)} бонусами` : ""}
            {sale.refunded ? ` · уже вернули ${fmt(sale.refunded)}` : ""}
            {sale.place ? <div className="muted">{sale.place}</div> : null}
          </div>
          <ul className="pos-lines">
            {items.map((i) => (
              <li key={i.id} className={i.left ? "" : "is-muted"}>
                <div className="pos-lines__name">
                  {i.name}
                  <span className="muted small">
                    {fmt(i.price)} × {i.quantity}
                    {i.left < i.quantity ? ` · вернули ${i.quantity - i.left}` : ""}
                  </span>
                </div>
                <div className="pos-qty">
                  <button type="button" aria-label="Меньше" disabled={!qty[i.id]} onClick={() => setQty((q) => ({ ...q, [i.id]: Math.max(0, (q[i.id] ?? 0) - 1) }))}>
                    −
                  </button>
                  <span>{qty[i.id] ?? 0}</span>
                  <button type="button" aria-label="Больше" disabled={(qty[i.id] ?? 0) >= i.left} onClick={() => setQty((q) => ({ ...q, [i.id]: Math.min(i.left, (q[i.id] ?? 0) + 1) }))}>
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="linklike small" style={{ justifySelf: "start" }} onClick={() => setQty(Object.fromEntries(items.map((i) => [i.id, i.left])))}>
            Вернуть всё
          </button>
          <label className="field" style={{ margin: 0 }}>
            Причина
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Не подошёл, брак, передумал" />
          </label>
          {approvers && any && <PinApprove approvers={approvers} value={approval} onChange={setApproval} title="Возврат подтверждает менеджер" />}
          {any && (
            <div className="small">
              Вернуть покупателю: <b>{fmt(estimate)}</b> {sale.method === "CASH" ? "наличными из кассы" : "через ЮKassa на карту или счёт"}
              {sale.customer ? " · бонусы пересчитаем" : ""}
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--gold btn--sm" disabled={pending || !any || (!!approvers && !approvalReady(approval))} onClick={submit}>
              {pending ? "Оформляем…" : "Оформить возврат"}
            </button>
            <button type="button" className="btn btn--line btn--sm" onClick={() => (setSale(null), setError(""))}>
              Другой чек
            </button>
          </div>
        </>
      )}
      {!sale && error && <div className="form-error">{error}</div>}
    </section>
  );
}
