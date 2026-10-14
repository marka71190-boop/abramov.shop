import { NextResponse, type NextRequest } from "next/server";
import { suggest } from "@/lib/catalog-search";
import { createRateLimiter } from "@/lib/rate-limit";
import { metaFromHeaders } from "@/lib/request";

const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

/** Подсказки для строки поиска в шапке. */
export async function GET(req: NextRequest) {
  if (!limiter(metaFromHeaders(req.headers).ip ?? "anon")) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const data = await suggest(q);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
