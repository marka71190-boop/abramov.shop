"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function LoginForm({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <input className="input" name="password" type="password" required autoComplete="current-password" />
      </label>
      <button type="submit" className="btn btn--gold" disabled={busy} style={{ marginTop: 4 }}>
        {busy ? "Входим…" : "Войти"}
      </button>
      <p className="muted small" style={{ margin: 0, textAlign: "center" }}>
        Впервые у нас? <Link href={`/register?next=${encodeURIComponent(next)}`}>Создайте аккаунт</Link>
      </p>
    </form>
  );
}
