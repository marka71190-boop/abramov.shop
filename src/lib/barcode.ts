/**
 * Штрихкод Code 128 (набор B: латиница, цифры, знаки) в SVG — для этикеток на товар.
 * Сканер в кассе «печатает» артикул и Enter — касса сразу добавляет товар.
 */

// Ширины полос и пробелов для 107 символов Code 128 (последний — «Стоп»)
const P =
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112".split(
    " ",
  );
const START_B = 104;
const STOP = 106;

/** Можно ли закодировать: печатные символы ASCII, до 40 знаков */
export const canBarcode = (v: string | null | undefined): v is string => !!v && /^[\x20-\x7E]{1,40}$/.test(v);

/** Последовательность ширин модулей (полоса, пробел, полоса…) */
export function code128(value: string): number[] {
  if (!canBarcode(value)) throw new Error("Штрихкод: только латиница, цифры и знаки");
  const codes = [START_B, ...[...value].map((c) => c.charCodeAt(0) - 32)];
  const check = codes.reduce((a, c, i) => a + c * (i === 0 ? 1 : i), 0) % 103;
  return [...codes, check, STOP].flatMap((c) => [...P[c]].map(Number));
}

// ---------- EAN-13: 13 цифр, 95 модулей — короче Code 128 и надёжнее читается с маленькой этикетки ----------
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((c) => [...c].map((b) => (b === "0" ? "1" : "0")).reverse().join(""));
const R = L.map((c) => [...c].map((b) => (b === "0" ? "1" : "0")).join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Контрольная цифра EAN-13 по первым 12 */
export function ean13Check(d12: string) {
  const sum = [...d12].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}
export const isEan13 = (v: string | null | undefined): v is string => !!v && /^\d{13}$/.test(v) && ean13Check(v.slice(0, 12)) === v[12];

/** Магазинный штрихкод: 200 + 9 цифр номера + контрольная (диапазон 200–299 — для внутреннего учёта) */
export const shopEan = (n: number) => {
  const d12 = `200${String(n).padStart(9, "0")}`;
  return d12 + ean13Check(d12);
};

/** Последовательность ширин модулей EAN-13 (полоса, пробел, …) */
function ean13(value: string): number[] {
  const d = [...value].map(Number);
  const bits = "101" + d.slice(1, 7).map((x, i) => (PARITY[d[0]][i] === "L" ? L[x] : G[x])).join("") + "01010" + d.slice(7).map((x) => R[x]).join("") + "101";
  const out: number[] = [];
  for (let i = 0, run = 1; i < bits.length; i++, run++) if (bits[i] !== bits[i + 1]) (out.push(run), (run = 0));
  return out;
}

/** SVG штрихкода: высота в модулях, тихие зоны по 10 модулей с краёв. 13 цифр с верной контрольной — EAN-13, иначе Code 128 */
export function barcodeSvg(value: string, opts: { height?: number } = {}) {
  const widths = isEan13(value) ? ean13(value) : code128(value);
  const quiet = 10;
  const total = widths.reduce((a, w) => a + w, 0) + quiet * 2;
  const h = opts.height ?? 40;
  let x = quiet;
  let bars = "";
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`;
    x += w;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${value.replace(/[<>&"]/g, "")}"><g fill="#000">${bars}</g></svg>`;
}
