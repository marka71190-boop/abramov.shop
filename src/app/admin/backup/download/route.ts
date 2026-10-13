/** GET /admin/backup/download?media=1 — скачать резервную копию (только владелец). */
import { audit } from "@/lib/audit";
import { createBackup } from "@/lib/backup";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const me = await getViewer();
  if (me?.role !== "OWNER") return new Response("Нет доступа", { status: 403 });
  const withMedia = new URL(request.url).searchParams.get("media") === "1";
  const { gz, counts } = await createBackup({ withMedia });
  await audit(me.id, "backup.download", "backup", null, { withMedia, counts });
  const stamp = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new Response(new Uint8Array(gz), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="abramov-shop-backup-${stamp}${withMedia ? "-photos" : ""}.json.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
