/** GET /api/delivery/cities?q=Красн&country=BY — подсказки городов СДЭК (страна — из списка СДЭК в настройках). */
import { headers } from "next/headers";
import { cdekEnabled, findCities } from "@/lib/cdek";
import { createRateLimiter } from "@/lib/rate-limit";
import { metaFromHeaders } from "@/lib/request";
import { cdekCountries } from "@/lib/foreign";

export const dynamic = "force-dynamic";
const limit = createRateLimiter({ limit: 60, windowMs: 60_000 });

export async function GET(request: Request) {
  if (!cdekEnabled()) return Response.json({ ok: false, error: "СДЭК не подключён" }, { status: 503 });
  const { ip } = metaFromHeaders(await headers());
  if (!limit(ip ?? "?")) return Response.json({ ok: false, error: "Слишком часто" }, { status: 429 });
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ ok: true, cities: [] });
  const c = (new URL(request.url).searchParams.get("country") ?? "RU").toUpperCase();
  const country = c === "RU" || (await cdekCountries()).some((x) => x.code === c) ? c : null;
  if (!country) return Response.json({ ok: false, error: "СДЭК не возит в эту страну" }, { status: 400 });
  try {
    return Response.json({ ok: true, cities: await findCities(q.slice(0, 60), country) });
  } catch (e) {
    console.error("[cdek] cities:", e);
    return Response.json({ ok: false, error: "СДЭК временно не отвечает" }, { status: 502 });
  }
}
