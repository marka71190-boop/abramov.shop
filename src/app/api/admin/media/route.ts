/**
 * POST /api/admin/media — загрузка фото товара (только для админов).
 * Фото уменьшаем до 1600 px по длинной стороне и сохраняем в WebP прямо в базе.
 */
import { db, schema as s } from "@/db";
import { getViewer, isAdmin } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const MAX = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const me = await getViewer();
  if (!isAdmin(me)) return Response.json({ error: "Нет доступа" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Файл не получен" }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "Файл больше 15 МБ" }, { status: 400 });
  if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(file.type)) return Response.json({ error: "Нужна картинка JPG, PNG или WebP" }, { status: 400 });

  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    const [row] = await db
      .insert(s.media)
      .values({ mime: "image/webp", data: out.data, size: out.info.size, width: out.info.width, height: out.info.height, createdById: me!.id })
      .returning({ id: s.media.id });
    return Response.json({ id: row.id, url: `/media/${row.id}` });
  } catch (e) {
    console.error("[media] upload:", e);
    return Response.json({ error: "Не удалось обработать картинку. Попробуйте JPG или PNG" }, { status: 400 });
  }
}
