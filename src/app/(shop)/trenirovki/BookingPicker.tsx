"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { goal } from "@/lib/track";
import { requestTrainingAction } from "./actions";
import { CoachConsent } from "./CoachConsent";

type FreeMap = Record<string, Record<string, Record<number, string[]>>>;
type Club = { id: string; name: string; city: string; address: string | null };

const dayLabel = (k: string) => {
  const d = new Date(`${k}T12:00:00+03:00`);
  return {
    wd: new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      weekday: "short",
    }).format(d),
    n: new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "numeric",
    }).format(d),
    m: new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      month: "short",
    }).format(d),
    full: new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(d),
  };
};
const rub = (kop: number) =>
  `${Math.round(kop / 100).toLocaleString("ru-RU")} ₽`;
const plusMin = (t: string, m: number) => {
  const [h, mm] = t.split(":").map(Number);
  const x = h * 60 + mm + m;
  return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
const part = (t: string) => {
  const h = Number(t.slice(0, 2));
  return h < 12 ? "Утро" : h < 17 ? "День" : "Вечер";
};

export function BookingPicker({
  coachId,
  coachName,
  free,
  days,
  clubs,
  durations,
  pricePerHour,
  autoConfirm,
  signedIn,
  hasPhone,
  next,
  trial,
  initialTrial,
}: {
  coachId: string;
  coachName: string;
  free: FreeMap;
  days: string[];
  clubs: Club[];
  durations: number[];
  pricePerHour: number;
  autoConfirm: boolean;
  signedIn: boolean;
  hasPhone: boolean;
  next: string;
  /** Пробное у тренера: null — не проводит или клиенту уже недоступно */
  trial: { kind: "FREE" | "HALF"; durationMin: number; price: number } | null;
  initialTrial: boolean;
}) {
  const clubIds = clubs.filter((c) => free[c.id]).map((c) => c.id);
  const [clubId, setClubId] = useState(clubIds[0] ?? "");
  const [isTrial, setTrial] = useState(!!trial && initialTrial);
  const durs = useMemo(
    () =>
      (isTrial && trial ? [trial.durationMin] : durations).filter((d) =>
        Object.values(free[clubId] ?? {}).some((x) => x[d]?.length),
      ),
    [durations, free, clubId, isTrial, trial],
  );
  const [dur, setDur] = useState(durs.includes(60) ? 60 : (durs[0] ?? 60));
  const d = durs.includes(dur) ? dur : (durs[0] ?? dur);
  const dayList = days.filter((k) => free[clubId]?.[k]?.[d]?.length);
  const [day, setDay] = useState(dayList[0] ?? "");
  const dd = dayList.includes(day) ? day : (dayList[0] ?? "");
  const times = free[clubId]?.[dd]?.[d] ?? [];
  const [time, setTime] = useState("");
  const tt = times.includes(time) ? time : "";
  const [comment, setComment] = useState("");
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<{
    ok?: string;
    error?: string;
    confirmed?: boolean;
  }>({});
  // Что отправили: после ответа свободное время обновится, и выбранного часа в нём уже не будет
  const [sent, setSent] = useState<{
    day: string;
    time: string;
    dur: number;
    club: string;
    trial: boolean;
  } | null>(null);
  const [pending, start] = useTransition();
  const club = clubs.find((c) => c.id === clubId);
  const price =
    isTrial && trial ? trial.price : Math.round((pricePerHour * d) / 60);
  const priceText = price ? rub(price) : "бесплатно";

  if (!clubIds.length)
    return (
      <p className="muted">
        Свободного времени пока нет — загляните позже или спросите в клубе.
      </p>
    );

  if (msg.ok && sent) {
    const sc = clubs.find((c) => c.id === sent.club);
    return (
      <div className="picker picker--done">
        <div className="pill pill--ok">
          {msg.confirmed ? "Подтверждено" : "Заявка отправлена"}
          {sent.trial ? " · пробное" : ""}
        </div>
        <b>
          {dayLabel(sent.day).full}, {sent.time}–{plusMin(sent.time, sent.dur)}
        </b>
        <span className="muted">
          {coachName} · {sc?.name}, {sc?.city}
        </span>
        <span className="muted small">{msg.ok}</span>
        <div className="row" style={{ gap: 12 }}>
          <Link href="/account#trainings" className="btn btn--gold btn--sm">
            Мои тренировки
          </Link>
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={() => {
              setMsg({});
              setSent(null);
              setTime("");
            }}
          >
            Выбрать ещё время
          </button>
        </div>
      </div>
    );
  }

  const groups = (["Утро", "День", "Вечер"] as const)
    .map((g) => ({ g, list: times.filter((t) => part(t) === g) }))
    .filter((x) => x.list.length);

  return (
    <div className="picker">
      {clubIds.length > 1 && (
        <div className="picker__row">
          <span className="picker__label">Клуб</span>
          <div className="picker__chips">
            {clubIds.map((id) => {
              const c = clubs.find((x) => x.id === id)!;
              return (
                <button
                  key={id}
                  type="button"
                  className="vchip"
                  aria-pressed={id === clubId}
                  onClick={() => setClubId(id)}
                >
                  {c.name} · {c.city}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {clubIds.length === 1 && club && (
        <div className="small muted">
          {club.name}, {club.city}
          {club.address ? ` · ${club.address}` : ""}
        </div>
      )}

      {trial && (
        <div className="picker__row">
          <span className="picker__label">Что</span>
          <div className="picker__chips">
            <button
              type="button"
              className="vchip"
              aria-pressed={!isTrial}
              onClick={() => setTrial(false)}
            >
              Тренировка
            </button>
            <button
              type="button"
              className="vchip picker__trial"
              aria-pressed={isTrial}
              onClick={() => setTrial(true)}
            >
              Пробное занятие · {trial.kind === "FREE" ? "бесплатно" : "−50%"}
            </button>
          </div>
        </div>
      )}

      {isTrial && trial ? (
        <div className="picker__row">
          <span className="picker__label">Сколько</span>
          <div className="small" style={{ paddingTop: 9 }}>
            {trial.durationMin} мин ·{" "}
            <b className="gold">
              {trial.price ? rub(trial.price) : "бесплатно"}
            </b>
            {trial.kind === "HALF" && (
              <s className="muted">
                {" "}
                {rub(Math.round((pricePerHour * trial.durationMin) / 60))}
              </s>
            )}
            <span className="muted"> · один раз, на первую тренировку</span>
          </div>
        </div>
      ) : (
        <div className="picker__row">
          <span className="picker__label">Сколько</span>
          <div className="picker__chips">
            {durs.map((m) => (
              <button
                key={m}
                type="button"
                className="vchip"
                aria-pressed={m === d}
                onClick={() => setDur(m)}
              >
                {m < 60 || m % 60 ? `${m} мин` : `${m / 60} ч`} ·{" "}
                {rub(Math.round((pricePerHour * m) / 60))}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="picker__row">
        <span className="picker__label">День</span>
        <div className="picker__days" role="listbox" aria-label="День">
          {days.map((k) => {
            const has = dayList.includes(k);
            const l = dayLabel(k);
            return (
              <button
                key={k}
                type="button"
                role="option"
                className="picker__day"
                aria-selected={k === dd}
                disabled={!has}
                onClick={() => setDay(k)}
              >
                <span>{l.wd}</span>
                <b>{l.n}</b>
                <span>{l.m}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="picker__row">
        <span className="picker__label">Время</span>
        <div className="stack" style={{ gap: 10 }}>
          {groups.map(({ g, list }) => (
            <div key={g} className="picker__times">
              <span className="small muted">{g}</span>
              <div className="picker__chips">
                {list.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="vchip picker__time"
                    aria-pressed={t === tt}
                    onClick={() => setTime(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {tt && (
        <div className="picker__confirm">
          <div>
            <b>
              {dayLabel(dd).full}, {tt}–{plusMin(tt, d)}
            </b>
            <div className="small muted">
              {club?.name} · {isTrial ? "пробное, " : ""}
              {d} мин · {price ? `${priceText}, оплата в клубе` : priceText}
            </div>
          </div>
          {signedIn ? (
            <>
              {!hasPhone && (
                <label className="field">
                  Телефон для тренера
                  <input
                    className="input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 900 000-00-00"
                    maxLength={40}
                  />
                </label>
              )}
              <input
                className="input"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                placeholder="Пожелание тренеру (необязательно): уровень, что подтянуть"
              />
              <CoachConsent coachName={coachName} checked={agree} onChange={setAgree} />
              {msg.error && <div className="form-error">{msg.error}</div>}
              <div
                className="row"
                style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}
              >
                <button
                  type="button"
                  className="btn btn--gold btn--cut"
                  disabled={pending || !agree}
                  onClick={() =>
                    start(async () => {
                      const r = await requestTrainingAction({
                        consent: agree,
                        coachId,
                        clubId,
                        day: dd,
                        time: tt,
                        durationMin: d,
                        comment,
                        phone: hasPhone ? undefined : phone,
                        trial: isTrial,
                      });
                      if (r.ok) {
                        setSent({
                          day: dd,
                          time: tt,
                          dur: d,
                          club: clubId,
                          trial: isTrial,
                        });
                        if (isTrial) setTrial(false);
                        goal("training_requested");
                      }
                      setMsg(r);
                    })
                  }
                >
                  {pending
                    ? "Отправляем…"
                    : isTrial
                      ? "Записаться на пробное"
                      : autoConfirm
                        ? "Записаться"
                        : "Отправить заявку"}
                </button>
                <span className="small muted">
                  {autoConfirm
                    ? "Тренер подтверждает запись сразу"
                    : "Тренер подтвердит заявку — придёт письмо"}
                </span>
              </div>
            </>
          ) : (
            <div
              className="row"
              style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}
            >
              <Link
                href={`/login?next=${encodeURIComponent(next)}`}
                className="btn btn--gold btn--cut"
              >
                Войти и записаться
              </Link>
              <span className="small muted">
                Нужен аккаунт, чтобы прислать подтверждение и напоминание
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
