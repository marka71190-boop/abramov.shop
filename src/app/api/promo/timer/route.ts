/** GET /api/promo/timer?code=… — для плашки с обратным отсчётом: что даёт промокод и до какого момента он действует. */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema as s } from "@/db";
import { promoHeadline } from "@/lib/campaigns";
import { personalDeadline } from "@/lib/promo-timer";
import { createRateLimiter } from "@/lib/rate-limit";
import { metaFromHeaders } from "@/lib/request";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
const limit = createRateLimiter({ limit: 30, windowMs: 60_000 });
const no = () => Response.json({ ok: false }, { headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const { ip } = metaFromHeaders(await headers());
  if (!limit(ip ?? "?")) return no();
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-ZА-ЯЁ0-9_-]{3,30}$/.test(code)) return no();
  const p = await db.query.promoCode.findFirst({ where: eq(s.promoCode.code, code) });
  const now = new Date();
  if (!p || !p.isActive || (p.startsAt && p.startsAt > now) || (p.endsAt && p.endsAt < now) || (p.maxUses != null && p.usedCount >= p.maxUses)) return no();

  let endsAt = p.endsAt;
  let needLogin = false;
  if (p.personalHours) {
    const viewer = await getViewer();
    if (!viewer) needLogin = true;
    else {
      const until = await personalDeadline(p, viewer.id);
      if (!until || until < now) return no();
      endsAt = endsAt && endsAt < until ? endsAt : until;
    }
  }
  return Response.json(
    { ok: true, code: p.code, headline: promoHeadline(p), endsAt: endsAt?.toISOString() ?? null, needLogin },
    { headers: { "Cache-Control": "no-store" } },
  );
}
