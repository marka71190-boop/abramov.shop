/** GET /api/delivery/points?city=435 — пункты выдачи СДЭК в городе. */
import { headers } from "next/headers";
import { cdekEnabled, getPickupPoints } from "@/lib/cdek";
import { createRateLimiter } from "@/lib/rate-limit";
import { metaFromHeaders } from "@/lib/request";

export const dynamic = "force-dynamic";
const limit = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: Request) {
  if (!cdekEnabled()) return Response.json({ ok: false, error: "СДЭК не подключён" }, { status: 503 });
  const { ip } = metaFromHeaders(await headers());
  if (!limit(ip ?? "?")) return Response.json({ ok: false, error: "Слишком часто" }, { status: 429 });
  const city = Number(new URL(request.url).searchParams.get("city"));
  if (!Number.isInteger(city) || city <= 0) return Response.json({ ok: false, error: "Не выбран город" }, { status: 400 });
  try {
    // Ключ Яндекс Карт — публичный (ограничен адресом сайта в кабинете разработчика), нужен браузеру для карты
    return Response.json({ ok: true, points: await getPickupPoints(city), mapKey: process.env.YANDEX_MAPS_KEY || null });
  } catch (e) {
    console.error("[cdek] points:", e);
    return Response.json({ ok: false, error: "СДЭК временно не отвечает" }, { status: 502 });
  }
}
