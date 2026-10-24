"use client";
import { useActionState, useRef, useState } from "react";
import { SECTIONS } from "@/lib/journal-shared";
import { deleteArticle, saveArticle } from "../actions";

interface A {
  id: string;
  title: string;
  slug: string;
  section: string;
  excerpt: string;
  body: string;
  cover: string | null;
  productIds: string[];
  visibility: "DRAFT" | "HIDDEN" | "PUBLISHED";
  publishAt: Date | null;
  previewToken: string;
  seoTitle: string | null;
  seoDescription: string | null;
}
type P = { id: string; name: string; slug: string; sku: string | null };

const toLocal = (d: Date | null) => (d ? new Date(+new Date(d) + 3 * 3600_000).toISOString().slice(0, 16) : "");

async function uploadFile(f: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", f);
  const r = await fetch("/api/admin/media", { method: "POST", body: fd }).then((x) => x.json());
  if (!r.url) throw new Error(r.error ?? "Не удалось загрузить");
  return r.url as string;
}

export function ArticleForm({ article: a, products, saved, canDelete }: { article: A | null; products: P[]; saved: boolean; canDelete: boolean }) {
  const [state, action, pending] = useActionState(saveArticle, saved ? { ok: "Статья создана" } : {});
  const [cover, setCover] = useState(a?.cover ?? "");
  const [body, setBody] = useState(a?.body ?? "");
  const [ids, setIds] = useState<string[]>(a?.productIds ?? []);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const insert = (text: string) => {
    const el = area.current;
    const at = el ? el.selectionStart : body.length;
    const before = body.slice(0, at);
    const after = body.slice(at);
    const pre = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const next = `${before}${pre}${text}\n\n${after.replace(/^\n+/, "")}`;
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = (before + pre + text).length + 2;
      el?.setSelectionRange(pos, pos);
    });
  };

  const needle = q.trim().toLowerCase();
  const found = needle ? products.filter((p) => p.name.toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle)).slice(0, 6) : [];

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      {a && <input type="hidden" name="id" value={a.id} />}
      <input type="hidden" name="cover" value={cover} />
      <input type="hidden" name="productIds" value={JSON.stringify(ids)} />
      <div className="panel stack">
        <label className="field">
          Заголовок
          <input className="input" name="title" defaultValue={a?.title ?? ""} required maxLength={200} />
        </label>
        <div className="form-grid">
          <label className="field">
            Адрес (латиницей)
            <input className="input" name="slug" defaultValue={a?.slug ?? ""} placeholder="заполнится из заголовка" />
          </label>
          <label className="field">
            Раздел
            <select className="select" name="section" defaultValue={a?.section ?? "tips"}>
              {Object.entries(SECTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Видимость
            <select className="select" name="visibility" defaultValue={a?.visibility ?? "DRAFT"}>
              <option value="DRAFT">Черновик</option>
              <option value="HIDDEN">Скрыта</option>
              <option value="PUBLISHED">Опубликована</option>
            </select>
          </label>
          <label className="field">
            Дата публикации (МСК)
            <input className="input" type="datetime-local" name="publishAt" defaultValue={toLocal(a?.publishAt ?? null)} />
          </label>
        </div>
        <label className="field">
          Анонс — 1–2 предложения для списка и поиска
          <textarea className="textarea" name="excerpt" defaultValue={a?.excerpt ?? ""} maxLength={400} style={{ minHeight: 60, paddingTop: 10 }} />
        </label>
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">Обложка</span>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            {cover && <img src={cover} alt="" style={{ width: 140, height: 80, objectFit: "cover" }} />}
            <button type="button" className="btn btn--line btn--sm" disabled={busy} onClick={() => coverRef.current?.click()}>
              {cover ? "Заменить" : "Загрузить обложку"}
            </button>
            {cover && (
              <button type="button" className="linklike small" onClick={() => setCover("")}>
                Убрать
              </button>
            )}
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                setErr(null);
                try {
                  setCover(await uploadFile(f));
                } catch (x) {
                  setErr(x instanceof Error ? x.message : "Ошибка");
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0 }}>Текст</h2>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn btn--line btn--sm" onClick={() => insert("## Подзаголовок")}>
              Подзаголовок
            </button>
            <button type="button" className="btn btn--line btn--sm" onClick={() => insert("> Совет: ")}>
              Совет
            </button>
            <button type="button" className="btn btn--line btn--sm" disabled={busy} onClick={() => imgRef.current?.click()}>
              {busy ? "Загружаем…" : "Фото"}
            </button>
            <input
              ref={imgRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                setErr(null);
                try {
                  insert(`![Подпись к фото](${await uploadFile(f)})`);
                } catch (x) {
                  setErr(x instanceof Error ? x.message : "Ошибка");
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </div>
        </div>
        <textarea ref={area} className="textarea article-editor" name="body" value={body} onChange={(e) => setBody(e.target.value)} />
        <details className="small muted">
          <summary>Как оформлять текст</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Пустая строка — новый абзац</li>
            <li>«## » в начале строки — подзаголовок, «### » — подзаголовок поменьше</li>
            <li>«- » — пункт списка, «1. » — нумерованный пункт</li>
            <li>«&gt; » — выделенный совет</li>
            <li>**жирный текст**, [текст ссылки](/catalog) или [текст](https://…)</li>
            <li>Ссылка на видео VK, Rutube или YouTube отдельной строкой — встроится плеер</li>
            <li>[[product:адрес-товара]] отдельной строкой — карточка товара с ценой и кнопкой</li>
          </ul>
        </details>
        {err && <div className="form-error">{err}</div>}
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">Вставить товар в текст или добавить в блок «Товары из статьи»:</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или артикул товара" style={{ maxWidth: 420 }} />
          {found.map((p) => (
            <div key={p.id} className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200 }}>{p.name}</span>
              <button type="button" className="btn btn--line btn--sm" onClick={() => insert(`[[product:${p.slug}]]`)}>
                В текст
              </button>
              <button type="button" className="btn btn--line btn--sm" disabled={ids.includes(p.id) || ids.length >= 12} onClick={() => setIds([...ids, p.id])}>
                В конец статьи
              </button>
            </div>
          ))}
          {ids.length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {ids.map((id) => (
                <span key={id} className="pill">
                  {products.find((p) => p.id === id)?.name ?? "Удалён"}{" "}
                  <button type="button" className="linklike" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label="Убрать">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <details className="panel">
        <summary>Для поисковиков (необязательно)</summary>
        <div className="stack" style={{ marginTop: 12 }}>
          <label className="field">
            Заголовок для поиска
            <input className="input" name="seoTitle" defaultValue={a?.seoTitle ?? ""} maxLength={200} placeholder="по умолчанию — заголовок статьи" />
          </label>
          <label className="field">
            Описание для поиска
            <textarea className="textarea" name="seoDescription" defaultValue={a?.seoDescription ?? ""} maxLength={300} style={{ minHeight: 60, paddingTop: 10 }} placeholder="по умолчанию — анонс" />
          </label>
        </div>
      </details>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn--gold" disabled={pending || busy}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        {a && (
          <a className="btn btn--line" href={`/zhurnal/${a.slug}?preview=${a.previewToken}`} target="_blank" rel="noreferrer">
            Предпросмотр
          </a>
        )}
        {a && canDelete && (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (confirm("Удалить статью безвозвратно?")) void deleteArticle(a.id);
            }}
          >
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
