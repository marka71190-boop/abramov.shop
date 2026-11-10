"use client";
/**
 * QR бонусной карты: обновляется каждую минуту и при возвращении в приложение.
 * Пока карта на экране, телефон не гаснет (Wake Lock, где браузер умеет).
 */
import { useEffect, useState } from "react";
import { cardQrAction } from "./actions";

export function CardQr({ initial, balance: initialBalance }: { initial: string; balance: number }) {
  const [qr, setQr] = useState(initial);
  const [balance, setBalance] = useState(initialBalance);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const r = await cardQrAction();
        if (!alive) return;
        if (r.qr) {
          setQr(r.qr);
          setBalance(r.balance ?? 0);
          setOffline(false);
        }
      } catch {
        if (alive) setOffline(true);
      }
    };
    const t = setInterval(refresh, 60_000);
    const onShow = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onShow);

    // Экран не гаснет, пока кассир сканирует
    let lock: { release: () => Promise<void> } | null = null;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
      void lock?.release().catch(() => {});
    };
  }, []);

  return (
    <div className="bcard__qrwrap">
      <div className="bcard__qr" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label="QR-код бонусной карты" />
      <div className="bcard__bal">
        <b>{balance.toLocaleString("ru-RU")}</b> бонусов
      </div>
      {offline && <p className="small form-error">Нет интернета — код может не пройти. Назовите кассиру телефон.</p>}
    </div>
  );
}
