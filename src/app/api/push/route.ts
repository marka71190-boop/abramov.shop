/**
 * POST /api/push — включить уведомления на этом устройстве (подписка браузера),
 * DELETE /api/push — выключить. Только для вошедших и только с нашего сайта.
 */
import { and, asc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { allowedEndpoint, pushEnabled } from "@/lib/push";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const Sub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

function sameSite(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin";
}

/** «Android · Chrome» — без версий и прочих подробностей */
function device(ua: string) {
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /YaBrowser/.test(ua) ? "Яндекс Браузер" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [os, br].filter(Boolean).join(" · ");
}

export async function POST(req: Request) {
  if (!sameSite(req)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  if (!pushEnabled()) return Response.json({ error: "Уведомления пока не настроены" }, { status: 503 });
  const me = await getViewer();
  if (!me) return Response.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const p = Sub.safeParse(await req.json().catch(() => null));
  if (!p.success || !allowedEndpoint(p.data.endpoint)) return Response.json({ error: "Браузер прислал неверную подписку" }, { status: 400 });
  const { endpoint, keys } = p.data;
  const dev = device(req.headers.get("user-agent") ?? "");
  await db
    .insert(s.pushSubscription)
    .values({ userId: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, device: dev })
    .onConflictDoUpdate({ target: s.pushSubscription.endpoint, set: { userId: me.id, p256dh: keys.p256dh, auth: keys.auth, device: dev, failures: 0 } });
  // Не больше 10 устройств на человека: старые убираем
  const mine = await db
    .select({ id: s.pushSubscription.id })
    .from(s.pushSubscription)
    .where(eq(s.pushSubscription.userId, me.id))
    .orderBy(asc(s.pushSubscription.createdAt));
  if (mine.length > 10) {
    const keep = mine.slice(-10).map((x) => x.id);
    await db.delete(s.pushSubscription).where(and(eq(s.pushSubscription.userId, me.id), notInArray(s.pushSubscription.id, keep)));
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sameSite(req)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  const me = await getViewer();
  if (!me) return Response.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.slice(0, 1000) : "";
  if (endpoint) await db.delete(s.pushSubscription).where(and(eq(s.pushSubscription.userId, me.id), eq(s.pushSubscription.endpoint, endpoint)));
  return Response.json({ ok: true });
}
