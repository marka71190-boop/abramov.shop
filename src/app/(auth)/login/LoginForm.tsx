"use client";
import Link from "next/link";
import { useState } from "react";
import { IconGoogle } from "@/components/Icons";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function LoginForm({ next, google }: { next: string; google: boolean }) {
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

  async function onGoogle() {
    setBusy(true);
    // Новых пользователей сервер без галочки не создаст и вернёт на регистрацию
    await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/register?from=google" });
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

      {google && (
        <>
          <button type="button" className="btn btn--light" onClick={onGoogle} disabled={busy}>
            <IconGoogle /> Войти через Google
          </button>
          <div className="divider">или по почте</div>
        </>
      )}

      <label className="field">
        Email
        <input className="input" name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        Пароль
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
