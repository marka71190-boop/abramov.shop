"use client";
import { useState } from "react";
import { submitReview } from "@/app/(shop)/product/actions";

export function ReviewForm({ productId, initial }: { productId: string; initial?: { rating: number; text: string; photos: string[] } | null }) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(initial?.text ?? "");
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

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
      else setMsg({ error: r.error });
    }
    setUploading(false);
  }

  if (msg.ok) return <div className="form-ok">{msg.ok}</div>;

  return (
    <form
      className="panel stack review-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(await submitReview({ productId, rating, text, photos }));
        setBusy(false);
      }}
    >
      <h3 className="h3" style={{ margin: 0, fontSize: 22 }}>
        {initial?.text ? "Изменить отзыв" : "Ваш отзыв"}
      </h3>
      <div className="star-input" role="radiogroup" aria-label="Оценка" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} из 5`}
            data-on={(hover || rating) >= n || undefined}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Как товар в деле? Что понравилось, что нет?"
        maxLength={2000}
        style={{ minHeight: 110, paddingTop: 12 }}
      />
      <div className="row">
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
            {uploading ? "Загружаем…" : "+ Фото"}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          </label>
        )}
      </div>
      {msg.error && <div className="form-error">{msg.error}</div>}
      <div>
        <button className="btn btn--gold btn--sm" disabled={busy || uploading || !rating || text.trim().length < 10}>
          {busy ? "Отправляем…" : "Отправить отзыв"}
        </button>
      </div>
    </form>
  );
}
