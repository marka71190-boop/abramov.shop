import "server-only";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";

const cache = new Map<string, { w: number; h: number } | null>();

/** Размеры фото — чтобы галерея сразу имела правильную форму (квадрат, вертикаль…) без прыжков. */
export async function imageDims(urls: string[]) {
  const out = new Map<string, { w: number; h: number }>();
  const mediaIds = urls.map((u) => u.match(/^\/media\/([0-9a-f-]{36})$/)?.[1]).filter((x): x is string => !!x);
  if (mediaIds.length) {
    const rows = await db.select({ id: s.media.id, w: s.media.width, h: s.media.height }).from(s.media).where(inArray(s.media.id, mediaIds));
    for (const r of rows) if (r.w && r.h) out.set(`/media/${r.id}`, { w: r.w, h: r.h });
  }
  for (const u of urls) {
    if (out.has(u) || !u.startsWith("/") || u.startsWith("/media/")) continue;
    if (!cache.has(u)) {
      try {
        const sharp = (await import("sharp")).default;
        const m = await sharp(path.join(process.cwd(), "public", decodeURIComponent(u.split("?")[0]))).metadata();
        cache.set(u, m.width && m.height ? { w: m.width, h: m.height } : null);
      } catch {
        cache.set(u, null);
      }
    }
    const d = cache.get(u);
    if (d) out.set(u, d);
  }
  return out;
}
