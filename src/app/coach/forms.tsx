"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { cancelSlotAction, createSlots, markBooking, saveProfile } from "./actions";

type Club = { id: string; name: string; city: string };

export function ProfileForm({
  coachId,
  clubs,
  p,
}: {
  coachId: string;
  clubs: Club[];
  p: { displayName: string; title: string; about: string; games: string; photo: string | null; clubIds: string[] };
}) {
  const [state, action, pending] = useActionState(saveProfile, {});
  const [photo, setPhoto] = useState(p.photo ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <input type="hidden" name="coachId" value={coachId} />
      <input type="hidden" name="photo" value={photo} />
      <div className="row" style={{ gap: 16, alignItems: "center" }}>
        <div className="coach-photo">{photo ? <img src={photo} alt="" /> : <span>Фото</span>}</div>
        <div className="stack" style={{ gap: 6 }}>
          <button type="button" className="btn btn--line btn--sm" disabled={busy} onClick={() => ref.current?.click()}>
            {busy ? "Загружаем…" : photo ? "Заменить фото" : "Загрузить фото"}
          </button>
          <span className="small muted">Портрет или фото за столом, лицо крупно</span>
          {err && <span className="form-error small">{err}</span>}
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            setErr(null);
            const fd = new FormData();
            fd.append("file", f);
            const r = await fetch("/api/admin/media", { method: "POST", body: fd })
              .then((x) => x.json())
              .catch(() => ({}));
            if (r.url) setPhoto(r.url);
            else setErr(r.error ?? "Не удалось загрузить");
            setBusy(false);
            e.target.value = "";
          }}
        />
      </div>
      <div className="form-grid">
        <label className="field">
          Имя на сайте
          <input className="input" name="displayName" defaultValue={p.displayName} maxLength={80} required />
        </label>
        <label className="field">
          Звание, регалии
          <input className="input" name="title" defaultValue={p.title} maxLength={160} placeholder="Мастер спорта, чемпион края" />
        </label>
        <label className="field">
          Игры
          <input className="input" name="games" defaultValue={p.games} maxLength={120} placeholder="Русский бильярд, пул" />
        </label>
      </div>
      <label className="field">
        О себе и тренировках
        <textarea
          className="textarea"
          name="about"
          defaultValue={p.about}
          maxLength={3000}
          style={{ minHeight: 120, paddingTop: 10 }}
          placeholder="Опыт, с кем занимаетесь (новички, разрядники), как проходит тренировка, что взять с собой"
        />
      </label>
      {clubs.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">Где тренируете</span>
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            {clubs.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" name="clubIds" value={c.id} defaultChecked={p.clubIds.includes(c.id)} />
                <span>
                  {c.name} <span className="muted">{c.city}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending || busy}>
          {pending ? "Сохраняем…" : "Сохранить профиль"}
        </button>
      </div>
    </form>
  );
}

export function SlotForm({ coachId, clubs, defaultClub }: { coachId: string; clubs: Club[]; defaultClub: string }) {
  const [state, action, pending] = useActionState(createSlots, {});
  const [kind, setKind] = useState<"INDIVIDUAL" | "GROUP">("INDIVIDUAL");
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <input type="hidden" name="coachId" value={coachId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="row" style={{ gap: 8 }}>
        {(["INDIVIDUAL", "GROUP"] as const).map((k) => (
          <button key={k} type="button" className={`btn btn--sm ${kind === k ? "btn--gold" : "btn--line"}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === "INDIVIDUAL" ? "Индивидуальная" : "Групповая"}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field">
          Клуб
          <select className="select" name="clubId" defaultValue={defaultClub} required>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}, {c.city}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Начало (МСК)
          <input className="input" type="datetime-local" name="startsAt" required step={900} />
        </label>
        <label className="field">
          Длительность
          <select className="select" name="durationMin" defaultValue="60">
            {[45, 60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>
                {m} мин
              </option>
            ))}
          </select>
        </label>
        {kind === "GROUP" && (
          <label className="field">
            Мест
            <input className="input" type="number" name="capacity" min={2} max={20} defaultValue={4} />
          </label>
        )}
        {kind === "INDIVIDUAL" && <input type="hidden" name="capacity" value="1" />}
        <label className="field">
          Цена, ₽ (оплата в клубе)
          <input className="input" type="number" name="price" min={0} step={100} defaultValue={kind === "GROUP" ? 1500 : 3000} />
        </label>
        <label className="field">
          Повторять
          <select className="select" name="repeatWeeks" defaultValue="1">
            <option value="1">Один раз</option>
            {[2, 4, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n} недель — каждую неделю в это время
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Название (необязательно)
        <input className="input" name="title" maxLength={120} placeholder={kind === "GROUP" ? "Групповая: постановка удара" : "Индивидуальная тренировка"} />
      </label>
      <label className="field">
        Для кого и что взять (необязательно)
        <input className="input" name="note" maxLength={500} placeholder="Для начинающих. Кий дадим в клубе" />
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Добавляем…" : "Добавить в расписание"}
        </button>
      </div>
    </form>
  );
}

export function CancelSlot({ slotId, booked }: { slotId: string; booked: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  if (msg.ok) return <span className="form-ok small">{msg.ok}</span>;
  if (!open)
    return (
      <button type="button" className="linklike small" onClick={() => setOpen(true)}>
        Отменить тренировку
      </button>
    );
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <input className="input" style={{ height: 38, maxWidth: 280 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={booked ? "Причина — её увидят записавшиеся" : "Причина (необязательно)"} maxLength={200} />
      <button type="button" className="btn btn--danger btn--sm" disabled={pending} onClick={() => start(async () => setMsg(await cancelSlotAction(slotId, reason)))}>
        {pending ? "…" : booked ? `Отменить и предупредить (${booked})` : "Отменить"}
      </button>
      <button type="button" className="linklike small" onClick={() => setOpen(false)}>
        Не отменять
      </button>
      {msg.error && <span className="form-error small">{msg.error}</span>}
    </div>
  );
}

export function Mark({ bookingId, status }: { bookingId: string; status: string }) {
  const [cur, setCur] = useState(status);
  const [pending, start] = useTransition();
  const set = (st: "ATTENDED" | "NO_SHOW" | "BOOKED") =>
    start(async () => {
      const r = await markBooking(bookingId, st);
      if (r.ok) setCur(st);
    });
  return (
    <span className="row" style={{ gap: 6 }}>
      <button type="button" className={`btn btn--sm ${cur === "ATTENDED" ? "btn--gold" : "btn--line"}`} disabled={pending} onClick={() => set(cur === "ATTENDED" ? "BOOKED" : "ATTENDED")}>
        Пришёл
      </button>
      <button type="button" className={`btn btn--sm ${cur === "NO_SHOW" ? "btn--danger" : "btn--line"}`} disabled={pending} onClick={() => set(cur === "NO_SHOW" ? "BOOKED" : "NO_SHOW")}>
        Не пришёл
      </button>
    </span>
  );
}
