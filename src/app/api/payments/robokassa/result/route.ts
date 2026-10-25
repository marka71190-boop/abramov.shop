/**
 * Result URL Робокассы — уведомление об оплате. Подпись проверяем Паролем #2,
 * отвечаем «OK<InvId>», иначе Робокасса считает уведомление недоставленным.
 */
import { applyRobokassaPaid } from "@/lib/orders";
import { checkResult, robokassaEnabled, toKop } from "@/lib/robokassa";
import { rkParams } from "../_lib";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!robokassaEnabled()) return new Response("disabled", { status: 503 });
  const p = await rkParams(req);
  const sum = p.get("OutSum") ?? "";
  const inv = p.get("InvId") ?? "";
  const sig = p.get("SignatureValue") ?? "";
  if (!/^\d+$/.test(inv) || !sum || !checkResult(sum, inv, sig)) {
    console.error("[robokassa] неверная подпись уведомления", inv);
    return new Response("bad sign", { status: 400 });
  }
  const orderId = await applyRobokassaPaid(inv, toKop(sum), "robokassa");
  if (!orderId) {
    console.error("[robokassa] счёт не найден", inv);
    return new Response("bad invoice", { status: 404 });
  }
  return new Response(`OK${inv}`, { headers: { "Content-Type": "text/plain" } });
}

export const POST = handle;
export const GET = handle;
