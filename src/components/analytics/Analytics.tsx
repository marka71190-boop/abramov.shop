"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export const CONSENT_KEY = "as_cookies"; // "all" — можно аналитику, "necessary" — только необходимые
export const CONSENT_EVENT = "as-cookies";

export function readConsent(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

/**
 * Страницы, открытые по секретной ссылке из письма (сброс пароля, отписка, подарочный сертификат):
 * сами по себе Метрику не запускаем, чтобы ссылка с ключом не попала в статистику.
 */
const SECRET_PAGE = /^\/(reset-password|unsubscribe|gift\/[^/]+)\/?$/;
const SECRET_PARAMS = ["token", "t", "u", "preview", "code"];

/** Адрес для Метрики — без ключей доступа и без кода сертификата. */
export function safeUrl(href: string) {
  try {
    const u = new URL(href);
    if (/^\/gift\/[^/]+/.test(u.pathname)) u.pathname = "/gift/certificate";
    for (const k of SECRET_PARAMS) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return "";
  }
}

function loadMetrika(id: number) {
  if (window.__ymId) return;
  window.__ymId = id;
  window.dataLayer = window.dataLayer || [];
  const w = window as unknown as { ym: { (...a: unknown[]): void; a?: unknown[]; l?: number } };
  w.ym =
    w.ym ||
    Object.assign(
      function (...args: unknown[]) {
        (w.ym.a = w.ym.a || []).push(args);
      },
      { l: Date.now() },
    );
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://mc.yandex.ru/metrika/tag.js";
  document.head.appendChild(s);
  w.ym(id, "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
    ecommerce: "dataLayer",
    defer: true, // просмотры отправляем сами — сайт открывает страницы без перезагрузки
  });
}

/** Яндекс Метрика — загружается только после согласия посетителя на аналитические cookie. */
export function Analytics({ metrikaId }: { metrikaId: number | null }) {
  const [allowed, setAllowed] = useState(false);
  const path = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const check = () => setAllowed(readConsent() === "all");
    check();
    window.addEventListener(CONSENT_EVENT, check);
    return () => window.removeEventListener(CONSENT_EVENT, check);
  }, []);

  useEffect(() => {
    if (allowed && metrikaId && !SECRET_PAGE.test(window.location.pathname)) loadMetrika(metrikaId);
  }, [allowed, metrikaId, path]);

  useEffect(() => {
    if (!allowed || !metrikaId || !window.ym) return;
    if (SECRET_PAGE.test(window.location.pathname)) return;
    window.ym(metrikaId, "hit", safeUrl(window.location.href), { referer: safeUrl(document.referrer), title: document.title });
  }, [allowed, metrikaId, path, search]);

  return null;
}
