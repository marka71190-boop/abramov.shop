"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { goal } from "@/lib/track";
import { currentSubscription, isIos, isStandalone, pushSupported, subscribePush, unsubscribePush } from "./pwa";

type State = "loading" | "unsupported" | "ios" | "denied" | "off" | "on";

/** Включить/выключить уведомления на этом устройстве */
export function PushToggle({ publicKey, signedIn, what = "оплату, трек-номер и готовность заказа" }: { publicKey: string | null; signedIn: boolean; what?: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  useEffect(() => {
    (async () => {
      if (!pushSupported()) return setState(isIos() && !isStandalone() ? "ios" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const sub = await currentSubscription().catch(() => null);
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })();
  }, []);

  if (!publicKey || state === "loading") return null;

  if (!signedIn)
    return (
      <p className="small muted" style={{ margin: 0 }}>
        <Link href="/login?next=/app">Войдите</Link>, чтобы получать уведомления о своих заказах.
      </p>
    );
  if (state === "ios")
    return (
      <p className="small muted" style={{ margin: 0 }}>
        На iPhone уведомления работают в установленном приложении: нажмите «Поделиться» <span aria-hidden>⎋</span> → «На экран «Домой»», откройте Abramov с экрана и
        включите уведомления здесь.
      </p>
    );
  if (state === "unsupported")
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Этот браузер не умеет показывать уведомления. Подойдут Chrome, Яндекс Браузер, Safari на iPhone (из установленного приложения), Firefox, Edge.
      </p>
    );
  if (state === "denied")
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Уведомления запрещены в настройках браузера. Разрешите их для abramov.shop (значок замка слева от адреса → Уведомления) и обновите страницу.
      </p>
    );

  const on = async () => {
    setBusy(true);
    setMsg({});
    try {
      await subscribePush(publicKey);
      setState("on");
      setMsg({ ok: "Готово — уведомления включены" });
      goal("push_on");
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : "Не получилось" });
      if (Notification.permission === "denied") setState("denied");
    } finally {
      setBusy(false);
    }
  };
  const off = async () => {
    setBusy(true);
    await unsubscribePush();
    setState("off");
    setMsg({});
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    const r = await fetch("/api/push/test", { method: "POST" })
      .then((x) => x.json())
      .catch(() => ({}));
    setMsg(r.sent ? { ok: "Отправили — уведомление придёт через пару секунд" } : { error: r.error ?? "Не дошло — выключите и включите уведомления снова" });
    setBusy(false);
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      {state === "on" ? (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <span className="pill pill--ok">Включены на этом устройстве</span>
          <button type="button" className="btn btn--line btn--sm" disabled={busy} onClick={test}>
            Проверить
          </button>
          <button type="button" className="linklike small" disabled={busy} onClick={off}>
            Выключить
          </button>
        </div>
      ) : (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn--gold btn--sm" disabled={busy} onClick={on}>
            {busy ? "Включаем…" : "Включить уведомления"}
          </button>
          <span className="small muted">Пришлём {what}</span>
        </div>
      )}
      {msg.ok && <div className="form-ok small">{msg.ok}</div>}
      {msg.error && <div className="form-error small">{msg.error}</div>}
    </div>
  );
}
