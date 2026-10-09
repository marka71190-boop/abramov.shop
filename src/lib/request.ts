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
