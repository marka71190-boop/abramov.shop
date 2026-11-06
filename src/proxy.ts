import { NextResponse, type NextRequest } from "next/server";

/**
 * Передаёт странице путь, который открыли: по нему админка проверяет,
 * открыт ли этот раздел менеджеру (владелец выбирает разделы в карточке сотрудника).
 * Заголовок от браузера всегда перезаписывается — подставить чужой путь нельзя.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-admin-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/club", "/club/:path*"],
};
