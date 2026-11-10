"use client";
/**
 * Выдача заказов с сайта в клубе: список заказов клуба, поиск по номеру (или сканер — QR со страницы
 * заказа у покупателя), «Выдано». Сверка: имя и последние цифры телефона покупателя.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PickupView } from "@/lib/pickup";
import { BarcodeScanner, signal } from "@/components/pos/BarcodeScanner";
import { useScanWedge } from "@/components/pos/useScanWedge";
import { posPickupFind, posPickupIssue } from "./actions";

const fmt = (kop: number) => `${(kop / 100).toLocaleString("ru-RU")} ₽`;
const ORDER_RE = /AS-\d{6}-[A-Z0-9]{3,8}/i;

export function PickupPanel({ queue }: { queue: PickupView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [found, setFound] = useState<PickupView | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [scan, setScan] = useState(false);
  const [pending, start] = useTransition();

  const find = (raw: string) =>
    start(async () => {
      setError("");
      setDone("");
      setConfirm(false);
      const r = await posPickupFind(raw);
      if (r.error) return setError(r.error);
      setFound(r.order!);
      setOpen(true);
    });

  // Сканер-пистолет или камера: QR со страницы заказа — это ссылка с номером заказа
  const onCode = (code: string) => {
    const m = ORDER_RE.exec(code);
    if (!m) return null;
    setScan(false);
    setNumber(m[0].toUpperCase());
    find(m[0]);
    return m[0].toUpperCase();
  };
  // Отсканировали заказ, даже когда панель закрыта, — открываем её с этим заказом
  useScanWedge((code) => {
    if (!ORDER_RE.test(code)) return false;
    signal(!!onCode(code));
  }, !scan);

  const issue = (o: PickupView) =>
    start(async () => {
      const r = await posPickupIssue(o.id);
      if (r.error) return setError(r.error);
      setDone(r.ok!);
      setFound(null);
      setNumber("");
      setConfirm(false);
      router.refresh();
    });

  if (!open)
    return (
      <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen(true)}>
        📦 Выдать заказ с сайта{queue.length ? ` · ${queue.length}` : ""}
      </button>
    );

  const card = (o: PickupView, big = false) => (
    <div key={o.id} className={`panel stack${big ? " pickup--found" : ""}`} style={{ gap: 6 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <b>{o.number}</b>
        <span className={`pill ${o.ready ? "pill--ok" : "pill--warn"}`}>{o.ready ? "готов к выдаче" : "ещё собирают"}</span>
      </div>
      <div className="small">
        {o.customer}
        {o.phoneTail ? ` · телефон ${o.phoneTail}` : ""}
      </div>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {o.items.map((i, k) => (
          <li key={k}>
            {i.name} × {i.qty}
          </li>
        ))}
      </ul>
      <div className="muted small">
        Оплачен на сайте · {fmt(o.total)} · {o.club}
      </div>
      {big &&
        (confirm ? (
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--gold" style={{ flex: 1 }} disabled={pending} onClick={() => issue(o)}>
              {pending ? "…" : "Да, выдал"}
            </button>
            <button type="button" className="btn btn--line" onClick={() => setConfirm(false)}>
              Нет
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--gold" onClick={() => setConfirm(true)}>
            Выдать заказ
          </button>
        ))}
      {big && !o.ready && !confirm && <p className="muted small" style={{ margin: 0 }}>Заказ ещё не отмечен «Готов к выдаче». Если всё на месте — выдавайте.</p>}
      {!big && (
        <button type="button" className="btn btn--line btn--sm" onClick={() => (setFound(o), setNumber(o.number), setConfirm(false), setError(""), setDone(""))}>
          Выдать
        </button>
      )}
    </div>
  );

  return (
    <section className="panel stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="h4" style={{ margin: 0 }}>
          Выдача заказов с сайта
        </h2>
        <button type="button" className="linklike small" onClick={() => (setOpen(false), setFound(null), setError(""), setDone(""))}>
          Закрыть
        </button>
      </div>
      {done && <div className="form-ok">{done}</div>}
      {scan && <BarcodeScanner onCode={onCode} onClose={() => setScan(false)} />}
      <div className="tr-find">
        <input
          className="input"
          value={number}
          onChange={(e) => setNumber(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && number.trim().length >= 6 && find(number)}
          placeholder="Номер заказа: AS-261110-ABCD"
          autoComplete="off"
          spellCheck={false}
          aria-label="Номер заказа"
        />
        {!scan && (
          <button type="button" className="btn btn--line tr-scan" onClick={() => setScan(true)} aria-label="Сканировать QR заказа" title="Сканер">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M16 8v8" />
            </svg>
          </button>
        )}
      </div>
      <button type="button" className="btn btn--gold btn--sm" style={{ alignSelf: "flex-start" }} disabled={pending || number.trim().length < 6} onClick={() => find(number)}>
        {pending && !found ? "Ищем…" : "Найти"}
      </button>
      <p className="muted small" style={{ margin: 0 }}>
        Покупатель показывает номер или QR со страницы заказа (ссылка в письме). Сверьте имя и последние цифры телефона.
      </p>
      {error && <div className="form-error">{error}</div>}
      {found && card(found, true)}
      {!found && queue.length > 0 && (
        <>
          <h3 className="h5" style={{ margin: "4px 0 0" }}>
            Ждут выдачи · {queue.length}
          </h3>
          {queue.map((o) => card(o))}
        </>
      )}
      {!found && queue.length === 0 && <p className="muted small">Сейчас заказов к выдаче нет.</p>}
    </section>
  );
}
