"use client";
import { useActionState } from "react";
import { deleteClub, saveClub } from "../actions";

interface Club {
  id: string;
  name: string;
  city: string;
  address: string;
  workTime: string;
  phone: string | null;
  note: string;
  lat: number | null;
  lon: number | null;
  pickup: boolean;
  service: boolean;
  isActive: boolean;
  sortOrder: number;
}

export function ClubForm({ club, saved }: { club: Club | null; saved: boolean }) {
  const [state, action, pending] = useActionState(saveClub, saved ? { ok: "Клуб добавлен" } : {});
  return (
    <form action={action} className="panel stack">
      {club && <input type="hidden" name="id" value={club.id} />}
      <div className="form-grid">
        <label className="field">
          Название
          <input className="input" name="name" defaultValue={club?.name ?? ""} required placeholder="Бильярдный клуб «Чемпион»" />
        </label>
        <label className="field">
          Город
          <input className="input" name="city" defaultValue={club?.city ?? ""} required placeholder="Краснодар" />
        </label>
        <label className="field">
          Адрес
          <input className="input" name="address" defaultValue={club?.address ?? ""} required placeholder="ул. Красная, 1" />
        </label>
        <label className="field">
          Часы работы
          <input className="input" name="workTime" defaultValue={club?.workTime ?? ""} placeholder="Ежедневно 12:00–02:00" />
        </label>
        <label className="field">
          Телефон клуба
          <input className="input" name="phone" defaultValue={club?.phone ?? ""} placeholder="+7 (861) 000-00-00" />
        </label>
        <label className="field">
          Порядок в списке
          <input className="input" name="sortOrder" type="number" defaultValue={club?.sortOrder ?? 0} />
        </label>
        <label className="field">
          Широта (для карты)
          <input className="input" name="lat" defaultValue={club?.lat ?? ""} placeholder="45.0355" />
        </label>
        <label className="field">
          Долгота
          <input className="input" name="lon" defaultValue={club?.lon ?? ""} placeholder="38.9753" />
        </label>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Координаты: откройте клуб в Яндекс Картах, нажмите на точку — внизу будут два числа, например «45.0355, 38.9753». Без них ссылка «Как добраться» найдёт
        клуб по адресу.
      </p>
      <label className="field">
        Как найти и где забрать (видит покупатель)
        <textarea className="textarea" name="note" defaultValue={club?.note ?? ""} maxLength={500} style={{ minHeight: 70, paddingTop: 10 }} placeholder="Вход со двора, заказ выдаёт администратор на ресепшене" />
      </label>
      <div className="row" style={{ gap: 24 }}>
        <label className="check">
          <input type="checkbox" name="pickup" defaultChecked={club?.pickup ?? true} />
          <span>Выдаёт заказы (самовывоз)</span>
        </label>
        <label className="check">
          <input type="checkbox" name="service" defaultChecked={club?.service ?? true} />
          <span>Принимает кии в мастерскую</span>
        </label>
        <label className="check">
          <input type="checkbox" name="isActive" defaultChecked={club?.isActive ?? true} />
          <span>Включён</span>
        </label>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : club ? "Сохранить" : "Добавить клуб"}
        </button>
        {club && (
          <button type="button" className="btn btn--danger btn--sm" onClick={() => confirm("Удалить клуб? В старых заказах адрес останется.") && deleteClub(club.id)}>
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
