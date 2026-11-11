import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { passportUrl } from "@/lib/cue-passport";
import { requireAdmin } from "@/lib/viewer";

/** QR паспорта картинкой — вставить в приложение NIIMBOT или на гравировку */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const p = await db.query.cuePassport.findFirst({ where: eq(s.cuePassport.id, String(id).slice(0, 64)), columns: { code: true, serial: true } });
  if (!p) return new Response("Не найден", { status: 404 });
  const png = await QRCode.toBuffer(passportUrl(p.code), { type: "png", width: 600, margin: 2, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="passport-${p.serial}.png"`, "Cache-Control": "private, no-store" },
  });
}
