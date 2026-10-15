"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MediaUploader } from "@/components/inspection/MediaUploader";
import { markInspected, saveInspection } from "./inspection-actions";

interface Props {
  orderId: string;
  connected: boolean;
  checklistItems: string[];
  initial: { serialNumber: string; sealNumber: string; note: string; checklist: string[]; checkedAt: string | null; folderUrl: string | null };
  mediaCount: number;
  children?: React.ReactNode; // галерея (рисуется на сервере)
}

export function InspectionPanel({ orderId, connected, checklistItems, initial, mediaCount, children }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [serial, setSerial] = useState(initial.serialNumber);
  const [seal, setSeal] = useState(initial.sealNumber);
  const [note, setNote] = useState(initial.note);
  const [checked, setChecked] = useState<string[]>(initial.checklist);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});

  const save = () => start(async () => setMsg(await saveInspection({ orderId, serialNumber: serial, sealNumber: seal, note, checklist: checked })));

  return (
    <div className="panel stack" id="inspection">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Проверка перед отправкой</h2>
        {initial.checkedAt ? <span className="pill pill--ok">проверено {initial.checkedAt}</span> : <span className="pill">не проверено</span>}
      </div>
      {!connected ? (
        <div className="muted small">
          Чтобы прикладывать фото и видео, подключите Google Диск: <a href="/admin/settings#drive">Настройки → Google Диск</a>.
        </div>
      ) : (
        <>
          <div className="muted small">
            Снимите товар перед упаковкой: общий вид, серийный номер, соединение, наклейку, прокат по столу на видео. Файлы попадут в папку заказа на
            Google Диске — покупатель сможет смотреть, но не скачать.
            {initial.folderUrl && (
              <>
                {" "}
                <a href={initial.folderUrl} target="_blank" rel="noreferrer">
                  Папка заказа
                </a>
              </>
            )}
          </div>
          {children}
          <MediaUploader orderId={orderId} />
        </>
      )}
      <div className="form-grid">
        <label className="field">
          Серийный номер
          <input className="input" value={serial} onChange={(e) => setSerial(e.target.value)} maxLength={80} placeholder="Например, P-IKON-123456" />
        </label>
        <label className="field">
          Номер пломбы
          <input className="input" value={seal} onChange={(e) => setSeal(e.target.value)} maxLength={80} placeholder="С наклейки на соединении" />
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Чек-лист мастера</span>
        {checklistItems.map((c) => (
          <label key={c} className="check">
            <input type="checkbox" checked={checked.includes(c)} onChange={(e) => setChecked((x) => (e.target.checked ? [...x, c] : x.filter((y) => y !== c)))} />
            <span>{c}</span>
          </label>
        ))}
      </div>
      <label className="field">
        Заметка (видит покупатель)
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Например: проверил мастер Иосиф, кий прямой" />
      </label>
      {msg.error && <div className="form-error">{msg.error}</div>}
      {msg.ok && <div className="form-ok">{msg.ok}</div>}
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn btn--line btn--sm" disabled={pending} onClick={save}>
          Сохранить
        </button>
        {!initial.checkedAt && (
          <button
            type="button"
            className="btn btn--gold btn--sm"
            disabled={pending || mediaCount === 0}
            title={mediaCount === 0 ? "Сначала загрузите фото или видео" : undefined}
            onClick={() =>
              confirm("Отметить «Проверено»? Покупатель получит письмо с фото и видео, удалить их потом будет нельзя.") &&
              start(async () => {
                const r = await saveInspection({ orderId, serialNumber: serial, sealNumber: seal, note, checklist: checked });
                if (r.error) return setMsg(r);
                setMsg(await markInspected(orderId));
                router.refresh();
              })
            }
          >
            Проверено — показать покупателю
          </button>
        )}
      </div>
    </div>
  );
}
