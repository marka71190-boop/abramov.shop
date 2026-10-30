"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { RichText } from "@/components/RichText";
import { coachAgreementBody } from "@/content/coach-agreement";
import { agreementConfirm, agreementStart } from "../actions";

const today = () => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" }).format(new Date());

export function SignForm({ defaults, email }: { defaults: { fullName: string; phone: string }; email: string }) {
  const [fullName, setFullName] = useState(defaults.fullName);
  const [taxStatus, setTaxStatus] = useState("SELF");
  const [inn, setInn] = useState("");
  const [phone, setPhone] = useState(defaults.phone);
  const [state, action, pending] = useActionState(agreementStart, {});
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [confirming, start] = useTransition();
  const router = useRouter();
  const preview = coachAgreementBody({ fullName: fullName || "[ФИО]", taxStatus, inn: inn || null, phone: phone || "[телефон]", email, date: today() });

  if (state.id)
    return (
      <div className="panel stack" style={{ gap: 14 }}>
        <h2 className="h3" style={{ margin: 0 }}>
          Введите код из письма
        </h2>
        <p className="muted small" style={{ margin: 0 }}>
          Мы отправили 6 цифр на <b>{email}</b>. Код действует 15 минут. Вводя код, вы подписываете соглашение простой электронной подписью.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <input
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            style={{ width: 160, fontSize: 22, letterSpacing: 6, textAlign: "center" }}
            aria-label="Код из письма"
          />
          <button
            type="button"
            className="btn btn--gold btn--cut"
            disabled={confirming || code.length !== 6}
            onClick={() =>
              start(async () => {
                const r = await agreementConfirm(state.id!, code);
                setMsg(r);
                if (r.ok) router.refresh();
              })
            }
          >
            {confirming ? "Подписываем…" : "Подписать"}
          </button>
        </div>
        {msg.error && <div className="form-error">{msg.error}</div>}
        {msg.ok && <div className="form-ok">{msg.ok}</div>}
        <form action={action}>
          {Object.entries({ fullName, taxStatus, inn, phone, agree: "on" }).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button className="linklike small" disabled={pending}>
            Письмо не пришло — отправить код ещё раз
          </button>
          {state.error && <span className="form-error small"> {state.error}</span>}
        </form>
      </div>
    );

  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <div className="panel stack" style={{ gap: 14 }}>
        <h2 className="h3" style={{ margin: 0 }}>
          1. Ваши данные
        </h2>
        <div className="form-grid">
          <label className="field">
            Фамилия, имя, отчество полностью
            <input className="input" name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} autoComplete="name" />
          </label>
          <label className="field">
            Телефон
            <input className="input" name="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={40} autoComplete="tel" />
          </label>
          <label className="field">
            Статус
            <select className="select" name="taxStatus" value={taxStatus} onChange={(e) => setTaxStatus(e.target.value)}>
              <option value="SELF">Самозанятый</option>
              <option value="IP">ИП</option>
              <option value="PERSON">Физлицо без статуса</option>
            </select>
          </label>
          <label className="field">
            ИНН {taxStatus === "PERSON" ? "(необязательно)" : ""}
            <input className="input" name="inn" inputMode="numeric" value={inn} onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))} maxLength={12} required={taxStatus !== "PERSON"} />
          </label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Почта для кода и копии соглашения — {email} (почта вашего аккаунта).
        </p>
      </div>

      <div className="panel stack" style={{ gap: 12 }}>
        <h2 className="h3" style={{ margin: 0 }}>
          2. Прочитайте соглашение
        </h2>
        <div className="agreement__preview">
          <RichText text={preview} />
        </div>
      </div>

      <div className="panel stack" style={{ gap: 12 }}>
        <h2 className="h3" style={{ margin: 0 }}>
          3. Подпишите
        </h2>
        <label className="check">
          <input type="checkbox" name="agree" required />
          <span>Я прочитал(а) соглашение, данные указаны верно, согласен(на) с условиями и с подписанием кодом из письма</span>
        </label>
        {state.error && <div className="form-error">{state.error}</div>}
        <div>
          <button className="btn btn--gold btn--cut" disabled={pending}>
            {pending ? "Отправляем код…" : "Получить код на почту"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn btn--line btn--sm" onClick={() => window.print()}>
      Распечатать или сохранить PDF
    </button>
  );
}
