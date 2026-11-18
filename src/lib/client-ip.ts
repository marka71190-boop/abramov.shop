/**
 * IP посетителя из X-Forwarded-For. Каждый прокси дописывает адрес того, кто к нему подключился, в конец списка,
 * а начало списка присылает сам браузер — его можно подделать. Поэтому берём адрес, записанный первым из наших
 * прокси: N-й с конца (Timeweb — один прокси, TRUSTED_PROXY_COUNT=1).
 * Без node-зависимостей: используется и в proxy.ts.
 */
const V4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const V6 = /^[0-9a-f:]{2,39}(%\w+)?$/i;
export const looksLikeIp = (ip: string) => V4.test(ip) || (ip.includes(":") && V6.test(ip));

export function clientIpFrom(xff: string | null, realIp: string | null, proxyCount = 1) {
  const list = (xff ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const n = Math.max(1, Math.trunc(proxyCount) || 1);
  const ip = list.length ? list[Math.max(0, list.length - n)] : realIp?.trim();
  return ip && looksLikeIp(ip) ? ip : null;
}
