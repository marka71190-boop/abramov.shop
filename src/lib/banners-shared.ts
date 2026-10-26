/** Баннеры — общее для сервера и браузера */

export type BannerPlace = "HOME" | "STRIP";

export interface PublicBanner {
  id: string;
  label: string;
  title: string;
  text: string;
  image: string | null;
  imageMobile: string | null;
  buttonText: string;
  url: string;
  tone: string;
  /** Конец показа (мс) — для отсчёта «до конца акции» */
  endsAt: number | null;
  countdown: boolean;
}

export const PLACE_LABEL: Record<BannerPlace, string> = { HOME: "Слайдер на главной", STRIP: "Полоса над шапкой" };

export const STRIP_TONES = { gold: "Золотая", dark: "Тёмная", red: "Красная" } as const;
export const SLIDE_TONES = { dark: "Светлый текст (тёмная картинка)", light: "Тёмный текст (светлая картинка)" } as const;

/** Ссылка баннера: адрес на сайте («/catalog») или https://… Остальное (javascript: и т. п.) отбрасываем */
export function safeUrl(v: string | null | undefined): string {
  const u = (v ?? "").trim();
  if (/^\/(?!\/)[^\s"<>\\]*$/.test(u)) return u;
  if (/^https:\/\/[^\s"<>\\]+$/i.test(u)) return u;
  return "";
}

export const isExternal = (url: string) => /^https:\/\//i.test(url) && !/^https:\/\/(www\.)?abramov\.shop(\/|$)/i.test(url);

/** «2 д 14 ч», «5 ч 20 мин», «12 мин» */
export function leftText(ms: number) {
  if (ms <= 0) return "";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${mm} мин`;
  return `${Math.max(1, mm)} мин`;
}

/** Cookie со скрытыми посетителем объявлениями полосы (id через точку), живёт неделю */
export const STRIP_COOKIE = "ab_strip_hidden";
