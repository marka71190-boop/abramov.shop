import { NextResponse, type NextRequest } from "next/server";
import { clientIpFrom } from "@/lib/client-ip";

/**
 * Первый слой защиты — каждый запрос к страницам и API проходит здесь:
 *  • сканеры уязвимостей: пути вроде /.env, /wp-admin, *.php — сразу 404, без работы сайта;
 *  • «отмычки» к серверным действиям (заголовок Next-Action с мусором) — 400 до того, как их разберёт Next.js;
 *  • надёжный IP посетителя в заголовке x-client-ip (из него считает попытки входа Better Auth) —
 *    присланный браузером x-client-ip всегда перезаписывается;
 *  • путь админки в x-admin-path — по нему проверяются разделы, открытые менеджеру.
 */
const PROXIES = Number(process.env.TRUSTED_PROXY_COUNT) || 1;

// Чего на сайте нет и не будет: ищут чужие движки, бэкапы и ключи
const JUNK =
  /(^|\/)(\.env|\.git|\.svn|\.hg|\.DS_Store|\.aws|\.ssh|\.vscode|\.idea|wp-admin|wp-login|wp-content|wp-includes|xmlrpc|phpmyadmin|pma|adminer|cgi-bin|vendor\/phpunit|server-status|actuator|HNAP1|boaform|owa|ecp|autodiscover)(\/|$|\.)|\.(php\d?|asp|aspx|jsp|cgi|env|ini|bak|sql|sqlite|tar|tgz|gz|zip|rar|7z|log|yml|yaml|pem|key)$/i;

// Идентификатор серверного действия Next.js — 40–64 шестнадцатеричных знака
const ACTION_ID = /^[0-9a-f]{40,64}$/i;

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (JUNK.test(path)) return new NextResponse(null, { status: 404 });

  const action = request.headers.get("next-action");
  if (action !== null && (request.method !== "POST" || !ACTION_ID.test(action))) {
    return new NextResponse(null, { status: 400 });
  }

  const headers = new Headers(request.headers);
  const ip = clientIpFrom(request.headers.get("x-forwarded-for"), request.headers.get("x-real-ip"), PROXIES);
  if (ip) headers.set("x-client-ip", ip);
  else headers.delete("x-client-ip");
  headers.set("x-admin-path", path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Всё, кроме статики Next.js и картинок товаров (их много, и они не опасны)
  matcher: ["/((?!_next/static|_next/image|media/|favicon\\.ico|splash/|zxing/).*)"],
};
