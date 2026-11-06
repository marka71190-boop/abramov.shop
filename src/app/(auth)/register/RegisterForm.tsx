"use client";
import Link from "next/link";
import { PasswordInput } from "@/components/PasswordInput";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { goal } from "@/lib/track";
import { setMyCountry, setPatronymicAfterSignup } from "@/app/(shop)/account/actions";
import { CountryField, type CountryValue } from "@/components/CountryField";
import { checkTin, tinRule, type Country } from "@/lib/countries";

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

export function RegisterForm({ next, notice, countries }: { next: string; notice?: string | null; countries: Country[] | null }) {
  const [pd, setPd] = useState(false);
  const [country, setCountry] = useState<CountryValue>({ code: "RU", name: "" });
  const [tin, setTin] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pd) return setError("Отметьте согласие на обработку персональных данных");
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") || "").trim();
    const patronymic = String(f.get("patronymic") || "").trim();
    const phone = String(f.get("phone") || "").trim();
    const email = String(f.get("email") || "").trim().toLowerCase();
    const password = String(f.get("password") || "");
    if (country.code === "XX" && country.name.trim().length < 2) return setError("Впишите страну, куда доставлять заказы");
    if (tinRule(country.code)) {
      const r = checkTin(country.code, tin);
      if ("error" in r) return setError(r.error);
    }
    setBusy(true);
    setError(null);
    try {
      await saveConsent({ source: "REGISTRATION", marketing, name, phone, email });
      const { error: err } = await authClient.signUp.email({ name, email, password, callbackURL: "/account?verified=1" });
      if (err) throw err;
      if (patronymic) await setPatronymicAfterSignup(patronymic).catch(() => {});
      if (country.code !== "RU") await setMyCountry(country.code, country.name, tin).catch(() => {});
      goal("sign_up");
      // Даём счётчику отправить цель до перехода
      await new Promise((r) => setTimeout(r, 300));
      window.location.href = next;
    } catch (err) {
      setError(authErrorMessage(err as { code?: string; message?: string; status?: number }));
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

      {notice && <div className="auth-context">{notice}</div>}

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <div className="form-grid" style={{ gap: 12 }}>
        <label className="field">
          Имя
          <input className="input" name="name" required maxLength={100} autoComplete="given-name" />
        </label>
        <label className="field">
          Отчество <span className="muted small">(необязательно)</span>
          <input className="input" name="patronymic" maxLength={60} autoComplete="additional-name" />
        </label>
      </div>
      <label className="field">
        Телефон
        <input className="input" name="phone" type="tel" required placeholder={country.code === "RU" ? "+7 (900) 000-00-00" : "С кодом страны: +375 29 000-00-00"} autoComplete="tel" />
      </label>
      {countries && (
        <CountryField
          countries={countries}
          value={country}
          onChange={setCountry}
          tin={tin}
          onTin={setTin}
          hint={
            country.code === "RU"
              ? undefined
              : country.code === "XX"
                ? "Доставку в вашу страну посчитаем после заказа, оплата — переводом на карту со сбором за международный заказ"
                : "Доставка СДЭК, оплата через Робокассу или переводом на карту — со сбором за международный заказ"
          }
        />
      )}
      <label className="field">
        Email
        <input className="input" name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        Пароль
        <PasswordInput name="password" required minLength={8} autoComplete="new-password" placeholder="Не короче 8 символов" />
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
