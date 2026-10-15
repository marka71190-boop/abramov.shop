import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authUrl, driveConfigured } from "@/lib/gdrive";
import { SITE } from "@/lib/site";
import { getViewer } from "@/lib/viewer";

/** Владелец нажал «Подключить Google Диск» — отправляем на страницу входа Google. */
export async function GET() {
  const me = await getViewer();
  if (!me || me.role !== "OWNER") return NextResponse.redirect(`${SITE.url}/admin`);
  if (!driveConfigured()) return NextResponse.redirect(`${SITE.url}/admin/settings?drive=noconfig`);
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("as_gdrive_state", state, { httpOnly: true, secure: SITE.url.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(authUrl(state));
}
