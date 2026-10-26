/** POST /api/banners/:id/click — счётчик переходов по баннеру (без личных данных) */
import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { metaFromHeaders } from "@/lib/request";

export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 204 });
  // Считаем только клики с нашего сайта
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 204 });
  const ip = metaFromHeaders(request.headers).ip ?? "?";
  if (!limiter(`${ip}:${id}`)) return new Response(null, { status: 204 });
  await db
    .update(s.banner)
    .set({ clicks: sql`${s.banner.clicks} + 1`, updatedAt: sql`${s.banner.updatedAt}` })
    .where(eq(s.banner.id, id))
    .catch(() => {});
  return new Response(null, { status: 204 });
}
