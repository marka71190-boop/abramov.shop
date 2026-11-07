/**
 * GET /media/:id — фото товара из базы. Адрес не меняется, поэтому кэшируем надолго.
 * GET /media/:id?f=jpg — то же фото в JPEG до 1200 px: для превью ссылок в Telegram, ВК и WhatsApp
 * (не все из них понимают WebP).
 * GET /media/:id?w=320 — WebP нужной ширины (160, 320, 640, 1200): карточкам и превью не нужно фото целиком.
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, schema as s } from "@/db";
import { IMG_WIDTHS } from "@/lib/img";

const jpgCache = new Map<string, Buffer>();

// Уменьшенные копии — в памяти, не больше ~64 МБ: старые вытесняются первыми
const small = new Map<string, Buffer>();
let smallBytes = 0;
const SMALL_MAX = 64 * 1024 * 1024;
function remember(key: string, buf: Buffer) {
  small.set(key, buf);
  smallBytes += buf.length;
  while (smallBytes > SMALL_MAX && small.size > 1) {
    const [k, v] = small.entries().next().value!;
    small.delete(k);
    smallBytes -= v.length;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const wantJpg = sp.get("f") === "jpg";
  const w = Number(sp.get("w")) || 0;
  const width = (IMG_WIDTHS as readonly number[]).includes(w) ? w : 0;

  if (width) {
    const key = `${id}:${width}`;
    const hit = small.get(key);
    if (hit) {
      small.delete(key);
      small.set(key, hit); // свежий — в конец очереди
      return webp(hit);
    }
    const m = await db.query.media.findFirst({ where: eq(s.media.id, id) });
    if (!m) return new Response("Not found", { status: 404 });
    // Фото и так не шире — отдаём оригинал, не пережимая
    if (m.width && m.width <= width && m.mime === "image/webp") return original(m);
    const out = await sharp(m.data).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    remember(key, out);
    return webp(out);
  }

  if (wantJpg && jpgCache.has(id)) return jpeg(jpgCache.get(id)!);
  const m = await db.query.media.findFirst({ where: eq(s.media.id, id) });
  if (!m) return new Response("Not found", { status: 404 });

  if (wantJpg) {
    const out = await sharp(m.data).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).flatten({ background: "#0a0a0a" }).jpeg({ quality: 85 }).toBuffer();
    if (jpgCache.size > 100) jpgCache.delete(jpgCache.keys().next().value!);
    jpgCache.set(id, out);
    return jpeg(out);
  }

  return original(m);
}

function original(m: { data: Buffer; mime: string; size: number }) {
  return new Response(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mime,
      "Content-Length": String(m.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function webp(buf: Buffer) {
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/webp", "Content-Length": String(buf.length), "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

function jpeg(buf: Buffer) {
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(buf.length), "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
