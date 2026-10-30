"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useOptimistic, useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { setNameParts, setBirthday, setRealEmail, telegramLink, unlinkTelegram } from "./actions";

export const VERIFY_CALLBACK = "/account?verified=1";

/** Плашка «Подтвердите почту» с кнопкой повторной отправки письма. */
export function VerifyEmailNotice({ email, welcome }: { email: string; welcome: number }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: VERIFY_CALLBACK });
    setState(error ? "error" : "sent");
    setWait(60);
  }

  return (
    <div className="panel stack" style={{ borderColor: "var(--c-gold)" }}>
      <div>
        <strong>Подтвердите почту</strong>
        <div className="muted small">
          Мы отправили письмо со ссылкой на <b>{email}</b>. Если его нет — проверьте «Спам».
          {welcome > 0 && <> После подтверждения начислим {welcome} приветственных бонусов.</>}
        </div>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <button type="button" className="btn btn--line btn--sm" onClick={resend} disabled={state === "sending" || wait > 0}>
          {state === "sending" ? "Отправляем…" : wait > 0 ? `Отправить ещё раз через ${wait} с` : "Отправить письмо ещё раз"}
        </button>
        {state === "sent" && <span className="small" style={{ color: "var(--c-success)" }}>Письмо отправлено</span>}
        {state === "error" && <span className="small" style={{ color: "var(--c-danger)" }}>Слишком часто — попробуйте через несколько минут</span>}
      </div>
    </div>
  );
}

export function Toggle({ label, on, action }: { label: string; on: boolean; action: (v: boolean) => Promise<void> }) {
  const [optimistic, setOptimistic] = useOptimistic(on);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="toggle"
      aria-label={label}
      aria-pressed={optimistic}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await action(!optimistic);
        })
      }
    >
      <span />
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="btn btn--gold"
      onClick={async (e) => {
        const btn = e.currentTarget;
        await navigator.clipboard.writeText(text).catch(() => {});
        btn.textContent = "Скопировано";
        setTimeout(() => (btn.textContent = "Копировать"), 1600);
      }}
    >
      Копировать
    </button>
  );
}

export function RealEmailForm() {
  const [state, action, pending] = useActionState(setRealEmail, {});
  return (
    <form action={action} className="panel stack" style={{ borderColor: "var(--c-gold)" }}>
      <div>
        <strong>Укажите почту</strong>
        <div className="muted small">
          Вход через VK ID больше не работает — без почты вы не сможете снова войти в аккаунт. На почту придут чеки и статусы заказов, а
          войти можно будет по почте и паролю. Почта сохранится после перехода по ссылке из письма.
        </div>
      </div>
      <div className="row">
        <input className="input" type="email" name="email" required placeholder="you@example.com" style={{ flex: "1 1 240px", width: "auto" }} />
        <button className="btn btn--gold" disabled={pending}>
          Отправить письмо
        </button>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
    </form>
  );
}

/** Аккаунт без пароля (раньше входили через Google или VK): ссылка «задать пароль» на почту. */
export function SetPasswordNotice({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function send() {
    setState("sending");
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setState(error ? "error" : "sent");
  }
  return (
    <div className="panel stack" style={{ borderColor: "var(--c-gold)" }}>
      <div>
        <strong>Задайте пароль</strong>
        <div className="muted small">Вход через Google и VK ID больше не работает. Чтобы входить снова, задайте пароль — пришлём ссылку на {email}.</div>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <button type="button" className="btn btn--line btn--sm" onClick={send} disabled={state === "sending" || state === "sent"}>
          {state === "sending" ? "Отправляем…" : "Прислать ссылку"}
        </button>
        {state === "sent" && <span className="small" style={{ color: "var(--c-success)" }}>Письмо отправлено — ссылка действует 1 час</span>}
        {state === "error" && <span className="small" style={{ color: "var(--c-danger)" }}>Не получилось — попробуйте через несколько минут</span>}
      </div>
    </div>
  );
}

export function TelegramConnect({ linked }: { linked: boolean }) {
  const [pending, start] = useTransition();
  const [hint, setHint] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!hint || linked) return;
    // Ждём, пока клиент нажмёт «Старт» в боте, и обновляем страницу
    const t = setInterval(() => router.refresh(), 3000);
    const stop = setTimeout(() => clearInterval(t), 120_000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [hint, linked, router]);

  if (linked) {
    return (
      <button type="button" className="linklike small" disabled={pending} onClick={() => start(() => unlinkTelegram())}>
        Отвязать
      </button>
    );
  }
  return (
    <div className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
      <button
        type="button"
        className="btn btn--line btn--sm"
        disabled={pending}
        onClick={() => {
          const w = window.open("", "_blank");
          start(async () => {
            const url = await telegramLink();
            if (!url) {
              w?.close();
              setHint("Бот временно недоступен, попробуйте позже");
              return;
            }
            if (w) w.location.href = url;
            else window.location.href = url;
            setHint("Нажмите «Старт» в боте — страница обновится сама");
          });
        }}
      >
        Подключить Telegram
      </button>
      {hint && <span className="muted small">{hint}</span>}
      <span className="muted small" style={{ maxWidth: 360, textAlign: "right" }}>
        В Telegram (сервис в ОАЭ) будут приходить только номер и статус заказа, трек и бонусы — без имени, телефона и адреса.
      </span>
    </div>
  );
}

export function BirthdayForm() {
  const [state, action, pending] = useActionState(setBirthday, {});
  return (
    <form action={action} className="row" style={{ alignItems: "center" }}>
      <input className="input" type="date" name="birthday" required style={{ width: "auto", minHeight: 40 }} aria-label="Дата рождения" />
      <button className="btn btn--line btn--sm" disabled={pending}>
        {pending ? "…" : "Сохранить"}
      </button>
      {state.error && <span className="small" style={{ color: "var(--c-danger)" }}>{state.error}</span>}
    </form>
  );
}

export function NameForm({ firstName, patronymic }: { firstName: string; patronymic: string }) {
  const [state, action, pending] = useActionState(setNameParts, {});
  return (
    <form action={action} className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input className="input" name="firstName" defaultValue={firstName} required maxLength={60} placeholder="Имя" aria-label="Имя" style={{ width: 160, minHeight: 40 }} />
      <input className="input" name="patronymic" defaultValue={patronymic} maxLength={60} placeholder="Отчество" aria-label="Отчество" style={{ width: 180, minHeight: 40 }} />
      <button className="btn btn--line btn--sm" disabled={pending}>
        {pending ? "…" : "Сохранить"}
      </button>
      {state.error && <span className="small" style={{ color: "var(--c-danger)" }}>{state.error}</span>}
      {state.ok && <span className="small" style={{ color: "var(--c-success)" }}>{state.ok}</span>}
    </form>
  );
}
