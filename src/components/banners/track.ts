import { goal } from "@/lib/track";

/** Клик по баннеру: счётчик в админке + цель в Метрике. Переход по ссылке не задерживаем */
export function trackBanner(id: string, title: string) {
  try {
    navigator.sendBeacon?.(`/api/banners/${encodeURIComponent(id)}/click`);
  } catch {}
  goal("banner_click", { banner: title || id });
}
