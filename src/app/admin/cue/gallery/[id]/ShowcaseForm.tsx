"use client";
import { useActionState, useRef, useState } from "react";
import { deleteShowcase, saveShowcase } from "../actions";

interface Item {
  id: string;
  title: string;
  description: string;
  photos: string[];
  cueKey: string;
  sortOrder: number;
  published: boolean;
}

export function ShowcaseForm({ item }: { item: Item }) {
  const [state, action, pending] = useActionState(saveShowcase, {});
  const [photos, setPhotos] = useState<string[]>(item.photos);
  const [uploading, setUploading] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    for (const f of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/admin/media", { method: "POST", body: fd }).then((x) => x.json());
        if (r.url) setPhotos((p) => [...p, r.url].slice(0, 12));
        else setErr(r.error ?? "Не удалось загрузить");
      } catch {
        setErr("Не удалось загрузить — проверьте интернет");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  const move = (i: number, d: number) =>
    setPhotos((p) => {
      const a = [...p];
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  return (
    <form action={action} className="panel stack">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="photos" value={JSON.stringify(photos)} />
      <input type="hidden" name="cueKey" value={item.cueKey} />
      <div className="form-grid">
        <label className="field">
          Название
          <input className="input" name="title" defaultValue={item.title} maxLength={120} required />
        </label>
        <label className="field">
          Порядок (меньше — выше)
          <input className="input" name="sortOrder" type="number" defaultValue={item.sortOrder} />
        </label>
      </div>
      <label className="field">
        Пара слов о кие (необязательно)
        <textarea className="textarea" name="description" defaultValue={item.description} maxLength={1500} style={{ minHeight: 80, paddingTop: 10 }} placeholder="Для турнирной игры, мягкий удар, запилы корона из эбена" />
      </label>
      <div className="stack" style={{ gap: 8 }}>
        <div className="label">Фото (первое — обложка)</div>
        <div className="showcase-photos">
          {photos.map((u, i) => (
            <div key={u + i} className="showcase-photos__item">
              <img src={u} alt="" />
              <div className="row" style={{ gap: 4 }}>
                <button type="button" className="btn btn--line btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Левее">
                  ←
                </button>
                <button type="button" className="btn btn--line btn--sm" onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label="Правее">
                  →
                </button>
                <button type="button" className="btn btn--line btn--sm" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} aria-label="Убрать">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn--line btn--sm" onClick={() => fileRef.current?.click()} disabled={uploading > 0 || photos.length >= 12}>
            {uploading ? "Загружаем…" : "+ Фото"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
        {err && <div className="form-error">{err}</div>}
      </div>
      <label className="check">
        <input type="checkbox" name="published" defaultChecked={item.published} />
        <span>Показывать на сайте</span>
      </label>
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn--gold btn--sm" disabled={pending || uploading > 0}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button type="button" className="btn btn--danger btn--sm" onClick={() => confirm("Удалить работу из галереи?") && deleteShowcase(item.id)}>
          Удалить
        </button>
      </div>
    </form>
  );
}
