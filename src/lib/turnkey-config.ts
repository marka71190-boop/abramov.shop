/** «Клуб под ключ»: прайс и нормы, смета. Общий для сервера и браузера. */
import { DEFAULT_GAPS, TABLE_GAP_MIN, TABLE_KINDS, type Gaps, type Placed, type TableKind, type TableModel } from "@/lib/turnkey-geom";

export interface CostItem {
  id: string;
  name: string;
  price: number; // копейки; 0 — по запросу
}

export interface TurnkeyConfig {
  enabled: boolean;
  intro: string;
  gaps: Gaps;
  models: TableModel[];
  /** На каждый стол: светильник, комплект аксессуаров, доставка и сборка */
  perTable: CostItem[];
  /** На клуб: выезд и замер, проект */
  perClub: CostItem[];
  validDays: number; // сколько дней действует КП
  note: string; // примечание в КП
}

const model = (kind: TableKind, frame = "#3b2416"): TableModel => ({
  id: kind.toLowerCase(),
  kind,
  name: TABLE_KINDS[kind].label,
  length: TABLE_KINDS[kind].length,
  width: TABLE_KINDS[kind].width,
  price: 0,
  cloth: TABLE_KINDS[kind].cloth,
  frame,
  note: `Игровое поле ${TABLE_KINDS[kind].field}`,
  active: true,
});

export const TURNKEY_DEFAULT: TurnkeyConfig = {
  enabled: true,
  intro: "Откроем бильярдный клуб под ключ: подберём столы, расставим их по нормам, привезём, соберём и настроим. Нарисуйте зал — сайт сам предложит расстановку и посчитает смету.",
  gaps: DEFAULT_GAPS,
  models: [model("RB12"), model("RB11"), model("RB10"), model("POOL9", "#1e1e22"), model("POOL8", "#1e1e22"), model("SNOOKER12")],
  perTable: [
    { id: "lamp", name: "Светильник над столом", price: 0 },
    { id: "kit", name: "Комплект: шары, кии, треугольник, мел, полка для киёв", price: 0 },
    { id: "mount", name: "Доставка, сборка и выравнивание стола", price: 0 },
  ],
  perClub: [{ id: "survey", name: "Выезд на замер и проект зала", price: 0 }],
  validDays: 14,
  note: "Расчёт предварительный. Точную смету подготовим после замера помещения: учтём пол, освещение, колонны и проходы.",
};

const str = (v: unknown, d: string, max = 2000) => (typeof v === "string" ? v.slice(0, max) : d);
const int = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const color = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

function items(raw: unknown, d: CostItem[]): CostItem[] {
  if (!Array.isArray(raw)) return d;
  return raw
    .filter((x) => x && typeof x === "object")
    .slice(0, 30)
    .map((x, i) => ({ id: str(x.id, `i${i}`, 20) || `i${i}`, name: str(x.name, "", 200), price: int(x.price, 0, 0, 1e12) }))
    .filter((x) => x.name.trim());
}

/** Сохранённый конфиг + умолчания */
export function mergeTurnkey(raw: unknown): TurnkeyConfig {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<TurnkeyConfig>;
  const d = TURNKEY_DEFAULT;
  const models = Array.isArray(v.models)
    ? v.models
        .filter((m) => m && typeof m === "object" && (m.kind as string) in TABLE_KINDS)
        .slice(0, 40)
        .map((m, i) => ({
          id: str(m.id, `m${i}`, 20) || `m${i}`,
          kind: m.kind,
          name: str(m.name, TABLE_KINDS[m.kind].label, 120),
          length: int(m.length, TABLE_KINDS[m.kind].length, 1500, 6000),
          width: int(m.width, TABLE_KINDS[m.kind].width, 800, 3000),
          price: int(m.price, 0, 0, 1e12),
          cloth: color(m.cloth, TABLE_KINDS[m.kind].cloth),
          frame: color(m.frame, "#3b2416"),
          note: str(m.note, "", 300),
          active: m.active !== false,
        }))
    : d.models;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled,
    intro: str(v.intro, d.intro),
    gaps: { wall: int(v.gaps?.wall, d.gaps.wall, 600, 3000), table: int(v.gaps?.table, d.gaps.table, TABLE_GAP_MIN, 4000) },
    models,
    perTable: items(v.perTable, d.perTable),
    perClub: items(v.perClub, d.perClub),
    validDays: int(v.validDays, d.validDays, 1, 365),
    note: str(v.note, d.note),
  };
}

export interface EstimateLine {
  name: string;
  qty: number;
  price: number;
  sum: number;
  onRequest: boolean;
}

/** Смета по расстановке */
export function estimate(tables: Pick<Placed, "modelId">[], c: TurnkeyConfig) {
  const lines: EstimateLine[] = [];
  const counts = new Map<string, number>();
  for (const t of tables) counts.set(t.modelId, (counts.get(t.modelId) ?? 0) + 1);
  for (const m of c.models) {
    const n = counts.get(m.id);
    if (n) lines.push({ name: `Стол «${m.name}»`, qty: n, price: m.price, sum: m.price * n, onRequest: !m.price });
  }
  const n = tables.length;
  if (n) for (const i of c.perTable) lines.push({ name: i.name, qty: n, price: i.price, sum: i.price * n, onRequest: !i.price });
  for (const i of c.perClub) lines.push({ name: i.name, qty: 1, price: i.price, sum: i.price, onRequest: !i.price });
  return { lines, total: lines.reduce((a, l) => a + l.sum, 0), partial: lines.some((l) => l.onRequest) };
}
