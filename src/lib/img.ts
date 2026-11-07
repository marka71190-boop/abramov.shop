/**
 * Фото из базы (/media/:id) в нужном размере: /media/:id?w=320 — WebP шириной 320 px.
 * Карточке в каталоге не нужно фото 1600 px — на телефоне это в 5–10 раз меньше трафика.
 * Чужие адреса и статика из /public возвращаются как есть.
 */
export const IMG_WIDTHS = [160, 320, 640, 1200] as const;
export type ImgWidth = (typeof IMG_WIDTHS)[number];

const MEDIA = /^\/media\/[0-9a-f-]{36}$/;

export function sized(url: string, w: ImgWidth): string;
export function sized(url: string | null | undefined, w: ImgWidth): string | undefined;
export function sized(url: string | null | undefined, w: ImgWidth) {
  if (!url) return undefined;
  return MEDIA.test(url) ? `${url}?w=${w}` : url;
}

/** srcSet для <img>: браузер сам выберет размер под экран */
export function srcSetFor(url: string | null | undefined, widths: ImgWidth[]) {
  if (!url || !MEDIA.test(url)) return undefined;
  return widths.map((w) => `${url}?w=${w} ${w}w`).join(", ");
}
