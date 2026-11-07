"use client";
/**
 * Сканер штрихкодов камерой телефона. Android (Chrome) распознаёт сам, остальные — через zxing (wasm
 * со своего сайта, /zxing/zxing_reader.wasm). Сканирует подряд: навели — товар в чеке, можно следующий.
 *
 * iPhone: камера не фокусируется ближе 15–20 см, а на таком расстоянии маленькая этикетка (5×3 см) в кадре
 * 1280×720 слишком мелкая — штрихкод не читается. Поэтому берём Full HD, приближение ×2 (если камера даёт)
 * и кнопку «Сфотографировать»: обычное фото в полном разрешении читается почти всегда.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Detector = { detect: (src: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<{ rawValue: string }[]> };

const FORMATS = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "qr_code"];

async function makeDetector(): Promise<Detector> {
  const native = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (native?.getSupportedFormats) {
    const supported = await native.getSupportedFormats().catch(() => [] as string[]);
    if (supported.includes("code_128")) return new native({ formats: FORMATS.filter((f) => supported.includes(f)) });
  }
  const m = await import("barcode-detector/ponyfill");
  m.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/zxing/${path}` : prefix + path) } });
  return new m.BarcodeDetector({ formats: FORMATS as never[] }) as unknown as Detector;
}

/** Короткий сигнал и вибрация: товар добавлен (или нет) */
function signal(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 60 : [40, 60, 40]);
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1200 : 300;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
    o.onended = () => ctx.close();
  } catch {}
}

/** Фото с камеры → холст не больше 2400 px по длинной стороне (12 Мп iPhone распознаётся долго) */
async function photoCanvas(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type ZoomTrack = Omit<MediaStreamTrack, "getCapabilities"> & { getCapabilities?: () => { zoom?: { min: number; max: number } } };

export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => string | null; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ text: string; ok: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState<{ track: ZoomTrack; max: number; value: number } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const detectorRef = useRef<Promise<Detector> | null>(null);
  const getDetector = () => (detectorRef.current ??= makeDetector());
  const seen = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const handler = useRef(onCode);
  handler.current = onCode;

  const handle = useCallback((code: string) => {
    // Камера держит тот же штрихкод — не добавляем повторно. Ещё одну штуку — уведите камеру и наведите снова
    const now = Date.now();
    const same = seen.current.code === code && now - seen.current.at < 1200;
    seen.current = { code, at: now };
    if (same) return;
    const name = handler.current(code);
    signal(!!name);
    setLast(name ? { text: `+ ${name}`, ok: true } : { text: `Не нашли товар с кодом ${code}`, ok: false });
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setError("Камера недоступна в этом браузере — введите артикул вручную");
      try {
        // Full HD: на 720p этикетку 5×3 см приходится подносить ближе, чем камера умеет фокусироваться
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch {
        return setError("Нет доступа к камере. Разрешите камеру для сайта в настройках браузера и попробуйте ещё раз");
      }
      if (stop || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      // Приближение ×2, если камера умеет: штрихкод крупнее, а держать можно на расстоянии фокуса
      const track = stream.getVideoTracks()[0] as unknown as ZoomTrack | undefined;
      const zc = track?.getCapabilities?.().zoom;
      if (track && zc && zc.max >= 1.5) {
        const value = Math.min(2, zc.max);
        await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => {});
        setZoom({ track, max: Math.min(zc.max, 4), value });
      }
      let detector: Detector;
      try {
        detector = await getDetector();
      } catch {
        return setError("Не получилось запустить распознавание — обновите страницу");
      }
      setReady(true);
      let fails = 0;
      const tick = async () => {
        if (stop || !video.current) return;
        if (video.current.readyState >= 2) {
          const codes = await detector.detect(video.current).catch(() => {
            fails++;
            return [];
          });
          if (fails >= 5) return setError("Распознавание не запустилось — обновите страницу или сфотографируйте штрихкод кнопкой ниже");
          const code = codes.find((c) => c.rawValue?.trim())?.rawValue.trim();
          if (code) handle(code);
        }
        timer = setTimeout(tick, 200);
      };
      tick();
    })();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [handle]);

  const setZoomTo = (value: number) => {
    if (!zoom) return;
    void zoom.track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => {});
    setZoom({ ...zoom, value });
  };

  /** Обычное фото: полное разрешение и автофокус камеры телефона — читается даже мелкий штрихкод */
  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const [detector, canvas] = await Promise.all([getDetector(), photoCanvas(file)]);
      const codes = await detector.detect(canvas);
      const code = codes.find((c) => c.rawValue?.trim())?.rawValue.trim();
      if (code) {
        seen.current = { code: "", at: 0 }; // фото — осознанное действие: тот же товар можно добавить ещё раз
        handle(code);
      } else {
        signal(false);
        setLast({ text: "На фото не нашли штрихкод — снимите ближе, чтобы он был по всей ширине кадра и в фокусе", ok: false });
      }
    } catch {
      setLast({ text: "Не получилось прочитать фото — попробуйте ещё раз", ok: false });
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="scanner" role="dialog" aria-label="Сканер штрихкодов">
      <div className="scanner__view">
        <video ref={video} playsInline muted />
        <div className="scanner__frame" aria-hidden />
        {!ready && !error && <div className="scanner__hint">Включаем камеру…</div>}
      </div>
      {error && <div className="form-error">{error}</div>}
      {last && (
        <div className={last.ok ? "form-ok" : "form-error"} role="status">
          {last.text}
        </div>
      )}
      {zoom && (
        <div className="row" style={{ gap: 6 }} role="group" aria-label="Приближение">
          {[1, 2, 3].filter((z) => z <= zoom.max + 0.01).map((z) => (
            <button key={z} type="button" className={`btn btn--sm ${Math.abs(zoom.value - z) < 0.1 ? "btn--gold" : "btn--line"}`} onClick={() => setZoomTo(z)}>
              ×{z}
            </button>
          ))}
        </div>
      )}
      <span className="muted small">
        Держите телефон в 15–20 см, штрихкод — поперёк рамки, при хорошем свете. Ещё одна штука — уведите камеру и наведите снова. Не ловит — нажмите
        «Сфотографировать».
      </span>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label className={`btn btn--line btn--sm${photoBusy ? " is-busy" : ""}`} style={{ cursor: "pointer" }}>
          {photoBusy ? "Читаем фото…" : "Сфотографировать"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            disabled={photoBusy}
            onChange={(e) => {
              void fromPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className="btn btn--gold btn--sm" onClick={onClose}>
          Готово
        </button>
      </div>
    </div>
  );
}
