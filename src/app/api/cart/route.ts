import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { getViewer } from "@/lib/viewer";

/**
 * Корзина вошедшего покупателя на сервере. Браузер присылает её при каждом изменении —
 * так корзина видна на всех устройствах, а магазин может напомнить о брошенной.
 */
const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
const Items = z
  .array(z.object({ variantId: z.string().min(1).max(64), qty: z.number().int().min(1).max(999) }))
  .max(50);

export async function GET() {
  const u = await getViewer();
  if (!u) return NextResponse.json({ items: [] }, { status: 401 });
  const row = await db.query.savedCart.findFirst({ where: eq(s.savedCart.userId, u.id) });
  return NextResponse.json({ items: row?.items ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  const u = await getViewer();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  if (!limiter(u.id)) return NextResponse.json({ ok: false }, { status: 429 });
  const p = Items.safeParse((await req.json().catch(() => null))?.items);
  if (!p.success) return NextResponse.json({ ok: false }, { status: 400 });
  const items = p.data;
  // Если состав не изменился — не трогаем время (иначе напоминание «откладывалось» бы при каждом заходе)
  await db
    .insert(s.savedCart)
    .values({ userId: u.id, items, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: s.savedCart.userId,
      set: {
        items,
        updatedAt: sql`case when ${s.savedCart.items} = ${JSON.stringify(items)}::jsonb then ${s.savedCart.updatedAt} else now() end`,
      },
    });
  return NextResponse.json({ ok: true });
}
