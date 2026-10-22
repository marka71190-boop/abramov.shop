"use client";
import { useActionState, useRef, useState } from "react";
import { serviceAction } from "../actions";

interface Props {
  id: string;
  status: string;
  price: number | null;
  readyBy: string;
  paid: boolean;
  billed: boolean;
  online: boolean;
  events: { id: string; status: string; note: string | null; photo: string | null; at: string }[];
}

const NEXT: Record<string, { op: string; label: string }[]> = {
  NEW: [{ op: "RECEIVED", label: "Кий у мастера" }],
  RECEIVED: [
    { op: "IN_WORK", label: "В работе" },
    { op: "READY", label: "Готов" },
  ],
  IN_WORK: [
    { op: "IN_WORK", label: "Новости из мастерской" },
    { op: "READY", label: "Готов" },
  ],
  READY: [{ op: "DONE", label: "Выдан / отправлен" }],
};

export function ServiceControls({ id, status, price, readyBy, paid, billed, online, events }: Props) {
  const [state, action, pending] = useActionState(serviceAction, {});
  const [photo, setPhoto] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const open = status !== "DONE" && status !== "CANCELLED";

  async function upload(f?: File) {
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/admin/media", { method: "POST", body: fd }).then((x) => x.json());
      if (r.url) setPhoto(r.url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="grid-2">
      <form action={action} className="panel stack">
        <h2 style={{ margin: 0 }}>Действия</h2>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="photo" value={photo} />
        <div className="form-grid">
          <label className="field">
            Итоговая цена, ₽
            <input className="input" name="price" inputMode="decimal" defaultValue={price != null ? String(price / 100) : ""} disabled={!open} />
          </label>
          <label className="field">
            Будет готов к
            <input className="input" name="readyBy" type="date" defaultValue={readyBy} disabled={!open} />
          </label>
        </div>
        {open && (
          <>
            <label className="field">
              Комментарий для клиента (уйдёт в письме)
              <textarea className="textarea" name="note" maxLength={1000} style={{ minHeight: 70, paddingTop: 10 }} placeholder="Поставили наклейку Kamui Black M, проточили" />
            </label>
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn--line btn--sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? "Загружаем…" : photo ? "Заменить фото" : "+ Фото"}
              </button>
              {photo && <img src={photo} alt="" style={{ height: 48 }} />}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {(NEXT[status] ?? []).map((n) => (
                <button key={n.op + n.label} className={`btn btn--sm ${n.op === "READY" || n.op === "DONE" ? "btn--gold" : "btn--line"}`} name="op" value={n.op} disabled={pending || uploading}>
                  {n.label}
                </button>
              ))}
              <button className="btn btn--line btn--sm" name="op" value="terms" disabled={pending}>
                Сохранить цену и срок
              </button>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--c-line)", paddingTop: 12 }}>
              {!paid && online && (
                <button className="btn btn--line btn--sm" name="op" value="bill" disabled={pending}>
                  {billed ? "Выставить счёт заново" : "Выставить счёт онлайн"}
                </button>
              )}
              {!paid && (
                <button className="btn btn--line btn--sm" name="op" value="paid" disabled={pending} onClick={(e) => !confirm("Клиент заплатил на месте?") && e.preventDefault()}>
                  Оплачено на месте
                </button>
              )}
              <button className="btn btn--danger btn--sm" name="op" value="CANCELLED" disabled={pending} onClick={(e) => !confirm("Отменить заявку? Клиенту уйдёт письмо.") && e.preventDefault()}>
                Отменить
              </button>
            </div>
          </>
        )}
        {state.error && <div className="form-error">{state.error}</div>}
        {state.ok && <div className="form-ok">{state.ok}</div>}
      </form>
      <div className="panel stack">
        <h2 style={{ margin: 0 }}>Ход работ</h2>
        <ol className="prod-steps">
          {events.map((e) => (
            <li key={e.id}>
              <div>
                <b>{e.status}</b> <span className="muted small">· {e.at}</span>
              </div>
              {e.note && <div className="small" style={{ whiteSpace: "pre-line" }}>{e.note}</div>}
              {e.photo && <img src={e.photo} alt="" className="prod-photo" />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
