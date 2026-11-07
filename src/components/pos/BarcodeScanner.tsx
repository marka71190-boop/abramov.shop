"use client";
/**
 * Сканер штрихкодов камерой телефона. Android (Chrome) распознаёт сам, остальные — через zxing (wasm
 * со своего сайта, /zxing/zxing_reader.wasm). Сканирует подряд: навели — товар в чеке, можно следующий.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

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

export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => string | null; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ text: string; ok: boolean } | null>(null);
  const [ready, setReady] = useState(false);
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
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch {
        return setError("Нет доступа к камере. Разрешите камеру для сайта в настройках браузера и попробуйте ещё раз");
      }
      if (stop || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      let detector: Detector;
      try {
        detector = await makeDetector();
      } catch {
        return setError("Не получилось запустить распознавание — обновите страницу");
      }
      setReady(true);
      const tick = async () => {
        if (stop || !video.current) return;
        if (video.current.readyState >= 2) {
          const codes = await detector.detect(video.current).catch(() => []);
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
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span className="muted small">Наведите на штрихкод — товар добавится в чек. Ещё одна штука — уведите камеру и наведите снова.</span>
        <button type="button" className="btn btn--gold btn--sm" onClick={onClose}>
          Готово
        </button>
      </div>
    </div>
  );
}
