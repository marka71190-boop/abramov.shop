/** GET /feed/yandex.xml — товарный фид YML для Яндекса. Обновляется раз в час. */
import { yandexFeed } from "@/lib/feed";

export const dynamic = "force-dynamic"; // база недоступна при сборке; кэш — заголовком

export async function GET() {
  return new Response(await yandexFeed(), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
