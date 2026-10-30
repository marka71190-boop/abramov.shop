"use client";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addDayOff, addManual, cancelSlotAction, confirmAction, createSlots, declineAction, markBooking, removeDayOff, saveBookingSettings, saveDiary, saveHours, saveProfile } from "./actions";

type Club = { id: string; name: string; city: string };

/** Отправка без сброса формы: при ошибке введённое не пропадает (React 19 очищает форму после action) */
function keep(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

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
  return (
    <form onSubmit={keep(action)} className="stack" style={{ gap: 14 }}>
      <input type="hidden" name="coachId" value={coachId} />
      <input type="hidden" name="kind" value="GROUP" />
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
          <select className="select" name="durationMin" defaultValue="90">
            {[60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>
                {m} мин
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Мест
          <input className="input" type="number" name="capacity" min={2} max={20} defaultValue={4} />
        </label>
        <label className="field">
          Цена с человека, ₽
          <input className="input" type="number" name="price" min={0} step={100} defaultValue={1500} />
        </label>
        <label className="field">
          Повторять
          <select className="select" name="repeatWeeks" defaultValue="1">
            <option value="1">Один раз</option>
            {[2, 4, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n} недель — каждую неделю
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Название
        <input className="input" name="title" maxLength={120} placeholder="Групповая: постановка удара" />
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

/** Заявка: подтвердить или отказать с причиной */
export function RequestActions({ bookingId }: { bookingId: string }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (msg.ok) return <span className="form-ok small">{msg.ok}</span>;
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {!declining ? (
        <>
          <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => start(async () => setMsg(await confirmAction(bookingId)))}>
            Подтвердить
          </button>
          <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={() => setDeclining(true)}>
            Не смогу
          </button>
        </>
      ) : (
        <>
          <input className="input" style={{ height: 38, maxWidth: 300 }} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Причину увидит клиент: «Занят, могу в 19:00»" />
          <button type="button" className="btn btn--danger btn--sm" disabled={pending} onClick={() => start(async () => setMsg(await declineAction(bookingId, reason)))}>
            Отказать
          </button>
          <button type="button" className="linklike small" onClick={() => setDeclining(false)}>
            Назад
          </button>
        </>
      )}
      {msg.error && <span className="form-error small">{msg.error}</span>}
    </div>
  );
}

/** Дневник: что делали на тренировке, домашнее задание */
export function DiaryNote({ slotId, text }: { slotId: string; text: string }) {
  const [v, setV] = useState(text);
  const [saved, setSaved] = useState(text);
  const [pending, start] = useTransition();
  return (
    <div className="stack" style={{ gap: 6 }}>
      <textarea
        className="textarea"
        value={v}
        onChange={(e) => setV(e.target.value)}
        maxLength={5000}
        placeholder="Дневник: что отрабатывали, над чем работать дальше"
        style={{ minHeight: 56, paddingTop: 8, fontSize: 14 }}
      />
      {v !== saved && (
        <div>
          <button
            type="button"
            className="btn btn--line btn--sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveDiary(slotId, v);
                if (r.ok) setSaved(v);
              })
            }
          >
            {pending ? "…" : "Сохранить запись"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Внести тренировку в дневник самому */
export function ManualForm({ coachId, day, clubs, defaultClub, durations, pricePerHour }: { coachId: string; day: string; clubs: Club[]; defaultClub: string; durations: number[]; pricePerHour: number }) {
  const [state, action, pending] = useActionState(addManual, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const [dur, setDur] = useState(durations.includes(60) ? 60 : durations[0] ?? 60);
  return (
    <form ref={ref} onSubmit={keep(action)} className="stack" style={{ gap: 12 }} key={day}>
      <input type="hidden" name="coachId" value={coachId} />
      <input type="hidden" name="day" value={day} />
      <div className="form-grid">
        <label className="field">
          Время
          <input className="input" type="time" name="time" required step={300} />
        </label>
        <label className="field">
          Длительность
          <select className="select" name="durationMin" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
            {[30, 45, 60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>
                {m} мин
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Клуб
          <select className="select" name="clubId" defaultValue={defaultClub}>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}, {c.city}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Цена, ₽
          <input className="input" type="number" name="price" min={0} step={100} defaultValue={Math.round((pricePerHour / 100) * (dur / 60))} key={dur} />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Клиент с сайта — почта или телефон
          <input className="input" name="client" maxLength={120} placeholder="ivan@mail.ru или +7 900 000-00-00" />
        </label>
        <label className="field">
          Или имя (если клиента нет на сайте)
          <input className="input" name="guestName" maxLength={80} placeholder="Иван" />
        </label>
        <label className="field">
          Телефон гостя (необязательно)
          <input className="input" name="guestPhone" maxLength={30} />
        </label>
      </div>
      <label className="field">
        Заметка
        <input className="input" name="note" maxLength={500} placeholder="Например: первая тренировка, постановка удара" />
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Добавляем…" : "Добавить в дневник"}
        </button>
      </div>
    </form>
  );
}

type HourRow = { weekday: number; clubId: string; start: string; end: string };
const WD = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Рабочее время по дням недели: несколько промежутков в день, в разных клубах */
export function HoursEditor({ coachId, clubs, initial, defaultClub }: { coachId: string; clubs: Club[]; initial: HourRow[]; defaultClub: string }) {
  const [rows, setRows] = useState<HourRow[]>(initial);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const def = defaultClub || clubs[0]?.id || "";
  const upd = (i: number, patch: Partial<HourRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const copyToWeekdays = (wd: number) => {
    const src = rows.filter((r) => r.weekday === wd);
    const others = rows.filter((r) => r.weekday === wd || r.weekday > 5);
    setRows([...others, ...[1, 2, 3, 4, 5].filter((d) => d !== wd).flatMap((d) => src.map((r) => ({ ...r, weekday: d })))].sort((a, b) => a.weekday - b.weekday));
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
        const list = rows.map((r, i) => ({ r, i })).filter((x) => x.r.weekday === wd);
        return (
          <div key={wd} className="hours-day">
            <b className="hours-day__wd">{WD[wd]}</b>
            <div className="stack" style={{ gap: 6, flex: 1 }}>
              {list.length === 0 && <span className="small muted">выходной</span>}
              {list.map(({ r, i }) => (
                <div key={i} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <input className="input hours-time" type="time" value={r.start} step={900} onChange={(e) => upd(i, { start: e.target.value })} aria-label="С" />
                  <span className="muted">—</span>
                  <input className="input hours-time" type="time" value={r.end} step={900} onChange={(e) => upd(i, { end: e.target.value })} aria-label="До" />
                  <select className="select hours-club" value={r.clubId} onChange={(e) => upd(i, { clubId: e.target.value })} aria-label="Клуб">
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="linklike small" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Убрать">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn--line btn--sm" onClick={() => setRows([...rows, { weekday: wd, clubId: list[0]?.r.clubId ?? def, start: list.length ? list[list.length - 1].r.end : "10:00", end: list.length ? "22:00" : "22:00" }])}>
                + время
              </button>
              {wd <= 5 && list.length > 0 && (
                <button type="button" className="linklike small" onClick={() => copyToWeekdays(wd)}>
                  на все будни
                </button>
              )}
            </div>
          </div>
        );
      })}
      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
      <div>
        <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => start(async () => setMsg(await saveHours(JSON.stringify(rows), coachId)))}>
          {pending ? "Сохраняем…" : "Сохранить рабочее время"}
        </button>
      </div>
    </div>
  );
}

export function BookingSettingsForm({ coachId, p }: { coachId: string; p: { pricePerHour: number; durations: number[]; stepMin: number; leadHours: number; horizonDays: number; autoConfirm: boolean } }) {
  const [state, action, pending] = useActionState(saveBookingSettings, {});
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="coachId" value={coachId} />
      <div className="form-grid">
        <label className="field">
          Цена за час, ₽
          <input className="input" type="number" name="pricePerHour" min={0} step={100} defaultValue={p.pricePerHour / 100} />
        </label>
        <label className="field">
          Начало тренировки
          <select className="select" name="stepMin" defaultValue={String(p.stepMin)}>
            <option value="15">каждые 15 минут</option>
            <option value="30">каждые 30 минут</option>
            <option value="60">ровно в начале часа</option>
          </select>
        </label>
        <label className="field">
          Записываться не позже чем за
          <select className="select" name="leadHours" defaultValue={String(p.leadHours)}>
            {[0, 1, 2, 3, 6, 12, 24].map((h) => (
              <option key={h} value={h}>
                {h ? `${h} ч` : "в любой момент"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Открыть запись на
          <select className="select" name="horizonDays" defaultValue={String(p.horizonDays)}>
            {[7, 14, 21, 30, 60].map((d) => (
              <option key={d} value={d}>
                {d} дней вперёд
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="small muted">Длительности на выбор клиенту</span>
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          {[45, 60, 90, 120, 180].map((m) => (
            <label key={m} className="check">
              <input type="checkbox" name="durations" value={m} defaultChecked={p.durations.includes(m)} />
              <span>{m} мин</span>
            </label>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" name="autoConfirm" defaultChecked={p.autoConfirm} />
        <span>Подтверждать заявки сразу (без моего ответа)</span>
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

export function DayOffForm({ coachId }: { coachId: string }) {
  const [state, action, pending] = useActionState(addDayOff, {});
  return (
    <form action={action} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <input type="hidden" name="coachId" value={coachId} />
      <label className="field" style={{ margin: 0 }}>
        С
        <input className="input" type="date" name="from" required />
      </label>
      <label className="field" style={{ margin: 0 }}>
        По (необязательно)
        <input className="input" type="date" name="to" />
      </label>
      <label className="field" style={{ margin: 0 }}>
        Заметка
        <input className="input" name="note" maxLength={100} placeholder="Турнир, отпуск" />
      </label>
      <button className="btn btn--line btn--sm" disabled={pending}>
        Добавить выходной
      </button>
      {state.error && <span className="form-error small">{state.error}</span>}
      {state.ok && <span className="form-ok small">{state.ok}</span>}
    </form>
  );
}

export function RemoveDayOff({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="linklike small" disabled={pending} onClick={() => start(() => removeDayOff(id))} aria-label="Убрать выходной">
      ×
    </button>
  );
}
