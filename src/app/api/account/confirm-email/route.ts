/** GET /api/account/confirm-email?token=… — ссылка из письма «Подтвердите почту» для аккаунта без почты. */
import { NextResponse, type NextRequest } from "next/server";
import { confirmEmailChange } from "@/lib/email-change";
import { SITE } from "@/lib/site";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  // Почту записываем только в аккаунт, который её запросил: нужно войти в него
  const me = await getViewer();
  if (!me) return NextResponse.redirect(`${SITE.url}/login?next=${encodeURIComponent(`/api/account/confirm-email?token=${token}`)}`);
  const error = await confirmEmailChange(token, me.id);
  return NextResponse.redirect(`${SITE.url}/account?verified=1${error ? `&error=${error}` : ""}`);
}
