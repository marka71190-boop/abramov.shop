import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { finishConnect } from "@/lib/gdrive";
import { SITE } from "@/lib/site";
import { getViewer } from "@/lib/viewer";

/** Google вернул владельца с кодом доступа: сохраняем доступ к Диску и создаём папку магазина. */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${SITE.url}/admin/settings?drive=${q}`);
  const me = await getViewer();
  if (!me || me.role !== "OWNER") return NextResponse.redirect(`${SITE.url}/admin`);
  const jar = await cookies();
  const state = jar.get("as_gdrive_state")?.value;
  jar.delete("as_gdrive_state");
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("denied");
  if (!state || p.get("state") !== state || !p.get("code")) return back("badstate");
  try {
    const email = await finishConnect(p.get("code")!);
    await audit(me.id, "drive.connect", "setting", "google_drive", { email });
    return back("ok");
  } catch (e) {
    console.error("[gdrive] connect:", e instanceof Error ? e.message : e);
    return back("error");
  }
}
