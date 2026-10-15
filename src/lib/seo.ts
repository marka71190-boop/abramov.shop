/** Помощники для превью ссылок (Open Graph) и разметки schema.org. */
import { SITE } from "@/lib/site";

export const DEFAULT_OG = { url: "/og.png", width: 1200, height: 630, alt: SITE.title };

type OgImage = { url: string; width?: number; height?: number; alt?: string };

/**
 * Open Graph страницы. Next.js не сливает openGraph с общим из layout, а заменяет целиком —
 * поэтому название магазина, язык и картинку по умолчанию добавляем здесь.
 */
export function og(o: { url: string; title: string; description?: string; images?: OgImage[] }) {
  return {
    type: "website" as const,
    siteName: SITE.name,
    locale: SITE.locale,
    url: o.url,
    title: o.title,
    description: o.description,
    images: o.images?.length ? o.images : [DEFAULT_OG],
  };
}

/**
 * Абсолютная ссылка на картинку для превью. Фото из базы (/media/…) отдаём в JPEG —
 * Telegram, ВК и WhatsApp надёжно показывают только JPEG и PNG.
 */
export function shareImage(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/media/")) return `${SITE.url}${url}?f=jpg`;
  return url.startsWith("/") ? `${SITE.url}${url}` : url;
}

/** Описание для превью: первые ~160 символов текста без разметки. */
export function snippet(text: string | null | undefined, fallback: string) {
  const t = (text ?? "")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return fallback;
  return t.length > 160 ? `${t.slice(0, 157).replace(/\s+\S*$/, "")}…` : t;
}

export function breadcrumbs(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE.url}${it.url}` })),
  };
}

export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
