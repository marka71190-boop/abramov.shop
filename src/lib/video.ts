/** Видео в карточке товара: ссылка VK Видео / Rutube / YouTube → адрес плеера для встраивания. Общий для сервера и браузера. */

export type VideoProvider = "vk" | "rutube" | "youtube";

export interface VideoEmbed {
  provider: VideoProvider;
  /** Адрес плеера (iframe), автозапуск после клика по обложке */
  src: string;
}

export const PROVIDER_NAME: Record<VideoProvider, string> = { vk: "VK Видео", rutube: "Rutube", youtube: "YouTube" };

export function parseVideo(raw: string): VideoEmbed | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, "");

  // VK: vk.com/video-123_456, vkvideo.ru/video-123_456, vk.com/video_ext.php?oid=-123&id=456&hash=…
  if (host === "vk.com" || host === "vkvideo.ru" || host === "vk.ru") {
    if (u.pathname.endsWith("/video_ext.php")) {
      const oid = u.searchParams.get("oid");
      const id = u.searchParams.get("id");
      if (!oid || !id || !/^-?\d+$/.test(oid) || !/^\d+$/.test(id)) return null;
      const hash = u.searchParams.get("hash");
      return { provider: "vk", src: vkSrc(oid, id, hash) };
    }
    const m = (u.pathname + "?" + u.searchParams.get("z")).match(/video(-?\d+)_(\d+)/);
    if (!m) return null;
    return { provider: "vk", src: vkSrc(m[1], m[2], null) };
  }

  // Rutube: rutube.ru/video/<32 hex>/, rutube.ru/shorts/<id>/, rutube.ru/play/embed/<id>
  if (host === "rutube.ru") {
    const m = u.pathname.match(/^\/(?:video|shorts|play\/embed)\/([0-9a-f]{32})/i);
    if (!m) return null;
    return { provider: "rutube", src: `https://rutube.ru/play/embed/${m[1]}?autoplay=1` };
  }

  // YouTube: youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID. Плеер без cookies
  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    yt = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
  }
  if (yt && /^[\w-]{11}$/.test(yt)) {
    return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0` };
  }
  return null;
}

function vkSrc(oid: string, id: string, hash: string | null) {
  const q = new URLSearchParams({ oid, id, hd: "2", autoplay: "1" });
  if (hash && /^[\w-]+$/.test(hash)) q.set("hash", hash);
  return `https://vkvideo.ru/video_ext.php?${q}`;
}

/** Строки из формы админки: «ссылка | подпись» по одной в строке */
export function parseVideoLines(text: string): { videos: { url: string; title: string }[]; errors: string[] } {
  const videos: { url: string; title: string }[] = [];
  const errors: string[] = [];
  for (const line of text.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 10)) {
    const [url, ...rest] = line.split("|");
    if (!parseVideo(url)) errors.push(url.trim().slice(0, 60));
    else videos.push({ url: url.trim().slice(0, 500), title: rest.join("|").trim().slice(0, 120) });
  }
  return { videos, errors };
}
