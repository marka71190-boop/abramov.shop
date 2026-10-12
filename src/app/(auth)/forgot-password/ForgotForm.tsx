"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function ForgotForm({ telegram }: { telegram: string }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") || "").trim().toLowerCase();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setBusy(false);
    if (err) setError(authErrorMessage(err));
    else setSent(email);
  }

  return (
    <form className="auth__form" onSubmit={onSubmit}>
      <h1 className="h3" style={{ margin: 0 }}>
        Восстановление пароля
      </h1>
      {sent ? (
        <>
          <div className="form-ok">
            Если аккаунт с почтой {sent} есть, мы отправили ссылку для нового пароля — на почту и в Telegram, если он привязан. Ссылка действует 1 час.
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Письма нет? Проверьте «Спам» или напишите нам в{" "}
            <a href={`https://t.me/${telegram}`} target="_blank" rel="noreferrer">
              Telegram @{telegram}
            </a>
            .
          </p>
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Укажите почту, с которой регистрировались. Пришлём ссылку, по которой можно задать новый пароль.
          </p>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <label className="field">
            Email
            <input className="input" name="email" type="email" required autoComplete="email" />
          </label>
          <button type="submit" className="btn btn--gold" disabled={busy}>
            {busy ? "Отправляем…" : "Прислать ссылку"}
          </button>
        </>
      )}
      <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
        <Link href="/login">← Вернуться ко входу</Link>
      </p>
    </form>
  );
}
