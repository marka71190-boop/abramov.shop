/**
 * Код ячейки склада: «A-3», «Б-12», «СТЕЛЛАЖ-2». Буквы, цифры и дефис, заглавными, до 12 знаков.
 * Общий файл для сервера и браузера.
 */
export const normBin = (raw: string | null | undefined) =>
  String(raw ?? "")
    .toUpperCase()
    .replace(/Ё/g, "Е")
    .replace(/[\s_.\/]+/g, "-")
    .replace(/[^A-ZА-Я0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 12);

/** «A-1, A-2 B-7» → ["A-1", "A-2", "B-7"]; «A-1..A-5» разворачивается в пять ячеек */
export function parseBins(raw: string | null | undefined) {
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[,;\n]+/)) {
    const m = part.trim().match(/^(.*?)(\d+)\s*\.\.\s*(?:.*?)(\d+)$/);
    if (m && Number(m[3]) >= Number(m[2]) && Number(m[3]) - Number(m[2]) < 200) {
      for (let n = Number(m[2]); n <= Number(m[3]); n++) out.push(normBin(`${m[1]}${n}`));
    } else out.push(normBin(part));
  }
  return [...new Set(out.filter(Boolean))].slice(0, 300);
}
