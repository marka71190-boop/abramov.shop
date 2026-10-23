"use client";
import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { innLookupAction, submitOrgAction } from "./actions";

export interface OrgDraft {
  inn: string;
  name: string;
  kpp: string;
  ogrn: string;
  legalAddress: string;
  kind: string;
  city: string;
  tables: string;
  website: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  comment: string;
}

export function ApplicationForm({ initial, lookup }: { initial: OrgDraft; lookup: boolean }) {
  const [state, action, pending] = useActionState(submitOrgAction, {});
  const [d, setD] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [finding, startFind] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const set = (k: keyof OrgDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });

  const find = () =>
    startFind(async () => {
      setMsg(null);
      const r = await innLookupAction(d.inn);
      if (r.error) return setMsg(r.error);
      const i = r.info!;
      setD({ ...d, name: i.name, kpp: i.kpp ?? "", ogrn: i.ogrn ?? "", legalAddress: i.address });
      setMsg("Реквизиты заполнены по ЕГРЮЛ — проверьте");
    });

  if (state.ok) {
    return (
      <div className="panel stack">
        <h2 className="h3" style={{ margin: 0 }}>
          Заявка отправлена
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Проверим организацию и пришлём письмо на {d.contactEmail}. Обычно это занимает один рабочий день.
        </p>
      </div>
    );
  }

  return (
    <form ref={form} action={action} className="panel stack" style={{ gap: 16 }}>
      <h2 className="h3" style={{ margin: 0 }}>
        Заявка на оптовые цены
      </h2>
      <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="field" style={{ flex: "1 1 220px" }}>
          ИНН
          <input className="input" name="inn" value={d.inn} onChange={set("inn")} inputMode="numeric" required maxLength={12} placeholder="10 или 12 цифр" />
        </label>
        {lookup && (
          <button type="button" className="btn btn--line" style={{ minHeight: 48 }} onClick={find} disabled={finding || d.inn.replace(/\D/g, "").length < 10}>
            {finding ? "Ищем…" : "Заполнить по ИНН"}
          </button>
        )}
      </div>
      {msg && <div className="small muted">{msg}</div>}
      <div className="form-grid">
        <label className="field">
          Название организации
          <input className="input" name="name" value={d.name} onChange={set("name")} required placeholder="ООО «Чемпион» или ИП Иванов И. И." />
        </label>
        <label className="field">
          Тип
          <select className="select" name="kind" value={d.kind} onChange={set("kind")}>
            <option value="CLUB">Бильярдный клуб</option>
            <option value="SHOP">Магазин</option>
            <option value="COACH">Тренер, школа</option>
            <option value="OTHER">Другое</option>
          </select>
        </label>
        <label className="field">
          КПП (для ООО)
          <input className="input" name="kpp" value={d.kpp} onChange={set("kpp")} inputMode="numeric" maxLength={9} />
        </label>
        <label className="field">
          ОГРН / ОГРНИП
          <input className="input" name="ogrn" value={d.ogrn} onChange={set("ogrn")} inputMode="numeric" maxLength={15} />
        </label>
      </div>
      <label className="field">
        Юридический адрес
        <input className="input" name="legalAddress" value={d.legalAddress} onChange={set("legalAddress")} required />
      </label>
      <div className="form-grid">
        <label className="field">
          Город
          <input className="input" name="city" value={d.city} onChange={set("city")} required />
        </label>
        <label className="field">
          Сколько столов (если клуб)
          <input className="input" name="tables" value={d.tables} onChange={set("tables")} inputMode="numeric" maxLength={4} />
        </label>
        <label className="field">
          Сайт или соцсети
          <input className="input" name="website" value={d.website} onChange={set("website")} placeholder="необязательно" />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Контактное лицо
          <input className="input" name="contactName" value={d.contactName} onChange={set("contactName")} required />
        </label>
        <label className="field">
          Телефон
          <input className="input" name="contactPhone" value={d.contactPhone} onChange={set("contactPhone")} required inputMode="tel" />
        </label>
        <label className="field">
          Почта для счетов
          <input className="input" name="contactEmail" type="email" value={d.contactEmail} onChange={set("contactEmail")} required />
        </label>
      </div>
      <label className="field">
        Комментарий
        <textarea className="textarea" name="comment" value={d.comment} onChange={set("comment")} style={{ minHeight: 80, paddingTop: 10 }} placeholder="Что планируете закупать, примерные объёмы" />
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn--gold" disabled={pending}>
          {pending ? "Отправляем…" : "Отправить заявку"}
        </button>
        <span className="small muted">
          Данные контактного лица обрабатываем по <Link href="/p/privacy">политике конфиденциальности</Link>.
        </span>
      </div>
    </form>
  );
}
