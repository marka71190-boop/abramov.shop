import { NextResponse, type NextRequest } from "next/server";
import { checkUnsubscribe, unsubscribe } from "@/lib/campaigns";
import { metaFromHeaders } from "@/lib/request";
import { SITE } from "@/lib/site";

/**
 * Отписка «в один клик» из почтового клиента (кнопка «Отписаться» в Gmail, Яндекс Почте):
 * заголовки List-Unsubscribe и List-Unsubscribe-Post (RFC 8058). Почтовик шлёт сюда POST.
 */
export async function POST(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  const t = req.nextUrl.searchParams.get("t");
  if (!checkUnsubscribe(u, t)) return NextResponse.json({ ok: false }, { status: 400 });
  await unsubscribe(u!, metaFromHeaders(req.headers).ip);
  return NextResponse.json({ ok: true });
}

/** Если ссылку открыли в браузере — показываем страницу с кнопкой подтверждения. */
export async function GET(req: NextRequest) {
  // Адрес сайта берём из настроек: за прокси Timeweb внутренний адрес запроса другой
  return NextResponse.redirect(`${SITE.url}/unsubscribe${req.nextUrl.search}`);
}
