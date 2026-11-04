"use client";
import Link from "next/link";
import { OtpLogin } from "@/components/OtpLogin";
import { PasswordInput } from "@/components/PasswordInput";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function LoginForm({ next, notice }: { next: string; notice?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"password" | "code">("password");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({
      email: String(f.get("email") || "").trim().toLowerCase(),
      password: String(f.get("password") || ""),
    });
    if (err) {
      setError(authErrorMessage(err));
      setBusy(false);
      return;
    }
    window.location.href = next;
  }

  return (
    <form className="auth__form" onSubmit={onSubmit}>
      <nav className="tabs" aria-label="Вход или регистрация">
        <Link href="/login" aria-current="page">
          Вход
        </Link>
        <Link href={`/register?next=${encodeURIComponent(next)}`}>Регистрация</Link>
      </nav>

      {notice && <div className="auth-context">{notice}</div>}

      <div className="login-mode" role="group" aria-label="Как войти">
        <button type="button" aria-pressed={mode === "password"} onClick={() => setMode("password")}>
          По паролю
        </button>
        <button type="button" aria-pressed={mode === "code"} onClick={() => setMode("code")}>
          По коду из письма
        </button>
      </div>

      {mode === "code" ? (
        <OtpLogin onDone={() => (window.location.href = next)} />
      ) : (
        <>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <label className="field">
        Email
        <input className="input" name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        <span className="row" style={{ justifyContent: "space-between" }}>
          Пароль
          <Link href="/forgot-password" className="small">
            Забыли пароль?
          </Link>
        </span>
        <PasswordInput name="password" required autoComplete="current-password" />
      </label>
      <button type="submit" className="btn btn--gold" disabled={busy} style={{ marginTop: 4 }}>
        {busy ? "Входим…" : "Войти"}
      </button>
        </>
      )}
      <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
        Впервые у нас? <Link href={`/register?next=${encodeURIComponent(next)}`}>Создайте аккаунт</Link>
      </p>
    </form>
  );
}
