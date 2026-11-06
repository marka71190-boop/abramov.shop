"use client";
import { useActionState, useState, useTransition } from "react";
import { createDeviceAction, disableDeviceAction, resetDeviceAction, updateDeviceAction, type Credentials, type DeviceState } from "../device-actions";

type Club = { id: string; title: string };

/** Логин и пароль — показываем один раз, с QR для входа на телефоне */
function CredsCard({ creds }: { creds: Credentials }) {
  const [copied, setCopied] = useState(false);
  const text = `Касса Abramov Shop\nВход: ${creds.url}\nЛогин: ${creds.login}\nПароль: ${creds.password}`;
  return (
    <div className="kassa-creds">
      <div className="kassa-creds__qr" dangerouslySetInnerHTML={{ __html: creds.qr }} />
      <div className="stack" style={{ gap: 6 }}>
        {creds.name && <b>{creds.name}</b>}
        <div>
          Логин: <code className="kassa-creds__val">{creds.login}</code>
        </div>
        <div>
          Пароль: <code className="kassa-creds__val">{creds.password}</code>
        </div>
        <div className="muted small">
          На рабочем телефоне наведите камеру на QR-код или откройте abramov.shop/kassa/login и введите логин и пароль. Пароль показываем только сейчас — запишите или передайте сотруднику
          лично.
        </div>
        <button
          type="button"
          className="btn btn--line btn--sm"
          style={{ justifySelf: "start", alignSelf: "flex-start" }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {}
          }}
        >
          {copied ? "Скопировано" : "Скопировать логин и пароль"}
        </button>
      </div>
    </div>
  );
}

export function CreateDevice({ clubs, suggest }: { clubs: Club[]; suggest: string }) {
  const [state, action, pending] = useActionState<DeviceState, FormData>(createDeviceAction, {});
  const [, startSubmit] = useTransition();
  const [clubId, setClubId] = useState(clubs.length === 1 ? clubs[0].id : "");
  const club = clubs.find((c) => c.id === clubId);
  return (
    // Отправляем сами, без сброса формы: при ошибке введённое остаётся на месте
    <form
      className="panel stack"
      style={{ gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startSubmit(() => action(fd));
      }}
    >
      <h2 style={{ margin: 0 }}>Добавить телефон</h2>
      {/* После создания поля очищаются, логин — следующий свободный */}
      <div className="form-grid" key={state.creds?.login ?? "new"}>
        <label className="field">
          Клуб
          <select className="input" name="clubId" value={clubId} onChange={(e) => setClubId(e.target.value)} required>
            <option value="">— выберите клуб —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Название
          <input className="input" name="name" maxLength={80} placeholder={club ? `Касса · ${club.title}` : "Касса · клуб"} />
        </label>
        <label className="field">
          Логин для входа
          <input className="input" name="login" defaultValue={suggest} maxLength={30} autoCapitalize="none" spellCheck={false} required pattern="[a-zA-Z0-9][a-zA-Z0-9\-]{2,29}" />
          <span className="muted small">Латиница и цифры, например kassa-sadovaya</span>
        </label>
        <label className="field">
          Пароль
          <input className="input" name="password" minLength={8} maxLength={64} autoComplete="new-password" placeholder="Оставьте пустым — придумаем сами" />
        </label>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.creds && <CredsCard creds={state.creds} />}
      <button className="btn btn--gold" disabled={pending || !clubId} style={{ justifySelf: "start", alignSelf: "flex-start" }}>
        {pending ? "Создаём…" : "Создать аккаунт кассы"}
      </button>
    </form>
  );
}

export function DeviceCard({
  device,
  clubs,
}: {
  device: { id: string; name: string; login: string; clubId: string | null; active: boolean; lastSeen: string | null; openShift: string | null };
  clubs: Club[];
}) {
  const [state, action, pending] = useActionState<DeviceState, FormData>(updateDeviceAction, {});
  const [opState, setOpState] = useState<DeviceState>({});
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<DeviceState>, ask: string) => {
    if (!confirm(ask)) return;
    start(async () => setOpState(await fn().catch(() => ({ error: "Нет связи с сервером" }))));
  };
  return (
    <div className={`panel stack ${device.active ? "" : "is-muted"}`} style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div>
          <b>{device.name}</b>
          <div className="muted small">
            логин <code>{device.login}</code> · {device.lastSeen ? `в кассе с этого телефона: ${device.lastSeen}` : "на телефоне сейчас не выполнен вход"}
          </div>
        </div>
        <span className={`pill ${device.active ? "pill--ok" : "pill--bad"}`}>{device.active ? "работает" : "отключён"}</span>
      </div>
      {device.openShift && <div className="small">Открыта смена: {device.openShift}</div>}

      <form action={action} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <input type="hidden" name="id" value={device.id} />
        <label className="field" style={{ flex: "1 1 200px", margin: 0 }}>
          Название
          <input className="input" name="name" defaultValue={device.name} maxLength={80} />
        </label>
        <label className="field" style={{ flex: "1 1 220px", margin: 0 }}>
          Клуб
          <select className="input" name="clubId" defaultValue={device.clubId ?? ""}>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--line btn--sm" disabled={pending} style={{ minHeight: 48 }}>
          Сохранить
        </button>
      </form>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn--line btn--sm"
          disabled={busy}
          onClick={() =>
            run(
              () => resetDeviceAction(device.id),
              device.active ? "Выдать новый пароль? На телефоне касса закроется, войти можно будет только с новым паролем." : "Включить телефон и выдать новый пароль?",
            )
          }
        >
          {device.active ? "Новый пароль" : "Включить — выдать пароль"}
        </button>
        {device.active && (
          <button
            type="button"
            className="btn btn--line btn--sm"
            disabled={busy}
            onClick={() => run(() => disableDeviceAction(device.id), "Отключить этот телефон? Касса на нём сразу закроется. Например, если телефон потерялся.")}
          >
            Отключить
          </button>
        )}
      </div>
      {opState.error && <div className="form-error">{opState.error}</div>}
      {opState.ok && <div className="form-ok">{opState.ok}</div>}
      {opState.creds && <CredsCard creds={{ ...opState.creds, name: device.name }} />}
    </div>
  );
}
