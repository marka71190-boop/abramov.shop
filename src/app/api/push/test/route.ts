/** POST /api/push/test — пробное уведомление на свои устройства */
import { pushToUser } from "@/lib/push";
import { createRateLimiter } from "@/lib/rate-limit";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });

export async function POST(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return Response.json({ error: "Нет доступа" }, { status: 403 });
  const me = await getViewer();
  if (!me) return Response.json({ error: "Войдите в аккаунт" }, { status: 401 });
  if (!limiter(me.id)) return Response.json({ error: "Слишком часто — попробуйте через несколько минут" }, { status: 429 });
  const sent = await pushToUser(me.id, { title: "Уведомления работают", body: "Сюда придут оплата, трек-номер и готовность заказа.", url: "/account", tag: "test" });
  return Response.json({ sent });
}
