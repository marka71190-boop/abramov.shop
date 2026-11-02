import "server-only";

/**
 * Фото с iPhone (HEIC/HEIF): sharp из коробки их не читает, поэтому раскодируем сами (libheif в WebAssembly)
 * и отдаём sharp готовые пиксели. Остальные форматы идут как есть.
 */
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

export const isHeicName = (name: string) => /\.(heic|heif)$/i.test(name);

/** Подходит ли файл как картинка: по типу, а у HEIC без типа (Windows, Android) — по расширению */
export function isImageFile(file: { type: string; name: string }) {
  return /^image\/(jpeg|png|webp|avif|heic|heif|heic-sequence|heif-sequence)$/.test(file.type) || (!file.type && isHeicName(file.name)) || isHeicName(file.name);
}

/** Контейнер HEIF с картинкой HEVC (не AVIF): смотрим бренды в заголовке ftyp */
export function looksLikeHeic(buf: Buffer) {
  if (buf.length < 16 || buf.toString("latin1", 4, 8) !== "ftyp") return false;
  const size = Math.min(buf.readUInt32BE(0), 64, buf.length);
  const brands: string[] = [];
  for (let o = 8; o + 4 <= size; o += 4) brands.push(buf.toString("latin1", o, o + 4));
  if (brands.includes("avif") || brands.includes("avis")) return false;
  return brands.some((b) => HEIC_BRANDS.includes(b));
}

/**
 * Источник фото для sharp: возвращает функцию, которая каждый раз даёт новый sharp-объект.
 * HEIC раскодируется один раз (это небыстро), обычные форматы sharp читает сам.
 */
export async function imageSource(buf: Buffer) {
  const sharp = (await import("sharp")).default;
  if (!looksLikeHeic(buf)) return () => sharp(buf);
  const decode = (await import("heic-decode")).default;
  const img = await decode({ buffer: buf });
  const px = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  // Поворот в HEIC уже применён при раскодировании; дальнейший rotate() без EXIF ничего не меняет
  return () => sharp(px, { raw: { width: img.width, height: img.height, channels: 4 } });
}
