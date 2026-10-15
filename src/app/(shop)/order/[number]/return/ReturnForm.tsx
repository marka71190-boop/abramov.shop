"use client";
import { useState } from "react";
import { rub } from "@/lib/format";
import { submitReturn } from "./actions";

interface Item {
  id: string;
  name: string;
  price: number;
  quantity: number;
  available: number;
  image: string | null;
}

export function ReturnForm(props: {
  orderNumber: string;
  items: Item[];
  qualityAllowed: boolean;
  qualityNote: string;
  qualityReasons: string[];
  defectReasons: string[];
}) {
  const [kind, setKind] = useState<"QUALITY" | "DEFECT">(props.qualityAllowed ? "QUALITY" : "DEFECT");
  const [resolution, setResolution] = useState<"REFUND" | "EXCHANGE" | "DISCOUNT">("REFUND");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(props.items.map((i) => [i.id, props.items.length === 1 && i.available === 1 ? 1 : 0])),
  );
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reasons = kind === "QUALITY" ? props.qualityReasons : props.defectReasons;
  const total = props.items.reduce((a, i) => a + i.price * (qty[i.id] ?? 0), 0);
  const chosen = Object.values(qty).some((n) => n > 0);

  async function upload(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    for (const f of Array.from(files).slice(0, 5 - photos.length)) {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/media", { method: "POST", body: fd })
        .then((x) => x.json())
        .catch(() => ({ error: "Не удалось загрузить фото" }));
      if (r.url) setPhotos((p) => [...p, r.url]);
      else setError(r.error);
    }
    setUploading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!chosen) return setError("Отметьте, что возвращаете");
    if (!reason) return setError("Выберите причину");
    if (kind === "DEFECT" && !photos.length) return setError("Приложите хотя бы одно фото недостатка");
    setBusy(true);
    const r = await submitReturn({
      orderNumber: props.orderNumber,
      kind,
      resolution: kind === "QUALITY" ? "REFUND" : resolution,
      reason,
      comment,
      photos,
      items: Object.entries(qty).map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
    }).catch(() => ({ error: "Нет связи с сервером. Попробуйте ещё раз" }) as { error: string; number?: string });
    setBusy(false);
    if (r.error) return setError(r.error);
    // Без router.refresh(): иначе страница перерисуется («всё уже в заявках») и сообщение об успехе пропадёт
    setDone(r.number ?? "");
  }

  if (done !== null)
    return (
      <div className="panel stack" style={{ borderColor: "var(--c-gold)" }}>
        <strong>Заявка {done} отправлена</strong>
        <p className="muted" style={{ margin: 0 }}>
          Мы рассмотрим её в течение 7 дней и напишем решение. Статус — в личном кабинете, в разделе «Возвраты».
        </p>
        <div className="row" style={{ gap: 12 }}>
          <a className="btn btn--gold btn--sm" href="/account#returns">
            Мои заявки
          </a>
          <a className="btn btn--line btn--sm" href={`/order/${props.orderNumber}`}>
            К заказу
          </a>
        </div>
      </div>
    );

  return (
    <form className="stack rform" onSubmit={submit}>
      <fieldset className="panel stack">
        <legend className="label">Что случилось</legend>
        <label className={`check${props.qualityAllowed ? "" : " check--off"}`}>
          <input
            type="radio"
            name="kind"
            checked={kind === "QUALITY"}
            disabled={!props.qualityAllowed}
            onChange={() => {
              setKind("QUALITY");
              setReason("");
            }}
          />
          <span>
            <b>Товар не подошёл</b> — верну деньги
            <br />
            <span className="muted small">Товар без следов использования, в упаковке; {props.qualityNote}</span>
          </span>
        </label>
        <label className="check">
          <input
            type="radio"
            name="kind"
            checked={kind === "DEFECT"}
            onChange={() => {
              setKind("DEFECT");
              setReason("");
            }}
          />
          <span>
            <b>Брак, повреждение или прислали не тот товар</b>
            <br />
            <span className="muted small">В течение 2 лет после получения. Доставку к нам и обратно оплачиваем мы</span>
          </span>
        </label>
        {kind === "DEFECT" && (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {(
              [
                ["REFUND", "Вернуть деньги"],
                ["EXCHANGE", "Обменять на такой же"],
                ["DISCOUNT", "Скидка, оставлю товар"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" className="vchip" aria-pressed={resolution === v} onClick={() => setResolution(v)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="panel stack">
        <legend className="label">Какие товары</legend>
        {props.items.map((i) => (
          <div key={i.id} className="order-item">
            {i.image ? <img src={i.image} alt="" /> : <span />}
            <div style={{ flex: 1 }}>
              <div>{i.name}</div>
              <div className="muted small">
                {rub(i.price)} · в заказе {i.quantity} шт.{i.available < i.quantity ? `, уже в заявках ${i.quantity - i.available}` : ""}
              </div>
            </div>
            {i.available === 0 ? (
              <span className="muted small">уже в заявке</span>
            ) : (
              <div className="qty">
                <button type="button" aria-label="Меньше" onClick={() => setQty((q) => ({ ...q, [i.id]: Math.max(0, (q[i.id] ?? 0) - 1) }))}>
                  −
                </button>
                <span>{qty[i.id] ?? 0}</span>
                <button type="button" aria-label="Больше" onClick={() => setQty((q) => ({ ...q, [i.id]: Math.min(i.available, (q[i.id] ?? 0) + 1) }))}>
                  +
                </button>
              </div>
            )}
          </div>
        ))}
        {total > 0 && <div className="muted small">Товаров на {rub(total)} (к возврату — сколько вы заплатили за них с учётом скидок и бонусов)</div>}
      </fieldset>

      <fieldset className="panel stack">
        <legend className="label">Причина</legend>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {reasons.map((r) => (
            <button key={r} type="button" className="vchip" aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        <textarea
          className="textarea"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          placeholder={kind === "DEFECT" ? "Опишите недостаток: что и где" : "Комментарий — необязательно"}
          style={{ minHeight: 100, paddingTop: 12 }}
        />
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {photos.map((p) => (
            <div key={p} className="review-thumb">
              <img src={p} alt="" />
              <button type="button" aria-label="Убрать фото" onClick={() => setPhotos((x) => x.filter((y) => y !== p))}>
                ✕
              </button>
            </div>
          ))}
          {photos.length < 5 && (
            <label className="btn btn--line btn--sm">
              {uploading ? "Загружаем…" : kind === "DEFECT" ? "+ Фото недостатка" : "+ Фото"}
              <input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
            </label>
          )}
        </div>
        {kind === "DEFECT" && <div className="muted small">Нужно хотя бы одно фото: товар целиком и крупно недостаток, упаковку, если повреждена.</div>}
      </fieldset>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div>
        <button className="btn btn--gold" disabled={busy || uploading}>
          {busy ? "Отправляем…" : "Отправить заявку"}
        </button>
      </div>
    </form>
  );
}
