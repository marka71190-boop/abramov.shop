"use client";
import { useActionState, useState } from "react";
import { slugify } from "@/lib/slug";
import { deleteCategory, saveCategory } from "../../../shop-actions";

export interface CategoryData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  visibility: "DRAFT" | "HIDDEN" | "PUBLISHED";
  publishAt: Date | null;
  sortOrder: number;
  previewToken: string;
}

const toLocal = (d: Date | null) => (d ? new Date(+new Date(d) + 3 * 3600_000).toISOString().slice(0, 16) : "");

export function CategoryForm({ category, saved, canDelete }: { category: CategoryData | null; saved: boolean; canDelete: boolean }) {
  const [state, action, pending] = useActionState(saveCategory, saved ? { ok: "Категория создана" } : {});
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [touched, setTouched] = useState(!!category);
  const [image, setImage] = useState(category?.image ?? "");
  const [err, setErr] = useState<string | null>(null);

  async function upload(f: File | undefined) {
    if (!f) return;
    setErr(null);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/admin/media", { method: "POST", body: fd })
      .then((x) => x.json())
      .catch(() => ({ error: "Не удалось загрузить" }));
    if (r.url) setImage(r.url);
    else setErr(r.error);
  }

  return (
    <form action={action} className="panel stack">
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="image" value={image} />
      <div className="form-grid">
        <label className="field">
          Название
          <input className="input" name="name" defaultValue={category?.name} required onChange={(e) => !touched && setSlug(slugify(e.target.value))} />
        </label>
        <label className="field">
          Адрес: /catalog/…
          <input
            className="input"
            name="slug"
            value={slug}
            required
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setTouched(true);
            }}
          />
        </label>
        <label className="field">
          Видимость
          <select className="select" name="visibility" defaultValue={category?.visibility ?? "HIDDEN"}>
            <option value="DRAFT">Черновик</option>
            <option value="HIDDEN">Скрыто</option>
            <option value="PUBLISHED">Опубликовано</option>
          </select>
        </label>
        <label className="field">
          Открыть автоматически (МСК)
          <input className="input" type="datetime-local" name="publishAt" defaultValue={toLocal(category?.publishAt ?? null)} />
        </label>
        <label className="field">
          Порядок на главной
          <input className="input" name="sortOrder" type="number" defaultValue={category?.sortOrder ?? 0} />
        </label>
      </div>
      <label className="field">
        Описание
        <textarea className="textarea" name="description" defaultValue={category?.description ?? ""} style={{ minHeight: 100, paddingTop: 12 }} />
      </label>
      <div className="row" style={{ alignItems: "center" }}>
        {image && <img src={image} alt="" style={{ width: 96, height: 96, objectFit: "cover" }} />}
        <label className="btn btn--line btn--sm">
          {image ? "Заменить картинку" : "Картинка категории"}
          <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {image && (
          <button type="button" className="linklike small" onClick={() => setImage("")}>
            Убрать
          </button>
        )}
      </div>
      {err && <div className="form-error">{err}</div>}
      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row">
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        {category && (
          <a className="btn btn--line btn--sm" href={`/catalog/${category.slug}?preview=${category.previewToken}`} target="_blank" rel="noreferrer">
            Предпросмотр
          </a>
        )}
        {category && canDelete && (
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={() => confirm("Удалить категорию? Удалить можно только пустую.") && deleteCategory(category.id).catch((e) => alert(e.message))}
          >
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
