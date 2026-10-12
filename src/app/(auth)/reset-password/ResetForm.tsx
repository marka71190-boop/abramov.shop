"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function ResetForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(invalid ? authErrorMessage({ code: "INVALID_TOKEN" }) : null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") || "");
    if (password !== String(f.get("password2") || "")) return setError("Пароли не совпадают");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    if (err) setError(authErrorMessage(err));
    else setDone(true);
  }

  return (
    <form className="auth__form" onSubmit={onSubmit}>
      <h1 className="h3" style={{ margin: 0 }}>
        Новый пароль
      </h1>
      {done ? (
        <>
          <div className="form-ok">Пароль изменён. Мы вышли из аккаунта на всех устройствах — войдите с новым паролем.</div>
          <Link href="/login" className="btn btn--gold">
            Войти
          </Link>
        </>
      ) : (
        <>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {invalid ? (
            <Link href="/forgot-password" className="btn btn--gold">
              Запросить новую ссылку
            </Link>
          ) : (
            <>
              <label className="field">
                Новый пароль
                <input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Не короче 8 символов" />
              </label>
              <label className="field">
                Ещё раз
                <input className="input" name="password2" type="password" required minLength={8} autoComplete="new-password" />
              </label>
              <button type="submit" className="btn btn--gold" disabled={busy}>
                {busy ? "Сохраняем…" : "Сохранить пароль"}
              </button>
            </>
          )}
        </>
      )}
    </form>
  );
}
