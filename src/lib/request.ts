import "server-only";
import { headers } from "next/headers";

/** IP и браузер посетителя — для журнала согласий и журнала действий. */
export async function getRequestMeta() {
  const h = await headers();
  return metaFromHeaders(h);
}

export function metaFromHeaders(h: Headers) {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || null;
  const userAgent = h.get("user-agent")?.slice(0, 500) || null;
  return { ip, userAgent };
}

/**
 * Адрес сайта, с которого пришёл посетитель (abramov.shop или технический домен Timeweb).
 * Берём только из списка разрешённых — подставить чужой домен через заголовки нельзя.
 */
export async function getOrigin(fallback: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host) return fallback;
  const origin = `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
  const allowed = [fallback, process.env.BETTER_AUTH_URL, ...(process.env.TRUSTED_ORIGINS ?? "").split(",")]
    .map((o) => o?.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  return allowed.includes(origin) ? origin : fallback;
}
