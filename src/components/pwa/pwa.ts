/** Приложение (PWA) в браузере: установка на экран и уведомления */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
declare global {
  interface Window {
    __abInstall?: InstallPrompt | null;
  }
}

export const INSTALL_EVENT = "ab-install-change";

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const installPrompt = () => (typeof window === "undefined" ? null : (window.__abInstall ?? null));

/** Показать системное окно «Установить приложение» (Android, компьютер). true — установили */
export async function promptInstall() {
  const p = installPrompt();
  if (!p) return false;
  await p.prompt();
  const r = await p.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  window.__abInstall = null;
  window.dispatchEvent(new Event(INSTALL_EVENT));
  return r.outcome === "accepted";
}

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function send(method: "POST" | "DELETE", body: unknown) {
  const r = await fetch("/api/push", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(j.error ?? "Не получилось");
}

/** Включить уведомления на этом устройстве */
export async function subscribePush(publicKey: string) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "Уведомления запрещены в настройках браузера" : "Нужно разрешить уведомления");
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Ключ сервера поменялся — старую подписку заменяем
  if (sub && sub.options?.applicationServerKey) {
    const a = new Uint8Array(sub.options.applicationServerKey);
    const b = keyBytes(publicKey);
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  } catch {
    throw new Error("Браузер не смог включить уведомления. Попробуйте ещё раз, в Chrome или Яндекс Браузере, или в установленном приложении");
  }
  await send("POST", sub.toJSON());
  return sub;
}

/** Выключить уведомления на этом устройстве */
export async function unsubscribePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await send("DELETE", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
