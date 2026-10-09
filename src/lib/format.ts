const NBSP = " ";

/** 350000 (копейки) → «3 500 ₽» */
export function rub(kopecks: number) {
  const rubles = kopecks / 100;
  const s = Number.isInteger(rubles) ? String(rubles) : rubles.toFixed(2).replace(".", ",");
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + "₽";
}

/** 1250 → «1 250» */
export function num(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" });
const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

export const fmtDate = (d: Date | string) => dateFmt.format(new Date(d));
export const fmtDateTime = (d: Date | string) => dateTimeFmt.format(new Date(d));

/** Приводит российский номер к виду +7XXXXXXXXXX. Возвращает null, если номер неполный. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && (d.startsWith("8") || d.startsWith("7"))) d = "7" + d.slice(1);
  else if (d.length === 10) d = "7" + d;
  return d.length === 11 && d.startsWith("7") ? "+" + d : null;
}

/** +79001234567 → +7 (900) 123-45-67 */
export function prettyPhone(p: string | null | undefined) {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length !== 11) return p;
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}
