import "server-only";
import { db, schema as s } from "@/db";

/** Уменьшает фото до 1600 px, сохраняет в WebP в базе. Возвращает адрес /media/<id>. */
export async function saveImage(file: File, userId: string, maxSide = 1600) {
  if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(file.type)) throw new Error("Нужна картинка JPG, PNG или WebP");
  return saveImageBuffer(Buffer.from(await file.arrayBuffer()), userId, maxSide);
}

/** То же для уже скачанной картинки (загрузка каталога из Excel). */
export async function saveImageBuffer(buf: Buffer, userId: string, maxSide = 1600) {
  const sharp = (await import("sharp")).default;
  const out = await sharp(buf)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  const [row] = await db
    .insert(s.media)
    .values({ mime: "image/webp", data: out.data, size: out.info.size, width: out.info.width, height: out.info.height, createdById: userId })
    .returning({ id: s.media.id });
  return `/media/${row.id}`;
}
