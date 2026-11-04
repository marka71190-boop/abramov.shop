"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { OPEN_LABEL, OpenSelect } from "@/components/admin/OpenSelect";
import { uploadPhotos } from "@/components/admin/upload-photos";
import { duplicateProduct, quickCue, type QuickState } from "../cue-actions";

type Field = { key: string; name: string; unit: string; type: "number" | "select" | "text"; options: string[] };

/** Название из главного: «Кий Taom, турняк эбен, 720 г» */
function autoName(v: Record<string, string>) {
  const parts = [`Кий${v.brand ? ` ${v.brand}` : ""}`];
  if (v.butt) parts.push(`турняк ${v.butt.toLowerCase()}`);
  if (v.weight) parts.push(`${v.weight} г`);
  return parts.join(", ");
}

export function QuickCueForm({ categories, defaultCategory, fields }: { categories: { id: string; name: string }[]; defaultCategory: string; fields: Field[] }) {
  const [state, action, pending] = useActionState<QuickState, FormData>(quickCue, {});
  const [vals, setVals] = useState<Record<string, string>>({ construction: "Разборный 3/4", handmade: "Да" });
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shownName = nameTouched ? name : autoName(vals);
  const rest = fields;

  async function add(files: FileList | File[] | null) {
    if (!files || !files.length) return;
    setErr(null);
    const r = await uploadPhotos(files, (d, t) => setBusy(`Загружаем ${d} из ${t}…`));
    setBusy("");
    setImages((a) => [...a, ...r.urls]);
    if (r.errors.length) setErr(r.errors.slice(0, 3).join("; "));
    if (fileRef.current) fileRef.current.value = "";
  }

  if (state.ok) {
    const ok = state.ok;
    return (
      <div className="panel stack" style={{ gap: 14, maxWidth: 720 }}>
        <div className="form-ok">
          {ok.published ? "Кий опубликован" : "Кий сохранён черновиком"}: {ok.name}
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <a className="btn btn--gold btn--sm" href={`/product/${ok.slug}?preview=${ok.previewToken}`} target="_blank" rel="noreferrer">
            Посмотреть на сайте
          </a>
          <Link className="btn btn--line btn--sm" href={`/admin/catalog/product/${ok.id}`}>
            Дописать в полной карточке
          </Link>
          <button type="button" className="btn btn--line btn--sm" onClick={() => duplicateProduct(ok.id)}>
            Создать похожий
          </button>
          <a className="btn btn--line btn--sm" href="/admin/catalog/new-cue">
            Добавить ещё кий
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="stack" style={{ maxWidth: 860 }}>
      <input type="hidden" name="images" value={JSON.stringify(images)} />
      <input type="hidden" name="attrs" value={JSON.stringify(vals)} />
      <input type="hidden" name="construction" value={vals.construction ?? ""} />
      <input type="hidden" name="name" value={shownName} />

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>1. Фото</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Выберите сразу все снимки — порядок как в галерее телефона. Первое — обложка. Кий во весь рост лучше снять одним длинным кадром на
          однотонном фоне: сайт сохранит его в высоком качестве, и покупатель сможет рассмотреть каждый запил.
        </p>
        <div
          className={`img-grid${drop ? " is-drop" : ""}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDrop(true);
            }
          }}
          onDragLeave={() => setDrop(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrop(false);
            add(e.dataTransfer.files);
          }}
        >
          {images.map((url, i) => (
            <div key={url} className="img-tile">
              <img src={url} alt="" />
              {i === 0 && <span className="tag" style={{ position: "absolute", top: 6, left: 6, padding: "3px 8px", fontSize: 11 }}>Обложка</span>}
              <div className="img-tile__bar">
                {i > 0 && (
                  <button type="button" aria-label="Сделать обложкой" title="Сделать обложкой" onClick={() => setImages((a) => [a[i], ...a.filter((_, j) => j !== i)])}>
                    ★
                  </button>
                )}
                <button type="button" aria-label="Левее" disabled={i === 0} onClick={() => setImages((a) => swap(a, i, i - 1))}>
                  ←
                </button>
                <button type="button" aria-label="Правее" disabled={i === images.length - 1} onClick={() => setImages((a) => swap(a, i, i + 1))}>
                  →
                </button>
                <button type="button" aria-label="Удалить фото" onClick={() => setImages((a) => a.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <label className="img-tile img-tile--add">
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => add(e.target.files)} />
            {busy || "+ Фото"}
          </label>
        </div>
        {err && <div className="form-error">{err}</div>}
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>2. Кий</h2>
        <div className="form-grid">
          {rest.map((f) => (
            <label key={f.key} className="field">
              {f.name}
              {f.unit ? `, ${f.unit}` : ""}
              {OPEN_LABEL[f.key] && f.type === "select" ? (
                <OpenSelect
                  value={vals[f.key] ?? ""}
                  options={f.options}
                  onChange={(v) => setVals({ ...vals, [f.key]: v })}
                  addLabel={OPEN_LABEL[f.key].add}
                  placeholder={OPEN_LABEL[f.key].placeholder}
                />
              ) : f.type === "select" ? (
                <select className="select" value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  value={vals[f.key] ?? ""}
                  onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
                  placeholder={f.key === "weight" ? "720" : f.key === "length" ? "160" : f.key === "tip" ? "12,5" : ""}
                />
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>3. Цена и публикация</h2>
        <div className="form-grid">
          <label className="field">
            Название
            <input
              className="input"
              value={shownName}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
              required
              maxLength={200}
            />
            {!nameTouched && <span className="muted small">Собирается из мастера, турняка и веса — можно поправить</span>}
          </label>
          <label className="field">
            Цена, ₽
            <input className="input" name="price" type="number" min={1} step="1" inputMode="numeric" required />
          </label>
          <label className="field">
            Старая цена, ₽ (если скидка)
            <input className="input" name="oldPrice" type="number" min={1} step="1" inputMode="numeric" />
          </label>
          <label className="field">
            Количество
            <input className="input" name="qty" type="number" min={0} max={1000} defaultValue={1} inputMode="numeric" />
            <span className="muted small">1 — штучный экземпляр: когда продадут, покажем «Продан» и похожие</span>
          </label>
          <label className="field">
            Категория
            <select className="select" name="categoryId" defaultValue={defaultCategory} required>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Описание (необязательно)
          <textarea className="textarea" name="description" style={{ minHeight: 110, paddingTop: 12 }} placeholder="Чем хорош этот кий: баланс, ощущения при ударе, кому подойдёт" />
        </label>
        {state.error && <div className="form-error">{state.error}</div>}
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn--gold btn--sm" name="publish" value="PUBLISHED" disabled={pending || !!busy}>
            {pending ? "Сохраняем…" : "Опубликовать"}
          </button>
          <button className="btn btn--line btn--sm" name="publish" value="DRAFT" disabled={pending || !!busy}>
            Сохранить черновиком
          </button>
        </div>
      </div>
    </form>
  );
}

function swap<T>(a: T[], i: number, j: number) {
  const b = [...a];
  [b[i], b[j]] = [b[j], b[i]];
  return b;
}
