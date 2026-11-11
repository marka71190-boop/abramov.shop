"use client";
/** Кнопки на странице паспорта: привязать кий, передать новому владельцу, принять кий */
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptAction, cancelTransferAction, claimAction, transferAction } from "../actions";

type Mode = "owner" | "claim" | "accept" | "taken";

export function OwnerBox({ mode, code, passportId, token, transferUntil }: { mode: Mode; code: string; passportId: string; token?: string; transferUntil?: string | null }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [claim, setClaim] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [link, setLink] = useState<{ link: string; qr: string } | null>(null);

  const run = (fn: () => Promise<{ ok?: string; error?: string; login?: boolean; link?: string; qr?: string }>) =>
    start(async () => {
      setMsg({});
      const r = await fn();
      if (r.login) {
        window.location.href = `/login?next=${encodeURIComponent(path + (token ? `?t=${token}` : ""))}`;
        return;
      }
      if (r.link && r.qr) setLink({ link: r.link, qr: r.qr });
      setMsg({ ok: r.ok, error: r.error });
      if (r.ok) router.refresh();
    });

  if (mode === "accept")
    return (
      <div className="panel stack passport-owner">
        <b>Вам передают этот кий</b>
        <p className="muted small" style={{ margin: 0 }}>
          Нажмите «Принять» — кий и его паспорт перейдут в ваш аккаунт, гарантия и история останутся с кием.
        </p>
        {msg.error && <div className="form-error">{msg.error}</div>}
        {msg.ok ? (
          <div className="form-ok">{msg.ok}</div>
        ) : (
          <button type="button" className="btn btn--gold" disabled={pending} onClick={() => run(() => acceptAction(code, token ?? ""))}>
            {pending ? "…" : "Принять кий"}
          </button>
        )}
      </div>
    );

  if (mode === "owner")
    return (
      <div className="panel stack passport-owner">
        <b>✓ Это ваш кий</b>
        {link ? (
          <>
            <p className="small" style={{ margin: 0 }}>
              Покажите QR новому владельцу или отправьте ссылку. Ссылка работает 7 дней; когда он примет кий, паспорт перейдёт к нему.
            </p>
            <div className="pos-qr" dangerouslySetInnerHTML={{ __html: link.qr }} />
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn--line btn--sm"
                onClick={() => {
                  if (navigator.share) void navigator.share({ title: "Паспорт кия", url: link.link }).catch(() => {});
                  else void navigator.clipboard?.writeText(link.link).then(() => setMsg({ ok: "Ссылка скопирована" }));
                }}
              >
                Отправить ссылку
              </button>
              <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => (setLink(null), run(() => cancelTransferAction(passportId, code)))}>
                Отменить передачу
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              Продаёте или дарите кий? Передайте паспорт — гарантия и история перейдут новому владельцу.
              {transferUntil ? ` Ссылка на передачу уже есть, действует до ${transferUntil}.` : ""}
            </p>
            <button type="button" className="btn btn--line btn--sm" style={{ alignSelf: "flex-start" }} disabled={pending} onClick={() => run(() => transferAction(passportId))}>
              {pending ? "…" : "Передать новому владельцу"}
            </button>
          </>
        )}
        {msg.ok && <div className="form-ok">{msg.ok}</div>}
        {msg.error && <div className="form-error">{msg.error}</div>}
      </div>
    );

  if (mode === "claim")
    return (
      <div className="panel stack passport-owner">
        <b>Это ваш кий?</b>
        <p className="muted small" style={{ margin: 0 }}>
          Введите код с карточки паспорта — кий появится в вашем аккаунте, а мы будем знать, чья гарантия.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            value={claim}
            onChange={(e) => setClaim(e.target.value.toUpperCase().slice(0, 12))}
            placeholder="Код с карточки"
            autoComplete="off"
            spellCheck={false}
            aria-label="Код с карточки паспорта"
            style={{ maxWidth: 200, letterSpacing: "0.12em" }}
          />
          <button type="button" className="btn btn--gold btn--sm" disabled={pending || claim.length < 6} onClick={() => run(() => claimAction(code, claim))}>
            {pending ? "…" : "Привязать"}
          </button>
        </div>
        {msg.ok && <div className="form-ok">{msg.ok}</div>}
        {msg.error && <div className="form-error">{msg.error}</div>}
      </div>
    );

  return (
    <p className="muted small" style={{ margin: 0 }}>
      У кия есть зарегистрированный владелец. Купили его с рук — попросите прежнего владельца передать паспорт.
    </p>
  );
}
