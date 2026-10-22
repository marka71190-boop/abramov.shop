"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { rub } from "@/lib/format";
import { createServiceAction } from "./actions";

interface Props {
  prices: { id: string; name: string; price: number; priceFrom: boolean; days: number }[];
  clubs: { id: string; name: string; city: string; address: string }[];
  cdek: boolean;
  user: { name: string; phone: string; email: string };
}

export function ServiceForm({ prices, clubs, cdek, user }: Props) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [handover, setHandover] = useState<"CLUB" | "CDEK">(clubs.length ? "CLUB" : "CDEK");
  const [clubId, setClubId] = useState<string | null>(clubs.length === 1 ? clubs[0].id : null);
  const [returnMethod, setReturnMethod] = useState<"CLUB" | "CDEK">(clubs.length ? "CLUB" : "CDEK");
  const [returnAddress, setReturnAddress] = useState("");
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [email, setEmail] = useState(user.email);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const picked = prices.filter((p) => ids.includes(p.id));
  const sum = picked.reduce((a, p) => a + p.price, 0);
  const from = picked.some((p) => p.priceFrom);
  const maxDays = Math.max(0, ...picked.map((p) => p.days));
  const needClub = handover === "CLUB" || returnMethod === "CLUB";

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files).slice(0, 6 - photos.length)) {
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/media", { method: "POST", body: fd }).then((x) => x.json());
        if (r.url) setPhotos((p) => [...p, r.url].slice(0, 6));
        else setError(r.error ?? "Не удалось загрузить фото");
      } catch {
        setError("Не удалось загрузить фото");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const r = await createServiceAction({ itemIds: ids, description, photos, name, phone, email, handover, clubId: needClub ? clubId : null, returnMethod, returnAddress }).catch(
      () => ({ error: "Нет связи с сервером" }) as const,
    );
    if ("number" in r && r.number) {
      router.push(`/service/${r.number}?new=1`);
      return;
    }
    setPending(false);
    setError(r.error ?? "Ошибка");
  }

  return (
    <form className="checkout" onSubmit={submit}>
      <div className="checkout__main">
        <fieldset className="panel stack">
          <legend className="step">
            <span>1</span> Что сделать
          </legend>
          <div className="stack" style={{ gap: 6 }}>
            {prices.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={ids.includes(p.id)} onChange={(e) => setIds((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)))} />
                <span>
                  {p.name} <span className="muted">· {p.priceFrom ? "от " : ""}{rub(p.price)}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="field">
            Опишите, что с кием (необязательно)
            <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} style={{ minHeight: 90, paddingTop: 10 }} placeholder="Например: наклейка стёрлась, на древке скол у соединения" />
          </label>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            {photos.map((u) => (
              <span key={u} style={{ position: "relative" }}>
                <img src={u} alt="" style={{ width: 72, height: 72, objectFit: "cover", border: "1px solid var(--c-line)" }} />
                <button type="button" className="linklike small" onClick={() => setPhotos((p) => p.filter((x) => x !== u))} style={{ position: "absolute", top: 0, right: 4 }} aria-label="Убрать фото">
                  ×
                </button>
              </span>
            ))}
            {photos.length < 6 && (
              <button type="button" className="btn btn--line btn--sm" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
                {uploading ? "Загружаем…" : "+ Фото кия"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          </div>
        </fieldset>

        <fieldset className="panel stack">
          <legend className="step">
            <span>2</span> Как передать и забрать
          </legend>
          <div className="label">Передать кий</div>
          <div className="seg" role="radiogroup" aria-label="Как передать кий">
            {clubs.length > 0 && (
              <button type="button" role="radio" aria-checked={handover === "CLUB"} onClick={() => setHandover("CLUB")}>
                <strong>Принесу в клуб</strong>
                <span>{[...new Set(clubs.map((c) => c.city))].join(", ")}</span>
              </button>
            )}
            {cdek && (
              <button type="button" role="radio" aria-checked={handover === "CDEK"} onClick={() => setHandover("CDEK")}>
                <strong>Отправлю СДЭК</strong>
                <span>адрес пришлём в письме</span>
              </button>
            )}
          </div>
          <div className="label">Забрать готовый</div>
          <div className="seg" role="radiogroup" aria-label="Как забрать кий">
            {clubs.length > 0 && (
              <button type="button" role="radio" aria-checked={returnMethod === "CLUB"} onClick={() => setReturnMethod("CLUB")}>
                <strong>Заберу в клубе</strong>
                <span>бесплатно</span>
              </button>
            )}
            <button type="button" role="radio" aria-checked={returnMethod === "CDEK"} onClick={() => setReturnMethod("CDEK")}>
              <strong>Отправьте СДЭК</strong>
              <span>по тарифу СДЭК</span>
            </button>
          </div>
          {needClub && (
            <div className="club-list" role="radiogroup" aria-label="Клуб">
              {clubs.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={clubId === c.id} className="addr-card" onClick={() => setClubId(c.id)}>
                  <span className="label">{c.city}</span>
                  <strong>{c.name}</strong>
                  <span className="small">{c.address}</span>
                </button>
              ))}
            </div>
          )}
          {returnMethod === "CDEK" && (
            <label className="field">
              Куда отправить: город и пункт СДЭК или адрес
              <input className="input" value={returnAddress} onChange={(e) => setReturnAddress(e.target.value)} maxLength={300} placeholder="Краснодар, ПВЗ на ул. Красной, 176" />
            </label>
          )}
        </fieldset>

        <fieldset className="panel stack">
          <legend className="step">
            <span>3</span> Контакты
          </legend>
          <div className="form-grid">
            <label className="field">
              Имя
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </label>
            <label className="field">
              Телефон
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required type="tel" autoComplete="tel" />
            </label>
            <label className="field">
              Почта — для новостей по заявке
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} required type="email" autoComplete="email" />
            </label>
          </div>
        </fieldset>
      </div>

      <aside className="summary">
        <div className="label">Заявка</div>
        {picked.length ? (
          picked.map((p) => (
            <div key={p.id} className="summary__row small">
              <span>{p.name}</span>
              <span>
                {p.priceFrom ? "от " : ""}
                {rub(p.price)}
              </span>
            </div>
          ))
        ) : (
          <div className="muted small">Выберите работы слева</div>
        )}
        {picked.length > 0 && (
          <div className="summary__total">
            <span>Ориентировочно</span>
            <span>
              {from ? "от " : ""}
              {rub(sum)}
            </span>
          </div>
        )}
        {maxDays > 0 && <p className="muted small" style={{ margin: 0 }}>Срок — около {maxDays} дн. после того, как кий попадёт к мастеру.</p>}
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn--gold btn--block" disabled={pending || !ids.length || (needClub && !clubId) || uploading > 0}>
          {pending ? "Отправляем…" : "Отправить заявку"}
        </button>
        <p className="muted small" style={{ margin: 0 }}>Платить сейчас не нужно: мастер посмотрит кий и назовёт точную цену.</p>
      </aside>
    </form>
  );
}
