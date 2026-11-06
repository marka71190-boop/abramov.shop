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

/**
 * Приводит номер к виду +7XXXXXXXXXX. Зарубежный номер — с «+» или «00» в начале — к виду +КОД…
 * (8–15 цифр). Возвращает null, если номер неполный.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  let d = raw.replace(/\D/g, "");
  const intl = raw.startsWith("+") || raw.startsWith("00");
  if (raw.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && (d.startsWith("7") || (!intl && d.startsWith("8")))) return "+7" + d.slice(1);
  if (!intl && d.length === 10) return "+7" + d;
  if (intl && !d.startsWith("7") && d.length >= 8 && d.length <= 15) return "+" + d;
  return null;
}

/** +79001234567 → +7 (900) 123-45-67 */
export function prettyPhone(p: string | null | undefined) {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length !== 11 || !d.startsWith("7")) return p;
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}
