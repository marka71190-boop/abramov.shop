"use client";
import Link from "next/link";
import { useActionState } from "react";
import { clubTitle } from "@/lib/club-label";
import { applyCoach, type ApplyState } from "./actions";

type Club = { id: string; name: string; city: string; address: string };

export function ApplyForm({ clubs, games, ranks, defaults }: { clubs: Club[]; games: string[]; ranks: string[]; defaults: { fullName: string; phone: string; city: string } }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyCoach, {});
  if (state.ok) {
    return (
      <div className="notice" role="status">
        <b>Заявка отправлена.</b> Мы посмотрим её и ответим в Telegram или на почту — обычно в течение пары дней. Статус заявки виден на этой странице.
      </div>
    );
  }
  const v = state.values ?? {};
  const val = (k: string, d = "") => (typeof v[k] === "string" ? (v[k] as string) : d);
  const has = (k: string, x: string) => Array.isArray(v[k]) && (v[k] as string[]).includes(x);
  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <div className="form-grid">
        <label className="field">
          Фамилия, имя, отчество *
          <input className="input" name="fullName" required maxLength={120} defaultValue={val("fullName", defaults.fullName)} autoComplete="name" />
        </label>
        <label className="field">
          Телефон *
          <input className="input" name="phone" required inputMode="tel" defaultValue={val("phone", defaults.phone)} placeholder="+7 900 123-45-67" autoComplete="tel" />
        </label>
        <label className="field">
          Город
          <input className="input" name="city" maxLength={80} defaultValue={val("city", defaults.city)} />
        </label>
        <label className="field">
          Спортивное звание
          <select className="select" name="rank" defaultValue={val("rank")}>
            <option value="">— выберите —</option>
            {ranks.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Тренерский стаж, лет
          <input className="input" name="coachYears" type="number" min={0} max={70} defaultValue={val("coachYears")} />
        </label>
        <label className="field">
          Желаемая цена за час, ₽
          <input className="input" name="price" type="number" min={0} step={100} defaultValue={val("price")} placeholder="3000" />
        </label>
      </div>

      <fieldset className="stack" style={{ gap: 8, margin: 0, padding: 0, border: 0 }}>
        <legend className="small muted" style={{ marginBottom: 8 }}>
          Какие игры тренируете
        </legend>
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          {games.map((g) => (
            <label key={g} className="check" style={{ margin: 0 }}>
              <input type="checkbox" name="games" value={g} defaultChecked={has("games", g)} />
              <span>{g}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="stack" style={{ gap: 8, margin: 0, padding: 0, border: 0 }}>
        <legend className="small muted" style={{ marginBottom: 8 }}>
          В каких наших клубах будете тренировать * (можно несколько)
        </legend>
        <div className="roles-grid">
          {clubs.map((c) => (
            <label key={c.id} className="check" style={{ margin: 0 }}>
              <input type="checkbox" name="clubIds" value={c.id} defaultChecked={has("clubIds", c.id)} />
              <span>
                {clubTitle(c)} <span className="muted small">{c.city}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        О себе и тренировках *
        <textarea
          className="textarea"
          name="about"
          required
          minLength={30}
          maxLength={3000}
          defaultValue={val("about")}
          style={{ minHeight: 120, paddingTop: 10 }}
          placeholder="С кем занимаетесь (новички, разрядники, дети), как строите тренировку, что даёте ученику"
        />
      </label>
      <label className="field">
        Достижения
        <textarea className="textarea" name="achievements" maxLength={2000} defaultValue={val("achievements")} style={{ minHeight: 80, paddingTop: 10 }} placeholder="Турниры, ученики, звания" />
      </label>
      <label className="field">
        Ссылки
        <input className="input" name="links" maxLength={500} defaultValue={val("links")} placeholder="ВКонтакте, Telegram-канал, видео с турниров" />
      </label>

      <label className="check coach-apply__agree">
        <input type="checkbox" name="clubsOnly" required defaultChecked={!!val("clubsOnly")} />
        <span>
          <b>Я понимаю и согласен: тренировки учеников, записавшихся через сайт, провожу только в клубах сети.</b> Перенос занятий в другие места не допускается.
        </span>
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        Данные заявки обрабатываются по{" "}
        <Link href="/p/consent" target="_blank">
          согласию на обработку персональных данных
        </Link>
        , которое вы дали при регистрации. Ученикам показываем только профиль тренера, без телефона.
      </p>

      {state.error && <div className="form-error">{state.error}</div>}
      <div>
        <button className="btn btn--gold" disabled={pending}>
          {pending ? "Отправляем…" : "Отправить заявку"}
        </button>
      </div>
    </form>
  );
}
