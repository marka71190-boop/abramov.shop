"use client";
import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { authClient } from "@/lib/auth-client";
import { kassaEmail } from "@/lib/site";

const KEY = "as_kassa_login";

export function KassaLoginForm({ initialLogin }: { initialLogin: string }) {
  const [login, setLogin] = useState(initialLogin);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Логин запоминаем на этом телефоне — пароль сохранит браузер, если разрешить
  useEffect(() => {
    if (initialLogin) return;
    try {
      const v = localStorage.getItem(KEY);
      if (v) setLogin(v);
    } catch {}
  }, [initialLogin]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const l = login.trim().toLowerCase();
    if (!l || !password) return setError("Введите логин и пароль");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({ email: kassaEmail(l), password, rememberMe: true }).catch(() => ({ error: { status: 0 } as { status: number; code?: string } }));
    if (err) {
      setBusy(false);
      setError(err.status === 429 ? "Слишком много попыток — подождите минуту" : err.status === 0 ? "Нет связи с сервером" : "Неверный логин или пароль");
      return;
    }
    try {
      localStorage.setItem(KEY, l);
    } catch {}
    window.location.href = "/kassa";
  }

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
      <label className="field">
        Логин
        <input
          className="input"
          name="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="kassa1"
          required
        />
      </label>
      <label className="field">
        Пароль
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <button className="btn btn--gold" disabled={busy}>
        {busy ? "Входим…" : "Войти в кассу"}
      </button>
    </form>
  );
}
