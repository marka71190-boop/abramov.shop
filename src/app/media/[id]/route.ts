/**
 * GET /media/:id — фото товара из базы. Адрес не меняется, поэтому кэшируем надолго.
 * GET /media/:id?f=jpg — то же фото в JPEG до 1200 px: для превью ссылок в Telegram, ВК и WhatsApp
 * (не все из них понимают WebP).
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, schema as s } from "@/db";

const jpgCache = new Map<string, Buffer>();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const wantJpg = new URL(req.url).searchParams.get("f") === "jpg";

  if (wantJpg && jpgCache.has(id)) return jpeg(jpgCache.get(id)!);
  const m = await db.query.media.findFirst({ where: eq(s.media.id, id) });
  if (!m) return new Response("Not found", { status: 404 });

  if (wantJpg) {
    const out = await sharp(m.data).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).flatten({ background: "#0a0a0a" }).jpeg({ quality: 85 }).toBuffer();
    if (jpgCache.size > 100) jpgCache.delete(jpgCache.keys().next().value!);
    jpgCache.set(id, out);
    return jpeg(out);
  }

  return new Response(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mime,
      "Content-Length": String(m.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function jpeg(buf: Buffer) {
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(buf.length), "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
