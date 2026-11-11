"use client";
/** Форма паспорта кия: выпуск и правка. Фото — загрузка как в карточке товара */
import { useActionState, useRef, useState } from "react";
import { createPassportAction, updatePassportAction, type FormState } from "./actions";

export interface PassportFormData {
  id?: string;
  model: string;
  spec: string;
  master: string;
  madeAt: string; // ГГГГ-ММ-ДД
  warrantyMonths: number;
  photo: string;
  orderId?: string;
  orderItemId?: string;
}

export interface CueModelOption {
  id: string;
  name: string;
  spec: string;
  photo: string | null;
}

export function PassportForm({ data, orderLabel, models = [] }: { data: PassportFormData; orderLabel?: string | null; models?: CueModelOption[] }) {
  const edit = !!data.id;
  const [state, action, pending] = useActionState<FormState, FormData>(edit ? updatePassportAction : createPassportAction, {});
  const [photo, setPhoto] = useState(data.photo);
  const [model, setModel] = useState(data.model);
  const [spec, setSpec] = useState(data.spec);
  // Выбрали модель из каталога — название, параметры и фото подставляются (их можно поправить)
  const pick = (id: string) => {
    const m = models.find((x) => x.id === id);
    if (!m) return;
    setModel(m.name);
    setSpec(m.spec);
    setPhoto(m.photo ?? "");
  };
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(f: File | undefined) {
    if (!f) return;
    setErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/admin/media", { method: "POST", body: fd }).then((x) => x.json());
      if (r.url) setPhoto(r.url);
      else setErr(r.error ?? "Не удалось загрузить фото");
    } catch {
      setErr("Не удалось загрузить фото");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form action={action} className="panel stack">
      {data.id && <input type="hidden" name="id" value={data.id} />}
      {data.orderId && <input type="hidden" name="orderId" value={data.orderId} />}
      {data.orderItemId && <input type="hidden" name="orderItemId" value={data.orderItemId} />}
      <input type="hidden" name="photo" value={photo} />
      {orderLabel && <div className="notice notice--muted small">Из заказа {orderLabel}: владельцем сразу станет покупатель.</div>}
      {!edit && !data.orderId && models.length > 0 && (
        <label className="field">
          Кий из каталога — параметры и фото подставятся
          <select className="input" defaultValue="" onChange={(e) => pick(e.target.value)} aria-label="Кий из каталога">
            <option value="">— выберите модель или заполните вручную —</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Модель кия
        <input className="input" name="model" value={model} onChange={(e) => setModel(e.target.value)} required maxLength={160} placeholder="Кий Abramov «Классик», 4 части" />
      </label>
      <label className="field">
        Параметры — по строке «Название: значение»
        <textarea className="input" name="spec" value={spec} onChange={(e) => setSpec(e.target.value)} rows={6} placeholder={"Длина: 160 см\nВес: 720 г\nДревесина: граб, эбен\nНаклейка: 13 мм"} />
      </label>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label className="field">
          Мастер
          <input className="input" name="master" defaultValue={data.master} maxLength={80} />
        </label>
        <label className="field">
          Дата изготовления
          <input className="input" type="date" name="madeAt" defaultValue={data.madeAt} />
        </label>
        <label className="field">
          Гарантия, месяцев
          <input className="input" type="number" name="warrantyMonths" min={0} max={120} defaultValue={data.warrantyMonths} />
        </label>
        {!edit && !data.orderId && (
          <label className="field">
            Сколько таких киёв
            <input className="input" type="number" name="qty" min={1} max={50} defaultValue={1} />
          </label>
        )}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Фото этого кия (видно в паспорте)</span>
        {photo && <img src={photo} alt="" style={{ maxWidth: 240, borderRadius: 10 }} />}
        <div className="row" style={{ gap: 8 }}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" className="btn btn--line btn--sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Загружаем…" : photo ? "Заменить фото" : "Загрузить фото"}
          </button>
          {photo && (
            <button type="button" className="linklike small" onClick={() => setPhoto("")}>
              Убрать
            </button>
          )}
        </div>
        {err && <div className="form-error">{err}</div>}
      </div>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <button className="btn btn--gold" disabled={pending || uploading} style={{ alignSelf: "flex-start" }}>
        {pending ? "Сохраняем…" : edit ? "Сохранить" : "Зарегистрировать кий и выпустить паспорт"}
      </button>
    </form>
  );
}
