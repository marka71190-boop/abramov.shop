import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";

/** IP и браузер посетителя — для журнала согласий и журнала действий. */
export async function getRequestMeta() {
  const h = await headers();
  return metaFromHeaders(h);
}

/** Сколько прокси перед сайтом дописывают адрес в X-Forwarded-For (Timeweb — один). */
const PROXY_COUNT = Math.max(1, Math.trunc(Number(process.env.TRUSTED_PROXY_COUNT)) || 1);

/**
 * IP посетителя. Каждый прокси дописывает адрес того, кто к нему подключился, в конец X-Forwarded-For,
 * а начало списка присылает сам браузер — его можно подделать. Поэтому берём адрес, записанный
 * первым из наших прокси: N-й с конца.
 */
function clientIp(h: Headers) {
  const list = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const ip = list.length ? list[Math.max(0, list.length - PROXY_COUNT)] : h.get("x-real-ip")?.trim();
  return ip && isIP(ip) ? ip : null;
}

export function metaFromHeaders(h: Headers) {
  const userAgent = h.get("user-agent")?.slice(0, 500) || null;
  return { ip: clientIp(h), userAgent };
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
