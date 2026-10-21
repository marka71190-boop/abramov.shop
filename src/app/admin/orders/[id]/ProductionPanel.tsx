"use client";
import { useActionState, useRef, useState } from "react";
import { productionAction } from "./production-actions";

export interface ProdEvent {
  id: string;
  stage: "ACCEPTED" | "IN_WORK" | "READY";
  note: string | null;
  photo: string | null;
  at: string; // «21.10.2026, 22:40»
}
const LABEL = { ACCEPTED: "Принят в работу", IN_WORK: "Мастер работает", READY: "Кий готов" } as const;

/** Изготовление кия: история этапов и отметка нового этапа (с комментарием и фото для покупателя) */
export function ProductionPanel({ orderId, events, canEdit, ready }: { orderId: string; events: ProdEvent[]; canEdit: boolean; ready: string | null }) {
  const [state, action, pending] = useActionState(productionAction, {});
  const [photo, setPhoto] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const done = events.some((e) => e.stage === "READY");

  async function upload(f: File | undefined) {
    if (!f) return;
    setErr(null);
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
    <div className="panel stack" id="production">
      <h2 style={{ marginBottom: 0 }}>Изготовление кия</h2>
      {ready && !done && <p className="muted small" style={{ margin: 0 }}>Обещали покупателю: готов к {ready}.</p>}
      {events.length ? (
        <ol className="prod-steps">
          {events.map((e) => (
            <li key={e.id}>
              <div>
                <b>{LABEL[e.stage]}</b> <span className="muted small">· {e.at}</span>
              </div>
              {e.note && <div className="small" style={{ whiteSpace: "pre-line" }}>{e.note}</div>}
              {e.photo && <img src={e.photo} alt="" className="prod-photo" />}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>Этап «Принят в работу» появится сам, когда заказ оплатят.</p>
      )}
      {canEdit && (
        <form action={action} className="stack" style={{ gap: 10, borderTop: "1px solid var(--c-line)", paddingTop: 14 }}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="photo" value={photo} />
          <label className="field">
            Комментарий для покупателя (необязательно)
            <textarea className="textarea" name="note" maxLength={1000} style={{ minHeight: 70, paddingTop: 10 }} placeholder="Например: склеили турняк, запилы из эбена — смотрится отлично" />
          </label>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn--line btn--sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Загружаем…" : photo ? "Заменить фото" : "+ Фото"}
            </button>
            {photo && (
              <>
                <img src={photo} alt="" style={{ height: 48, border: "1px solid var(--c-line)" }} />
                <button type="button" className="linklike small" onClick={() => setPhoto("")}>
                  убрать
                </button>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </div>
          {err && <div className="form-error">{err}</div>}
          {state.error && <div className="form-error">{state.error}</div>}
          {state.ok && <div className="form-ok">{state.ok}</div>}
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn--line btn--sm" name="stage" value="IN_WORK" disabled={pending || uploading}>
              {events.some((e) => e.stage === "IN_WORK") ? "Новости из мастерской" : "В работе"}
            </button>
            {!done && (
              <button className="btn btn--gold btn--sm" name="stage" value="READY" disabled={pending || uploading}>
                Кий готов
              </button>
            )}
          </div>
          <p className="muted small" style={{ margin: 0 }}>Покупателю сразу уйдёт письмо с комментарием и фото. Потом — обычная отправка СДЭК кнопкой выше.</p>
        </form>
      )}
    </div>
  );
}
