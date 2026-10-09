/** GET /media/:id — фото товара из базы. Адрес не меняется, поэтому кэшируем надолго. */
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const m = await db.query.media.findFirst({ where: eq(s.media.id, id) });
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mime,
      "Content-Length": String(m.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
