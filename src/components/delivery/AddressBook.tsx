"use client";
import { useCallback, useState, useTransition } from "react";
import { defaultAddressAction, deleteAddressAction, saveAddressAction } from "@/app/(shop)/account/address-actions";
import { CityPicker, PointPicker, type City, type Point } from "@/components/delivery/Pickers";
import { prettyPhone } from "@/lib/format";

export interface AddressCard {
  id: string;
  label: string;
  deliveryType: string;
  city: string;
  cdekCityCode: number | null;
  address: string;
  postalCode: string | null;
  cdekPvzCode: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  note: string | null;
  isDefault: boolean;
}

interface Props {
  addresses: AddressCard[];
  me: { name: string; phone: string };
  delivery: { pvz: boolean; courier: boolean; cdek: boolean };
  max: number;
}

export function AddressBook({ addresses, me, delivery, max }: Props) {
  const [editing, setEditing] = useState<AddressCard | "new" | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="stack">
      {addresses.length > 0 && (
        <div className="addr-grid">
          {addresses.map((a) => (
            <div key={a.id} className={`addr-card ${a.isDefault ? "addr-card--main" : ""}`}>
              <div className="addr-card__head">
                <strong>{a.label}</strong>
                {a.isDefault ? <span className="pill pill--ok">основной</span> : null}
              </div>
              <div className="small">
                {a.deliveryType === "PVZ" ? "Пункт СДЭК" : "Курьер"} · {a.city}
              </div>
              <div className="small muted">{a.address}</div>
              <div className="small">
                {a.recipientName} · {prettyPhone(a.recipientPhone)}
              </div>
              {a.note && <div className="small muted">«{a.note}»</div>}
              <div className="row small" style={{ gap: 14, marginTop: "auto" }}>
                <button type="button" className="linklike" onClick={() => setEditing(a)} disabled={pending}>
                  Изменить
                </button>
                {!a.isDefault && (
                  <button type="button" className="linklike" disabled={pending} onClick={() => start(() => defaultAddressAction(a.id))}>
                    Сделать основным
                  </button>
                )}
                <button
                  type="button"
                  className="linklike"
                  disabled={pending}
                  onClick={() => confirm(`Удалить адрес «${a.label}»?`) && start(() => deleteAddressAction(a.id))}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing ? (
        <AddressForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} me={me} delivery={delivery} onDone={() => setEditing(null)} />
      ) : addresses.length < max ? (
        <div>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setEditing("new")}>
            + Добавить адрес
          </button>
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Сохранено {max} адресов — это максимум. Чтобы добавить новый, удалите ненужный.
        </p>
      )}
    </div>
  );
}

function AddressForm({ initial, me, delivery, onDone }: { initial: AddressCard | null; me: Props["me"]; delivery: Props["delivery"]; onDone: () => void }) {
  const [label, setLabel] = useState(initial?.label ?? "Дом");
  const [type, setType] = useState<"PVZ" | "COURIER">((initial?.deliveryType as "PVZ" | "COURIER") ?? (delivery.pvz ? "PVZ" : "COURIER"));
  const [city, setCity] = useState<City | null>(initial?.cdekCityCode ? { code: initial.cdekCityCode, name: initial.city } : null);
  const [cityText, setCityText] = useState(initial?.city ?? "");
  const [point, setPointState] = useState<Point | null>(
    initial?.cdekPvzCode ? { code: initial.cdekPvzCode, name: "", address: initial.address, workTime: "", postalCode: initial.postalCode } : null,
  );
  const setPoint = useCallback((p: Point | null) => setPointState(p), []);
  const [street, setStreet] = useState(initial?.deliveryType === "COURIER" ? initial.address : "");
  const [pvzText, setPvzText] = useState(initial?.deliveryType === "PVZ" && !initial.cdekPvzCode ? initial.address : "");
  const [name, setName] = useState(initial?.recipientName ?? me.name);
  const [phone, setPhone] = useState(prettyPhone(initial?.recipientPhone ?? me.phone) || "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await saveAddressAction({
        id: initial?.id ?? null,
        label,
        deliveryType: type,
        city: delivery.cdek ? (city?.name.split(",")[0] ?? "") : cityText,
        cdekCityCode: city?.code ?? null,
        address: type === "PVZ" ? (point?.address ?? pvzText) : street,
        postalCode: type === "PVZ" ? (point?.postalCode ?? null) : null,
        cdekPvzCode: type === "PVZ" ? (point?.code ?? null) : null,
        recipientName: name,
        recipientPhone: phone,
        note,
        isDefault,
      }).catch(() => ({ error: "Нет связи с сервером" }) as { error?: string; ok?: string });
      if (r.error) setError(r.error);
      else onDone();
    });
  }

  return (
    <form className="panel stack" onSubmit={save} style={{ background: "var(--c-bg)" }}>
      <strong>{initial ? `Изменить «${initial.label}»` : "Новый адрес"}</strong>
      <label className="field">
        Название
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} required list="addr-labels" />
        <datalist id="addr-labels">
          <option value="Дом" />
          <option value="Работа" />
          <option value="Дача" />
          <option value="Для родителей" />
        </datalist>
      </label>
      <div className="seg" role="radiogroup" aria-label="Способ доставки">
        {delivery.pvz && (
          <button type="button" role="radio" aria-checked={type === "PVZ"} onClick={() => setType("PVZ")}>
            <strong>Пункт выдачи СДЭК</strong>
          </button>
        )}
        {delivery.courier && (
          <button type="button" role="radio" aria-checked={type === "COURIER"} onClick={() => setType("COURIER")}>
            <strong>Курьер до двери</strong>
          </button>
        )}
      </div>
      {delivery.cdek ? (
        <CityPicker
          value={city}
          onChange={(c) => {
            setCity(c);
            setPoint(null);
          }}
        />
      ) : (
        <label className="field">
          Город
          <input className="input" value={cityText} onChange={(e) => setCityText(e.target.value)} placeholder="Краснодар" required />
        </label>
      )}
      {type === "PVZ" && delivery.cdek && city && <PointPicker city={city} value={point} onChange={setPoint} />}
      {type === "PVZ" && !delivery.cdek && (
        <label className="field">
          Адрес пункта СДЭК, если знаете
          <input className="input" value={pvzText} onChange={(e) => setPvzText(e.target.value)} />
        </label>
      )}
      {type === "COURIER" && (
        <label className="field">
          Улица, дом, квартира
          <input className="input" value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" placeholder="ул. Северная, 324, кв. 15" />
        </label>
      )}
      <div className="form-grid">
        <label className="field">
          ФИО получателя
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
        </label>
        <label className="field">
          Телефон получателя
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+7 900 123-45-67" />
        </label>
      </div>
      <label className="field">
        Заметка — увидят магазин и курьер СДЭК
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Код домофона 45, позвонить за час" />
      </label>
      <label className="check">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        <span>Основной адрес — подставлять при оформлении</span>
      </label>
      {error && <div className="form-error">{error}</div>}
      <div className="row">
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button type="button" className="btn btn--line btn--sm" onClick={onDone} disabled={pending}>
          Отмена
        </button>
      </div>
    </form>
  );
}
