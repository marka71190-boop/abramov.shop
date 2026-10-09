"use client";
import { useActionState } from "react";
import { deletePage, savePage } from "../../actions";

interface PageRow {
  id: string;
  slug: string;
  title: string;
  body: string;
  visibility: "DRAFT" | "HIDDEN" | "PUBLISHED";
  publishAt: Date | null;
  showInFooter: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  sortOrder: number;
  previewToken: string;
}

/** Дата для поля datetime-local в московском времени. */
function toLocal(d: Date | null) {
  if (!d) return "";
  const msk = new Date(new Date(d).getTime() + 3 * 3600_000);
  return msk.toISOString().slice(0, 16);
}

export function PageForm({ page, saved, canDelete }: { page: PageRow | null; saved: boolean; canDelete: boolean }) {
  const [state, action, pending] = useActionState(savePage, saved ? { ok: "Страница создана" } : {});
  const locked = page ? ["privacy", "consent", "marketing-consent"].includes(page.slug) : false;

  return (
    <form action={action} className="stack">
      {page && <input type="hidden" name="id" value={page.id} />}
      <div className="form-grid">
        <label className="field">
          Заголовок
          <input className="input" name="title" defaultValue={page?.title} required maxLength={200} />
        </label>
        <label className="field">
          Адрес страницы: /p/…
          <input className="input" name="slug" defaultValue={page?.slug} required pattern="[a-z0-9\-]+" readOnly={locked} placeholder="delivery" />
        </label>
        <label className="field">
          Видимость
          <select className="select" name="visibility" defaultValue={page?.visibility ?? "DRAFT"}>
            <option value="DRAFT">Черновик</option>
            <option value="HIDDEN">Скрыто</option>
            <option value="PUBLISHED">Опубликовано</option>
          </select>
        </label>
        <label className="field">
          Открыть автоматически (МСК)
          <input className="input" type="datetime-local" name="publishAt" defaultValue={toLocal(page?.publishAt ?? null)} />
        </label>
      </div>
      <label className="field">
        Текст. «## » в начале строки — подзаголовок, «- » — пункт списка, пустая строка — новый абзац
        <textarea className="textarea" name="body" defaultValue={page?.body} style={{ minHeight: 360, fontFamily: "ui-monospace, monospace", fontSize: 14 }} />
      </label>
      <div className="form-grid">
        <label className="field">
          SEO-заголовок
          <input className="input" name="seoTitle" defaultValue={page?.seoTitle ?? ""} maxLength={200} />
        </label>
        <label className="field">
          SEO-описание
          <input className="input" name="seoDescription" defaultValue={page?.seoDescription ?? ""} maxLength={400} />
        </label>
        <label className="field">
          Порядок в подвале
          <input className="input" name="sortOrder" type="number" defaultValue={page?.sortOrder ?? 0} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="showInFooter" defaultChecked={page?.showInFooter ?? true} />
        <span>Показывать ссылку в подвале сайта (только когда страница опубликована)</span>
      </label>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}

      <div className="row">
        <button className="btn btn--gold btn--sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        {page && (
          <a className="btn btn--line btn--sm" href={`/p/${page.slug}?preview=${page.previewToken}`} target="_blank" rel="noreferrer">
            Предпросмотр
          </a>
        )}
        {page && canDelete && !locked && (
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={() => {
              if (confirm("Удалить страницу безвозвратно?")) deletePage(page.id);
            }}
          >
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
