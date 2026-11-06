"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { VariantPicker, type PickOption } from "@/components/admin/VariantPicker";
import { posCancel, posCreate, posStatus, shiftClose, shiftOpen, type SaleView, type ShiftState } from "./actions";

type Method = "CASH" | "SBP" | "CARD";
type Line = { o: PickOption; qty: number; price: string };

const fmt = (kop: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(kop / 100) + " ₽";
const toKop = (v: string) => Math.round(Number(v.replace(",", ".").replace(/\s/g, "")) * 100);
const PLACE_KEY = "pos-place";

export function PosTerminal({
  options,
  places,
  ykEnabled,
  canEditPrice = true,
  maxDiscountPct = null,
}: {
  options: PickOption[];
  places: string[];
  ykEnabled: boolean;
  canEditPrice?: boolean;
  maxDiscountPct?: number | null; // кассир: скидка не больше, %
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<Method>("CASH");
  const [contact, setContact] = useState("");
  const [given, setGiven] = useState("");
  const [error, setError] = useState("");
  const [sale, setSale] = useState<SaleView | null>(null);
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [note, setNote] = useState("");


  const picked = useMemo(() => new Set(lines.map((l) => l.o.id)), [lines]);
  const subtotal = lines.reduce((a, l) => a + (toKop(l.price) || 0) * l.qty, 0);
  const disc = (() => {
    const v = discount.trim();
    if (!v) return 0;
    if (v.endsWith("%")) return Math.round((subtotal * Math.min(100, Math.max(0, Number(v.slice(0, -1).replace(",", ".")) || 0))) / 100);
    return Math.min(subtotal, Math.max(0, toKop(v) || 0));
  })();
  const total = subtotal - disc;
  const discTooBig = maxDiscountPct != null && disc > Math.round((subtotal * maxDiscountPct) / 100);
  const change = given.trim() ? toKop(given) - total : null;

  const add = (o: PickOption) => {
    setNote("");
    setLines((ls) => [...ls, { o, qty: 1, price: String(o.price / 100) }]);
  };
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  function reset() {
    setLines([]);
    setDiscount("");
    setContact("");
    setGiven("");
    setSale(null);
    setError("");
    setConfirmCancel(false);
  }

  function submit() {
    setError("");
    for (const l of lines) {
      const p = toKop(l.price);
      if (!(p >= 0)) return setError(`«${l.o.name}»: проверьте цену`);
      if (l.qty > l.o.stock) return setError(`«${l.o.name}»: в наличии ${l.o.stock} шт`);
    }
    start(async () => {
      const r = await posCreate({
        items: lines.map((l) => ({ variantId: l.o.id, qty: l.qty, price: toKop(l.price) })),
        discount: disc,
        method,
        place: null, // место — из смены
        contact: method === "CASH" ? null : contact.trim() || null,
      });
      if (r.error) return setError(r.error);
      setSale(r.sale!);
      router.refresh();
    });
  }

  // Ждём оплату по QR: спрашиваем раз в 3 секунды
  const saleRef = useRef(sale);
  saleRef.current = sale;
  useEffect(() => {
    if (sale?.status !== "PENDING") return;
    const t = setInterval(async () => {
      const cur = saleRef.current;
      if (!cur || cur.status !== "PENDING") return;
      const r = await posStatus(cur.id);
      if (r.sale && r.sale.status !== "PENDING") {
        setSale(r.sale);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [sale?.id, sale?.status, router]);

  function cancel() {
    if (!sale) return;
    start(async () => {
      const r = await posCancel(sale.id);
      if (r.error) return setError(r.error);
      setNote(r.ok ?? "");
      reset();
      router.refresh();
    });
  }

  // Экран оплаты / результата
  if (sale) {
    const paid = sale.status === "PAID";
    const cancelled = sale.status === "CANCELLED";
    return (
      <div className="pos-pay">
        <div className="muted small">Продажа {sale.number}</div>
        <div className="pos-pay__sum">{fmt(sale.total)}</div>
        {paid && (
          <>
            <div className="pos-pay__ok" role="status">
              ✓ {sale.method === "CASH" ? "Продано за наличные" : "Оплачено"}
            </div>
            {sale.method === "CASH" && <p className="muted small" style={{ margin: 0 }}>Не забудьте пробить чек на кассе.</p>}
            {sale.method === "CASH" && change != null && change > 0 && <p style={{ margin: 0 }}>Сдача: <b>{fmt(change)}</b></p>}
          </>
        )}
        {cancelled && <div className="form-error">Оплата не прошла — продажа отменена, товар вернулся на склад</div>}
        {sale.status === "PENDING" && (
          <>
            <p style={{ margin: 0 }}>{sale.method === "SBP" ? "Покупатель сканирует QR камерой телефона и подтверждает оплату в банке" : "Покупатель сканирует QR и оплачивает картой на открывшейся странице"}</p>
            {sale.qr ? <div className="pos-qr" dangerouslySetInnerHTML={{ __html: sale.qr }} /> : <p className="form-error">Нет QR-кода — отмените и попробуйте снова</p>}
            {sale.method === "SBP" && sale.qrUrl && (
              <p className="muted small" style={{ margin: 0 }}>
                Покупатель с этим же телефоном? <a href={sale.qrUrl} target="_blank" rel="noreferrer">Открыть оплату в банке</a>
              </p>
            )}
            <div className="muted small pos-wait">Ждём оплату…</div>
          </>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="row" style={{ gap: 10, justifyContent: "center" }}>
          {sale.status !== "PENDING" ? (
            <button type="button" className="btn btn--gold" onClick={reset}>
              Новая продажа
            </button>
          ) : (
            <button type="button" className="btn btn--line" onClick={() => (confirmCancel ? cancel() : setConfirmCancel(true))} disabled={pending}>
              {confirmCancel ? "Точно отменить?" : "Отменить"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pos stack" style={{ gap: 14 }}>
      {note && <div className="form-ok">{note}</div>}
      <VariantPicker options={options.filter((o) => o.stock > 0)} onPick={add} exclude={picked} placeholder="Товар: название или артикул (можно сканером)" />

      {lines.length > 0 ? (
        <ul className="pos-lines">
          {lines.map((l, i) => (
            <li key={l.o.id}>
              <div className="pos-lines__name">
                {l.o.name}
                <span className="muted small">{[l.o.sku, `в наличии ${l.o.stock}`].filter(Boolean).join(" · ")}</span>
              </div>
              <div className="pos-qty">
                <button type="button" aria-label="Меньше" onClick={() => (l.qty > 1 ? upd(i, { qty: l.qty - 1 }) : setLines((ls) => ls.filter((_, n) => n !== i)))}>
                  −
                </button>
                <span>{l.qty}</span>
                <button type="button" aria-label="Больше" disabled={l.qty >= l.o.stock} onClick={() => upd(i, { qty: l.qty + 1 })}>
                  +
                </button>
              </div>
              {canEditPrice ? (
                <label className="pos-price">
                  <input className="input" inputMode="decimal" value={l.price} onChange={(e) => upd(i, { price: e.target.value })} aria-label="Цена за 1 шт, ₽" />
                  <span className="muted small">₽</span>
                </label>
              ) : (
                <span className="pos-price">{fmt(toKop(l.price) * l.qty)}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Найдите товар — он добавится в чек.{canEditPrice ? " Цену в строке можно поменять." : ""}
        </p>
      )}

      <div className="pos-grid">
        {maxDiscountPct !== 0 && (
          <label className="field" style={{ margin: 0 }}>
            Скидка{maxDiscountPct != null ? ` (до ${maxDiscountPct} %)` : ""}
            <input className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder={maxDiscountPct != null ? `${maxDiscountPct}%` : "500 или 10%"} inputMode="decimal" />
            {discTooBig && <span className="form-error small">Больше {maxDiscountPct} % — только менеджер</span>}
          </label>
        )}
      </div>

      <div className="pos-methods" role="radiogroup" aria-label="Оплата">
        {(
          [
            ["CASH", "Наличные"],
            ["SBP", "СБП"],
            ["CARD", "Карта"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={method === k} className={method === k ? "is-on" : ""} disabled={k !== "CASH" && !ykEnabled} onClick={() => setMethod(k)}>
            {label}
          </button>
        ))}
      </div>
      {!ykEnabled && <p className="muted small" style={{ margin: 0 }}>СБП и карта появятся, когда на сайте подключена ЮKassa.</p>}

      {method === "CASH" ? (
        <label className="field" style={{ margin: 0 }}>
          Получено от покупателя (для сдачи)
          <input className="input" value={given} onChange={(e) => setGiven(e.target.value)} inputMode="decimal" placeholder="5000" />
          {change != null && total > 0 && <span className={change < 0 ? "form-error small" : "small"}>{change < 0 ? `Не хватает ${fmt(-change)}` : `Сдача ${fmt(change)}`}</span>}
        </label>
      ) : (
        <label className="field" style={{ margin: 0 }}>
          Чек покупателю — почта или телефон (необязательно)
          <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="mail@example.ru или +7…" autoComplete="off" />
          <span className="muted small">Не сохраняем — только передаём в ЮKassa для чека. Пусто — чек придёт на почту магазина.</span>
        </label>
      )}

      {error && <div className="form-error">{error}</div>}
      <div className="pos-total">
        <div>
          <div className="muted small">{disc > 0 ? `${fmt(subtotal)} − скидка ${fmt(disc)}` : "К оплате"}</div>
          <div className="pos-total__sum">{fmt(total)}</div>
        </div>
        <button type="button" className="btn btn--gold" disabled={pending || !lines.length || discTooBig || (method !== "CASH" && total <= 0)} onClick={submit}>
          {pending ? "Проводим…" : method === "CASH" ? "Продать за наличные" : "Показать QR"}
        </button>
      </div>
    </div>
  );
}

/** Отмена продажи из списка за день */
export function CancelSale({ id, paid, cash }: { id: string; paid: boolean; cash: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (msg) return <span className="small form-ok">{msg}</span>;
  return (
    <span className="row" style={{ gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
      {ask && <span className="small muted">{paid ? (cash ? "Товар вернётся на склад, наличные отдаёте сами." : "Деньги вернутся покупателю через ЮKassa.") : ""}</span>}
      <button
        type="button"
        className="linklike small"
        disabled={pending}
        onClick={() => {
          if (!ask) return setAsk(true);
          start(async () => {
            const r = await posCancel(id);
            setMsg(r.ok ?? r.error ?? "");
            router.refresh();
          });
        }}
      >
        {pending ? "…" : ask ? "Да, отменить" : "Отменить"}
      </button>
    </span>
  );
}

/** Смена: открыть с разменом / закрыть с пересчётом наличных */
export function ShiftPanel({
  shift,
  places,
  clubs,
  allowOther,
}: {
  shift: { openedAt: string; place: string | null; opening: number; cash: number; other: number; count: number; pending: number } | null;
  places: string[]; // турниры и другие места, где уже продавали
  clubs: { id: string; title: string }[]; // клубы, где может работать продавец
  allowOther: boolean; // можно ли продавать не в клубе (турнир)
}) {
  const router = useRouter();
  const [openState, openAction, opening] = useActionState<ShiftState, FormData>(async (s, fd) => {
    const r = await shiftOpen(s, fd);
    if (r.ok) router.refresh();
    return r;
  }, {});
  const [closeState, closeAction, closing] = useActionState<ShiftState, FormData>(async (s, fd) => {
    const r = await shiftClose(s, fd);
    if (r.ok) router.refresh();
    return r;
  }, {});
  const [ask, setAsk] = useState(false);
  const [counted, setCounted] = useState("");
  const [place, setPlace] = useState("");
  const [clubId, setClubId] = useState(clubs.length === 1 ? clubs[0].id : "");
  // Клуб запоминаем на этом телефоне
  useEffect(() => {
    try {
      const v = localStorage.getItem(PLACE_KEY);
      if (v && clubs.some((c) => c.id === v)) setClubId(v);
      else if (v?.startsWith("other:") && allowOther) {
        setClubId("other");
        setPlace(v.slice(6));
      }
    } catch {}
  }, [clubs, allowOther]);
  const remember = (v: string) => {
    try {
      localStorage.setItem(PLACE_KEY, v);
    } catch {}
  };

  if (!shift) {
    return (
      <form action={openAction} className="pos-shift stack" style={{ gap: 12 }}>
        <div>
          <strong>Откройте смену</strong>
          <div className="muted small">Впишите, сколько наличных в кассе для сдачи. В конце смены пересчитаете — сайт сверит с продажами.</div>
        </div>
        {closeState.ok && <div className="form-ok">{closeState.ok}</div>}
        <div className="pos-grid">
          <label className="field" style={{ margin: 0 }}>
            Размен в кассе, ₽
            <input className="input" name="opening" inputMode="decimal" placeholder="0" />
          </label>
        </div>
        <fieldset className="stack" style={{ gap: 6, margin: 0, padding: 0, border: 0 }}>
          <legend className="small muted" style={{ marginBottom: 6 }}>
            Где продаём
          </legend>
          <input type="hidden" name="clubId" value={clubId === "other" ? "" : clubId} />
          {clubs.map((c) => (
            <label key={c.id} className="check" style={{ margin: 0 }}>
              <input
                type="radio"
                name="pickClub"
                checked={clubId === c.id}
                onChange={() => {
                  setClubId(c.id);
                  remember(c.id);
                }}
              />
              <span>{c.title}</span>
            </label>
          ))}
          {allowOther && (
            <label className="check" style={{ margin: 0 }}>
              <input type="radio" name="pickClub" checked={clubId === "other"} onChange={() => setClubId("other")} />
              <span>Другое место — турнир, выезд</span>
            </label>
          )}
          {clubId === "other" && (
            <>
              <input
                className="input"
                name="place"
                list="pos-places-shift"
                value={place}
                onChange={(e) => {
                  setPlace(e.target.value);
                  remember(`other:${e.target.value}`);
                }}
                placeholder="Например: Кубок Кремля"
                maxLength={120}
                required
              />
              <datalist id="pos-places-shift">
                {places.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          )}
        </fieldset>
        {openState.error && <div className="form-error">{openState.error}</div>}
        <button className="btn btn--gold" disabled={opening || !clubId}>
          {opening ? "Открываем…" : "Открыть смену"}
        </button>
      </form>
    );
  }

  const expected = shift.opening + shift.cash;
  const diff = counted.trim() ? toKop(counted) - expected : null;
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Europe/Moscow" }).format(new Date(shift.openedAt));
  return (
    <div className="pos-shift stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div className="small">
          <strong>Смена с {time}</strong>
          {shift.place ? ` · ${shift.place}` : ""}
          <div className="muted">
            {shift.count} чек. · наличные {fmt(shift.cash)} · СБП и карта {fmt(shift.other)} · в кассе должно быть <b>{fmt(expected)}</b>
          </div>
        </div>
        {!ask && (
          <button type="button" className="btn btn--line btn--sm" onClick={() => setAsk(true)}>
            Закрыть смену
          </button>
        )}
      </div>
      {ask && (
        <form action={closeAction} className="stack" style={{ gap: 10 }}>
          <div className="pos-grid">
            <label className="field" style={{ margin: 0 }}>
              Пересчитали наличные, ₽
              <input className="input" name="counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus required />
              {diff != null && (
                <span className={diff === 0 ? "small form-ok-text" : "small is-loss"}>{diff === 0 ? "Сходится" : diff < 0 ? `Недостача ${fmt(-diff)}` : `Излишек ${fmt(diff)}`}</span>
              )}
            </label>
            <label className="field" style={{ margin: 0 }}>
              Комментарий
              <input className="input" name="note" maxLength={300} placeholder={diff ? "Почему не сходится" : "Необязательно"} />
            </label>
          </div>
          {shift.pending > 0 && <div className="form-error">Есть продажа по QR, которая ждёт оплату — дождитесь её или отмените</div>}
          {closeState.error && <div className="form-error">{closeState.error}</div>}
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn--gold btn--sm" disabled={closing}>
              {closing ? "Закрываем…" : "Закрыть смену"}
            </button>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setAsk(false)}>
              Не сейчас
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
