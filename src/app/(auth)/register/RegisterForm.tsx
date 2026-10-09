"use client";
import Link from "next/link";
import { useState } from "react";
import { IconGoogle, IconVk } from "@/components/Icons";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

interface Props {
  next: string;
  google: boolean;
  vk: boolean;
  socialFailed: "google" | "vk" | null;
}

const SOCIAL_NAME = { google: "Google", vk: "VK ID" } as const;

/** Галочку записываем на сервере ДО создания аккаунта — без неё сервер аккаунт не создаст. */
async function saveConsent(body: Record<string, unknown>) {
  const res = await fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personalData: true, ...body }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Не удалось сохранить согласие");
  }
}

export function RegisterForm({ next, google, vk, socialFailed }: Props) {
  const [pd, setPd] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    socialFailed
      ? `Не получилось войти через ${SOCIAL_NAME[socialFailed]}. Если вы у нас впервые — отметьте согласие ниже и нажмите «Продолжить с ${SOCIAL_NAME[socialFailed]}».`
      : null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pd) return setError("Отметьте согласие на обработку персональных данных");
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") || "").trim();
    const phone = String(f.get("phone") || "").trim();
    const email = String(f.get("email") || "").trim().toLowerCase();
    const password = String(f.get("password") || "");
    setBusy(true);
    setError(null);
    try {
      await saveConsent({ source: "REGISTRATION", marketing, name, phone, email });
      const { error: err } = await authClient.signUp.email({ name, email, password });
      if (err) throw err;
      window.location.href = next;
    } catch (err) {
      setError(authErrorMessage(err as { code?: string; message?: string; status?: number }));
      setBusy(false);
    }
  }

  async function onSocial(provider: "google" | "vk") {
    if (!pd) return setError("Отметьте согласие на обработку персональных данных");
    setBusy(true);
    setError(null);
    try {
      await saveConsent({ source: provider === "vk" ? "VK" : "GOOGLE", marketing });
      await authClient.signIn.social({
        provider,
        callbackURL: next,
        errorCallbackURL: `/register?from=${provider}`,
      });
    } catch (err) {
      setError(authErrorMessage(err as { message?: string }));
      setBusy(false);
    }
  }

  return (
    <form className="auth__form" onSubmit={onSubmit} noValidate={false}>
      <nav className="tabs" aria-label="Вход или регистрация">
        <Link href={`/login?next=${encodeURIComponent(next)}`}>Вход</Link>
        <Link href="/register" aria-current="page">
          Регистрация
        </Link>
      </nav>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {vk && (
        <button type="button" className="btn btn--vk" onClick={() => onSocial("vk")} disabled={!pd || busy}>
          <IconVk /> Продолжить с VK ID
        </button>
      )}
      {google && (
        <button type="button" className="btn btn--light" onClick={() => onSocial("google")} disabled={!pd || busy}>
          <IconGoogle /> Продолжить с Google
        </button>
      )}
      {(vk || google) && <div className="divider">или по почте</div>}

      <label className="field">
        Имя
        <input className="input" name="name" required maxLength={100} autoComplete="given-name" />
      </label>
      <label className="field">
        Телефон
        <input className="input" name="phone" type="tel" required placeholder="+7 (900) 000-00-00" autoComplete="tel" />
      </label>
      <label className="field">
        Email
        <input className="input" name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        Пароль
        <input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Не короче 8 символов" />
      </label>

      <label className="check" style={{ marginTop: 4 }}>
        <input type="checkbox" checked={pd} onChange={(e) => setPd(e.target.checked)} required />
        <span>
          Даю{" "}
          <a href="/p/consent" target="_blank">
            согласие на обработку персональных данных
          </a>{" "}
          и принимаю{" "}
          <a href="/p/privacy" target="_blank">
            политику конфиденциальности
          </a>{" "}
          <span className="req">*</span>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
        <span>
          Хочу получать новости, акции и персональные предложения (
          <a href="/p/marketing-consent" target="_blank">
            согласие на рассылку
          </a>
          )
        </span>
      </label>

      <button type="submit" className="btn btn--gold" disabled={!pd || busy} style={{ marginTop: 4 }}>
        {busy ? "Подождите…" : "Зарегистрироваться"}
      </button>
      {!pd && <p className="muted small" style={{ margin: 0, textAlign: "center" }}>Чтобы продолжить, отметьте согласие на обработку персональных данных</p>}
    </form>
  );
}
