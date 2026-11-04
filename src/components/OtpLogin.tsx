"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { goal } from "@/lib/track";

/**
 * Вход по коду из письма: почта → 6 цифр → вошли. Аккаунт не создаёт —
 * только для тех, кто уже зарегистрирован.
 */
export function OtpLogin({ initialEmail = "", onDone, submitLabel = "Войти" }: { initialEmail?: string; onDone: () => void; submitLabel?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setError("Проверьте адрес почты");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({ email: e, type: "sign-in" });
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    setSentTo(e);
    setCode("");
    setWait(60);
  }

  async function verify(otp: string) {
    if (!sentTo || otp.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.emailOtp({ email: sentTo, otp });
    if (err) {
      setBusy(false);
      return setError(authErrorMessage(err));
    }
    goal("login_otp");
    onDone();
  }

  if (!sentTo)
    return (
      <div className="stack" style={{ gap: 12 }}>
        <label className="field">
          Email
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
          />
        </label>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button type="button" className="btn btn--gold" disabled={busy} onClick={send}>
          {busy ? "Отправляем…" : "Получить код на почту"}
        </button>
      </div>
    );

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="small" style={{ margin: 0 }}>
        Если аккаунт с почтой <b>{sentTo}</b> есть, на неё пришёл код из 6 цифр. Проверьте «Спам», если письма нет.
      </p>
      <label className="field">
        Код из письма
        <input
          className="input otp-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          autoFocus
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6) verify(v);
          }}
          placeholder="000000"
        />
      </label>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="btn btn--gold" disabled={busy || code.length !== 6} onClick={() => verify(code)}>
        {busy ? "Проверяем…" : submitLabel}
      </button>
      <div className="row small" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="linklike" disabled={wait > 0 || busy} onClick={send}>
          {wait > 0 ? `Отправить снова через ${wait} с` : "Отправить код снова"}
        </button>
        <button type="button" className="linklike" onClick={() => setSentTo(null)}>
          Другая почта
        </button>
      </div>
    </div>
  );
}
