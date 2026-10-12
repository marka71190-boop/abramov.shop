/** POST /api/telegram/webhook — сообщения боту. Адрес регистрируется сам при старте сайта. */
import { handleUpdate, telegramEnabled, webhookSecret } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!telegramEnabled()) return new Response("off", { status: 404 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) return new Response("forbidden", { status: 403 });
  try {
    await handleUpdate(await request.json());
  } catch (e) {
    console.error("[telegram] webhook:", e instanceof Error ? e.message : e);
  }
  // Всегда 200, иначе Telegram будет повторять одно и то же сообщение
  return Response.json({ ok: true });
}
