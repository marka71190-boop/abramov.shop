"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { GiftCardView } from "@/components/gift/GiftCardView";
import { num } from "@/lib/format";
import { buyGiftAction, checkBalanceAction } from "./actions";

interface Props {
  nominals: number[]; // ₽
  customMin: number;
  customMax: number;
  validityDays: number;
  email: string;
  name: string;
  /** Почему купить нельзя (не вошёл, пауза, выключено) */
  blocked: { text: string; login?: boolean } | null;
}

const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export function GiftBuyForm(p: Props) {
  const [choice, setChoice] = useState<number | "custom">(p.nominals[1] ?? p.nominals[0] ?? "custom");
  const [custom, setCustom] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [when, setWhen] = useState<"now" | "date">("now");
  const [sendDate, setSendDate] = useState("");
  const [senderName, setSenderName] = useState(p.name);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(p.email);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const amount = choice === "custom" ? Math.floor(Number(custom.replace(/\s/g, "")) || 0) : choice;
  const customBad = choice === "custom" && (amount < p.customMin || amount > p.customMax);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (p.blocked || customBad || !amount) return;
    setError(null);
    start(async () => {
      const r = await buyGiftAction({
        amount,
        email,
        recipientName: recipientName || null,
        recipientEmail: recipientEmail.trim() || "",
        senderName: senderName || null,
        message: message || null,
        sendDate: recipientEmail.trim() && when === "date" && sendDate ? sendDate : null,
      }).catch((): { payUrl?: string; error?: string } => ({ error: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз" }));
      if (r.payUrl) window.location.href = r.payUrl;
      else setError(r.error ?? "Не получилось");
    });
  }

  return (
    <div className="gift-layout">
      <form className="stack" onSubmit={submit}>
        <fieldset className="panel stack" disabled={pending}>
          <legend className="step">
            <span>1</span> Номинал
          </legend>
          <div className="seg seg--amounts" role="radiogroup" aria-label="Номинал сертификата">
            {p.nominals.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={choice === n} onClick={() => setChoice(n)}>
                <strong>{num(n)} ₽</strong>
              </button>
            ))}
            {p.customMin > 0 && (
              <button type="button" role="radio" aria-checked={choice === "custom"} onClick={() => setChoice("custom")}>
                <strong>Своя сумма</strong>
              </button>
            )}
          </div>
          {choice === "custom" && (
            <label className="field">
              Сумма, ₽ — от {num(p.customMin)} до {num(p.customMax)}
              <input className="input" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d\s]/g, ""))} autoFocus />
              {custom && customBad && <span className="small" style={{ color: "var(--c-danger)" }}>Сумма — от {num(p.customMin)} до {num(p.customMax)} ₽</span>}
            </label>
          )}
        </fieldset>

        <fieldset className="panel stack ym-hide-content" disabled={pending}>
          <legend className="step">
            <span>2</span> Кому и от кого
          </legend>
          <div className="form-grid">
            <label className="field">
              Имя получателя — необязательно
              <input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={60} />
            </label>
            <label className="field">
              От кого
              <input className="input" value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={60} />
            </label>
          </div>
          <label className="field">
            Пожелание — необязательно
            <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} style={{ minHeight: 80, paddingTop: 12 }} />
            <span className="muted small">{message.length} / 300</span>
          </label>
        </fieldset>

        <fieldset className="panel stack ym-hide-content" disabled={pending}>
          <legend className="step">
            <span>3</span> Как подарить
          </legend>
          <label className="field">
            Почта получателя — пришлём ему сертификат
            <input className="input" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} maxLength={200} placeholder="Оставьте пустым, если вручите сами" />
            <span className="muted small">
              Почту получателя используем только чтобы отправить сертификат, после отправки скрываем.{" "}
              <Link href="/p/privacy">Политика конфиденциальности</Link>
            </span>
          </label>
          {recipientEmail.trim() && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="seg" role="radiogroup" aria-label="Когда отправить">
                <button type="button" role="radio" aria-checked={when === "now"} onClick={() => setWhen("now")}>
                  <strong>Сразу после оплаты</strong>
                </button>
                <button type="button" role="radio" aria-checked={when === "date"} onClick={() => setWhen("date")}>
                  <strong>В выбранный день</strong>
                  <span>утром, в 10:00 по Москве</span>
                </button>
              </div>
              {when === "date" && (
                <label className="field" style={{ maxWidth: 260 }}>
                  Дата отправки
                  <input className="input" type="date" min={today()} value={sendDate} onChange={(e) => setSendDate(e.target.value)} required />
                </label>
              )}
            </div>
          )}
          {!recipientEmail.trim() && <p className="muted small" style={{ margin: 0 }}>Без почты получателя ссылку на сертификат пришлём вам — перешлите её или распечатайте сертификат.</p>}
          <label className="field">
            Ваша почта — для чека и ссылки на сертификат
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
          </label>
        </fieldset>

        {p.blocked ? (
          <div className="notice notice--muted">
            {p.blocked.text}
            {p.blocked.login && (
              <>
                {" "}
                <Link href="/login?next=/gift">Войти</Link>
              </>
            )}
          </div>
        ) : (
          <>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div>
              <button className="btn btn--gold" disabled={pending || !amount || customBad}>
                {pending ? "Переходим к оплате…" : `Оплатить ${amount ? `${num(amount)} ₽` : ""}`}
              </button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Оплата через ЮKassa, чек придёт на почту. Сертификат действует {p.validityDays > 0 ? `${p.validityDays} дней с покупки` : "бессрочно"}, им можно
              оплатить заказ целиком или частично, остаток сохраняется.
            </p>
          </>
        )}
      </form>

      <div className="gift-layout__preview">
        <GiftCardView
          id="preview"
          amount={(amount || 0) * 100}
          recipientName={recipientName || null}
          senderName={senderName || null}
          message={message || null}
          validityDays={p.validityDays}
        />
        <BalanceCheck />
      </div>
    </div>
  );
}

function BalanceCheck() {
  const [code, setCode] = useState("");
  const [res, setRes] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="panel stack"
      style={{ gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setRes(await checkBalanceAction(code)));
      }}
    >
      <strong>Проверить баланс сертификата</strong>
      <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setRes({});
          }}
          placeholder="XXXX-XXXX-XXXX"
          aria-label="Код сертификата"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn btn--line btn--sm" style={{ minHeight: 48 }} disabled={pending || !code.trim()}>
          Проверить
        </button>
      </div>
      {res.ok && <div className="small" style={{ color: "var(--c-success)" }}>{res.ok}</div>}
      {res.error && <div className="small" style={{ color: "var(--c-danger)" }}>{res.error}</div>}
    </form>
  );
}
