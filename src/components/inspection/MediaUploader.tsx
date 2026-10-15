"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Загрузка фото и видео на Google Диск через сайт: файл режется на куски по 4 МБ,
 * поэтому проходят и большие видео с телефона. Можно выбрать несколько файлов сразу.
 */
export function MediaUploader({ orderId, returnId, label = "+ Фото или видео" }: { orderId: string; returnId?: string; label?: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ name: string; pct: number; n: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadOne(file: File, n: number, of: number) {
    const start = await fetch("/api/admin/inspection/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, returnId: returnId ?? null, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size }),
    }).then((r) => r.json());
    if (start.error) throw new Error(start.error);
    const chunk: number = start.chunk;
    for (let offset = 0; offset < file.size; offset += chunk) {
      const part = file.slice(offset, Math.min(file.size, offset + chunk));
      let res: { error?: string; done?: boolean } | null = null;
      // Мобильный интернет рвётся — каждый кусок пробуем до трёх раз
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`/api/admin/inspection/upload/${start.uploadId}?offset=${offset}`, { method: "PUT", body: part })
          .then((r) => r.json())
          .catch(() => ({ error: "Нет связи" }));
        if (!res?.error || !/связи/.test(res.error)) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (res?.error) throw new Error(res.error);
      setProgress({ name: file.name, pct: Math.round(((offset + part.size) / file.size) * 100), n, of });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files);
    try {
      for (let i = 0; i < list.length; i++) {
        setProgress({ name: list[i].name, pct: 0, n: i + 1, of: list.length });
        await uploadOne(list[i], i + 1, list.length);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить");
    }
    setProgress(null);
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {progress ? (
        <div className="meter">
          <div className="meter__row small">
            <span className="muted">
              Загружаем {progress.of > 1 ? `${progress.n} из ${progress.of}` : ""} на Google Диск…
            </span>
            <strong>{progress.pct}%</strong>
          </div>
          <div className="meter__bar">
            <div className="meter__fill" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      ) : (
        <label className="btn btn--line btn--sm" style={{ alignSelf: "flex-start" }}>
          {label}
          <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </label>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
