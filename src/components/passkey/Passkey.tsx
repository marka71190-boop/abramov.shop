"use client";
/**
 * Вход по Face ID / Touch ID / отпечатку (passkey).
 * PasskeyLogin — кнопка на странице входа; PasskeySection — включить и убрать в кабинете.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { goal } from "@/lib/track";

const KEY_HAS = "ab_passkey";

function supported() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && window.isSecureContext;
}

/** Как называется вход на этом телефоне */
export function bioName() {
  if (typeof navigator === "undefined") return "Face ID";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "Face ID";
  if (/Macintosh/.test(ua)) return "Touch ID";
  if (/Android/.test(ua)) return "отпечатку";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "ключу доступа";
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Компьютер Windows";
  return "Это устройство";
}

const cancelled = (e: { code?: string; message?: string } | null | undefined) => !!e && /cancel|NotAllowed|abort|not allowed/i.test(`${e.code ?? ""} ${e.message ?? ""}`);

export function PasskeyLogin({ next }: { next: string }) {
  const [ok, setOk] = useState(false);
  const [known, setKnown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("Face ID");

  useEffect(() => {
    setOk(supported());
    setName(bioName());
    try {
      setKnown(localStorage.getItem(KEY_HAS) === "1");
    } catch {}
  }, []);
  if (!ok) return null;

  return (
    <div className="passkey-login">
      <button
        type="button"
        className={`btn ${known ? "btn--gold" : "btn--line"} passkey-login__btn`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const r = await authClient.signIn.passkey().catch((e: Error) => ({ error: { message: e.message, code: "" }, data: null }));
          if (r?.error) {
            setBusy(false);
            setError(
              cancelled(r.error)
                ? ""
                : `Не получилось войти по ${name}. Если ещё не включали — войдите по паролю или коду, затем включите в кабинете.`,
            );
            return;
          }
          goal("passkey_login");
          try {
            localStorage.setItem(KEY_HAS, "1");
          } catch {}
          window.location.href = next;
        }}
      >
        <FaceIcon /> {busy ? "Входим…" : `Войти по ${name}`}
      </button>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export interface PasskeyRow {
  id: string;
  name: string | null;
  createdAt: string | null;
}

export function PasskeySection({ items }: { items: PasskeyRow[] }) {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string; relogin?: boolean }>({});
  const [name, setName] = useState("Face ID");

  useEffect(() => {
    setOk(supported());
    setName(bioName());
    if (items.length) {
      try {
        localStorage.setItem(KEY_HAS, "1");
      } catch {}
    }
  }, [items.length]);

  if (ok === null) return null;

  const add = async () => {
    setBusy(true);
    setMsg({});
    const r = await authClient.passkey.addPasskey({ name: deviceName() }).catch((e: Error) => ({ error: { message: e.message, code: "" }, data: null }));
    setBusy(false);
    if (r?.error) {
      const code = String((r.error as { code?: string }).code ?? "");
      if (code === "SESSION_NOT_FRESH") return setMsg({ error: "Для безопасности войдите заново — и сразу включите вход здесь.", relogin: true });
      if (cancelled(r.error)) return;
      if (/already|exist|InvalidState/i.test(`${code} ${r.error.message ?? ""}`)) return setMsg({ ok: `На этом устройстве вход по ${name} уже включён` });
      return setMsg({ error: "Не получилось включить. Попробуйте ещё раз или в другом браузере." });
    }
    goal("passkey_added");
    try {
      localStorage.setItem(KEY_HAS, "1");
    } catch {}
    setMsg({ ok: `Готово! Теперь входите по ${name} — без пароля и кода.` });
    router.refresh();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Убрать вход с этого устройства? Входить можно будет по паролю или коду.")) return;
    setBusy(true);
    await authClient.passkey.deletePasskey({ id }).catch(() => {});
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="panel stack" id="passkey">
      <div className="label">Вход по {name}</div>
      {!ok ? (
        <p className="muted small" style={{ margin: 0 }}>
          Этот браузер не умеет входить по Face ID или отпечатку. Откройте сайт в Safari на iPhone или Chrome на Android.
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 15 }}>
          Входите по {name} — без пароля и кода из письма. Лицо и отпечаток остаются в телефоне, нам они не передаются.
        </p>
      )}
      {items.length > 0 && (
        <ul className="passkey-list">
          {items.map((p) => (
            <li key={p.id}>
              <span>
                <FaceIcon /> {p.name || "Устройство"}
                {p.createdAt && <span className="muted small"> · с {new Date(p.createdAt).toLocaleDateString("ru-RU")}</span>}
              </span>
              <button type="button" className="linklike small" disabled={busy} onClick={() => remove(p.id)}>
                Убрать
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
      {msg.error && (
        <div className="form-error">
          {msg.error}{" "}
          {msg.relogin && (
            <button
              type="button"
              className="linklike"
              onClick={async () => {
                await authClient.signOut().catch(() => {});
                window.location.href = "/login?next=%2Faccount%23passkey";
              }}
            >
              Войти заново
            </button>
          )}
        </div>
      )}
      {ok && (
        <button type="button" className={`btn ${items.length ? "btn--line" : "btn--gold"} btn--sm`} style={{ alignSelf: "flex-start" }} disabled={busy} onClick={add}>
          {busy ? "…" : items.length ? "Добавить это устройство" : `Включить вход по ${name}`}
        </button>
      )}
    </div>
  );
}

function FaceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ verticalAlign: "-4px" }}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 16c1.4 1 3.6 1 5 0" />
    </svg>
  );
}
