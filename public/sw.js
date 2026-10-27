/*
 * Abramov Shop — сервис-воркер приложения.
 * Кэширует только статику (скрипты, стили, шрифты, значки, фото товаров). Страницы не кэшируются:
 * в них бывают личные данные (заказы, адреса). Без сети показываем страницу «Нет соединения».
 * Принимает уведомления о заказах (Web Push).
 */
const VERSION = "v2";
const STATIC = `static-${VERSION}`;
const MEDIA = `media-${VERSION}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/icons/badge-96.png", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== MEDIA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (p) => p.startsWith("/_next/static/") || p.startsWith("/icons/") || p.startsWith("/images/") || p.startsWith("/fonts/") || p === "/icon.svg";

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") (await caches.open(name)).put(req, res.clone());
  return res;
}

/** Фото товаров: сразу из кэша, в фоне обновляем; храним не больше 300 */
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then(async (res) => {
      if (res.ok && res.type === "basic") {
        await cache.put(req, res.clone());
        const keys = await cache.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - 300))) await cache.delete(k);
      }
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return update;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE).then((r) => r || Response.error())));
    return;
  }
  if (isStatic(url.pathname)) {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  if (url.pathname.startsWith("/media/")) event.respondWith(staleWhileRevalidate(event, req));
});

// ---------- Уведомления ----------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Abramov Shop" };
  }
  const title = data.title || "Abramov Shop";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: typeof data.url === "string" ? data.url : "/" },
      lang: "ru",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = "/";
  try {
    const u = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/", self.location.origin);
    if (u.origin === self.location.origin) target = u.href;
  } catch {}
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          return c.focus().then((w) => (w && "navigate" in w ? w.navigate(target) : null));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Браузер сам обновил подписку — сообщаем сайту новую
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  const key = old && old.options ? old.options.applicationServerKey : null;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((sub) =>
        fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(sub.toJSON()) }),
      )
      .catch(() => {}),
  );
});
