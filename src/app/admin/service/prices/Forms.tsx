"use client";
import { useActionState } from "react";
import { deleteServiceItem, saveServiceItem, saveServiceSettings } from "../actions";

interface Item {
  id: string;
  name: string;
  description: string;
  price: number;
  priceFrom: boolean;
  days: number;
  isActive: boolean;
  sortOrder: number;
}

export function ServiceItemForm({ item }: { item: Item | null }) {
  const [state, action, pending] = useActionState(saveServiceItem, {});
  return (
    <form action={action} className="panel stack" style={{ gap: 10, opacity: item && !item.isActive ? 0.6 : 1 }}>
      {item && <input type="hidden" name="id" value={item.id} />}
      {!item && <b>Новая услуга</b>}
      <div className="form-grid">
        <label className="field">
          Услуга
          <input className="input" name="name" defaultValue={item?.name ?? ""} required placeholder="Замена наклейки" />
        </label>
        <label className="field">
          Цена, ₽
          <input className="input" name="price" inputMode="decimal" defaultValue={item ? String(item.price / 100) : ""} required placeholder="1500" />
        </label>
        <label className="field">
          Срок, дней
          <input className="input" name="days" type="number" min={0} max={365} defaultValue={item?.days ?? 1} />
        </label>
        <label className="field">
          Порядок
          <input className="input" name="sortOrder" type="number" defaultValue={item?.sortOrder ?? 0} />
        </label>
      </div>
      <label className="field">
        Пояснение (необязательно)
        <input className="input" name="description" defaultValue={item?.description ?? ""} maxLength={300} placeholder="Наклейка Kamui, Tiger или ваша; работа и проточка" />
      </label>
      <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
        <label className="check">
          <input type="checkbox" name="priceFrom" defaultChecked={item?.priceFrom ?? false} />
          <span>Цена «от» — точную назовёт мастер</span>
        </label>
        <label className="check">
          <input type="checkbox" name="isActive" defaultChecked={item?.isActive ?? true} />
          <span>Показывать</span>
        </label>
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {item ? "Сохранить" : "Добавить услугу"}
        </button>
        {item && (
          <button type="button" className="btn btn--danger btn--sm" onClick={() => confirm(`Удалить «${item.name}»?`) && deleteServiceItem(item.id)}>
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}

export function ServiceSettingsForm({ s }: { s: { enabled: boolean; cdekAddress: string; intro: string } }) {
  const [state, action, pending] = useActionState(saveServiceSettings, {});
  return (
    <form action={action} className="panel stack">
      <label className="check">
        <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
        <span>
          <b>Принимать заявки на сайте</b>
        </span>
      </label>
      <label className="field">
        Текст на странице мастерской
        <textarea className="textarea" name="intro" defaultValue={s.intro} maxLength={600} style={{ minHeight: 70, paddingTop: 10 }} />
      </label>
      <label className="field">
        Куда присылать кий СДЭК (получатель, город, адрес или код пункта, телефон)
        <textarea
          className="textarea"
          name="cdekAddress"
          defaultValue={s.cdekAddress}
          maxLength={500}
          style={{ minHeight: 90, paddingTop: 10 }}
          placeholder={"Мастерская Abramov, ИП Абрамова А. Г.\nКраснодар, ПВЗ СДЭК KSD47\n+7 900 000-00-00"}
        />
        <span className="muted small">Пусто — вариант «Отправлю СДЭК» в заявке не показывается.</span>
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={pending}>
          Сохранить
        </button>
      </div>
    </form>
  );
}
