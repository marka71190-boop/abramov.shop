"use client";
/**
 * Продажа подарочного сертификата в кассе: номинал, оплата (наличные / СБП / карта по QR),
 * по желанию — почта получателя. Оплачено — на экране код сертификата и QR страницы сертификата:
 * покупатель фотографирует или сканирует, сертификат открывается у него в телефоне.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { posCancel, posGiftSell, posStatus, type SaleView } from "./actions";

const fmt = (kop: number) => `${(kop / 100).toLocaleString("ru-RU")} ₽`;
type Method = "CASH" | "SBP" | "CARD";

export function GiftSell({ nominals, ykEnabled }: { nominals: number[]; ykEnabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(nominals[0] ?? 3000));
  const [method, setMethod] = useState<Method>("CASH");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [sale, setSale] = useState<SaleView | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // Оплата по QR: проверяем раз в 3 секунды
  const ref = useRef(sale);
  ref.current = sale;
  useEffect(() => {
    if (sale?.status !== "PENDING") return;
    const t = setInterval(async () => {
      const cur = ref.current;
      if (!cur || cur.status !== "PENDING") return;
      const r = await posStatus(cur.id);
      if (r.sale) setSale(r.sale);
    }, 3000);
    return () => clearInterval(t);
  }, [sale?.status]);

  const reset = () => {
    setSale(null);
    setError("");
    setEmail("");
    setContact("");
  };

  if (!open)
    return (
      <button type="button" className="btn btn--line btn--sm" onClick={() => setOpen(true)}>
        🎁 Продать сертификат
      </button>
    );

  const rub = Math.trunc(Number(amount.replace(/\D/g, "")) || 0);

  return (
    <section className="panel stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="h4" style={{ margin: 0 }}>
          Подарочный сертификат
        </h2>
        <button type="button" className="linklike small" onClick={() => (setOpen(false), reset())}>
          Закрыть
        </button>
      </div>

      {sale ? (
        <div className="pos-pay">
          <div className="muted small">Продажа {sale.number}</div>
          <div className="pos-pay__sum">{fmt(sale.total)}</div>
          {sale.status === "PENDING" && (
            <>
              <p style={{ margin: 0 }}>{sale.method === "SBP" ? "Покупатель сканирует QR и подтверждает оплату в банке" : "Покупатель сканирует QR и платит картой"}</p>
              {sale.qr && <div className="pos-qr" dangerouslySetInnerHTML={{ __html: sale.qr }} />}
              <div className="muted small pos-wait">Ждём оплату…</div>
              <button
                type="button"
                className="btn btn--line btn--sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await posCancel(sale.id);
                    reset();
                    router.refresh();
                  })
                }
              >
                Отменить
              </button>
            </>
          )}
          {sale.status === "CANCELLED" && <div className="form-error">Оплата не прошла — сертификат не выпущен</div>}
          {sale.status === "PAID" && sale.gift && (
            <>
              <div className="pos-pay__ok" role="status">
                ✓ Сертификат на {fmt(sale.gift.amount)} продан
              </div>
              <div className="gift-code" aria-label="Код сертификата">
                {sale.gift.code}
              </div>
              <div className="pos-qr" dangerouslySetInnerHTML={{ __html: sale.gift.qr }} />
              <p className="small" style={{ margin: 0, textAlign: "center" }}>
                Покупатель сканирует QR — сертификат откроется у него в телефоне, там же можно распечатать.
                {sale.gift.expiresAt ? ` Действует до ${new Date(sale.gift.expiresAt).toLocaleDateString("ru-RU")}.` : ""}
                {sale.gift.emailed ? " Сертификат отправили на почту получателю." : ""}
              </p>
            </>
          )}
          {sale.status !== "PENDING" && (
            <button type="button" className="btn btn--gold" onClick={reset}>
              Готово
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {nominals.map((n) => (
              <button key={n} type="button" className={`chip${rub === n ? " is-on" : ""}`} onClick={() => setAmount(String(n))}>
                {n.toLocaleString("ru-RU")} ₽
              </button>
            ))}
          </div>
          <label className="field" style={{ margin: 0 }}>
            Номинал, ₽
            <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </label>
          <div className="pos-methods" role="radiogroup" aria-label="Оплата сертификата">
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
          <label className="field" style={{ margin: 0 }}>
            Почта получателя (необязательно)
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@mail.ru — пришлём сертификат письмом" autoComplete="off" />
          </label>
          {method !== "CASH" && (
            <label className="field" style={{ margin: 0 }}>
              Чек — почта или телефон покупателя (необязательно)
              <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="mail@example.ru или +7…" autoComplete="off" />
            </label>
          )}
          {error && <div className="form-error">{error}</div>}
          <button
            type="button"
            className="btn btn--gold"
            disabled={pending || rub < 100}
            onClick={() =>
              start(async () => {
                setError("");
                const r = await posGiftSell({ amount: rub * 100, method, recipientEmail: email.trim() || null, contact: contact.trim() || null });
                if (r.error) return setError(r.error);
                setSale(r.sale!);
                router.refresh();
              })
            }
          >
            {pending ? "Проводим…" : method === "CASH" ? `Продать за ${rub.toLocaleString("ru-RU")} ₽ наличными` : "Показать QR"}
          </button>
        </>
      )}
    </section>
  );
}
