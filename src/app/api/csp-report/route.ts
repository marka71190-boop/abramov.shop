/**
 * POST /api/csp-report — браузеры присылают сюда нарушения политики безопасности (CSP).
 * Пишем в лог коротко и не чаще раза в час на каждое уникальное нарушение — чтобы видеть, что ещё
 * нужно разрешить, прежде чем включать строгий список скриптов.
 */
import { createRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const perIp = createRateLimiter({ limit: 30, windowMs: 60_000 });
const seen = new Map<string, number>();

const host = (u: unknown) => {
  const s = String(u ?? "");
  if (!s || ["inline", "eval", "data", "blob", "self", "wasm-eval"].includes(s)) return s || "—";
  try {
    return new URL(s).host || s.slice(0, 60);
  } catch {
    return s.slice(0, 60);
  }
};

export async function POST(req: Request) {
  const ip = req.headers.get("x-client-ip") ?? "?";
  if (!perIp(ip)) return new Response(null, { status: 204 });
  const text = (await req.text().catch(() => "")).slice(0, 20_000);
  let reports: Record<string, unknown>[] = [];
  try {
    const j = JSON.parse(text) as unknown;
    reports = Array.isArray(j)
      ? (j as { body?: Record<string, unknown> }[]).map((x) => x.body ?? {})
      : [((j as { "csp-report"?: Record<string, unknown> })["csp-report"] ?? {}) as Record<string, unknown>];
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const r of reports.slice(0, 10)) {
    const directive = String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "?").split(" ")[0];
    const blocked = host(r["blocked-uri"] ?? r.blockedURL);
    const page = (() => {
      try {
        return new URL(String(r["document-uri"] ?? r.documentURL ?? "")).pathname.slice(0, 80);
      } catch {
        return "?";
      }
    })();
    const key = `${directive} ${blocked}`;
    if ((seen.get(key) ?? 0) > Date.now() - 3600_000) continue;
    seen.set(key, Date.now());
    if (seen.size > 500) seen.clear();
    console.warn(`[csp] ${directive} ← ${blocked} на ${page}`);
  }
  return new Response(null, { status: 204 });
}
