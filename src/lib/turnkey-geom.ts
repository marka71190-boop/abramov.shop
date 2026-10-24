/**
 * «Клуб под ключ»: геометрия зала и автоматическая расстановка столов.
 * Общий для сервера и браузера. Все размеры — в миллиметрах.
 *
 * Правила расстановки:
 *   • от борта стола до стены, колонны или служебной зоны — не меньше wall (по умолчанию 1,5 м — длина кия);
 *   • между бортами соседних столов — не меньше table (зона удара общая: игроки за соседними столами
 *     редко бьют одновременно с одной стороны, поэтому меньше двух длин кия).
 */

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type ZoneKind = "BAR" | "ENTRANCE" | "LOUNGE" | "OTHER";
export interface Zone extends Rect {
  id: string;
  kind: ZoneKind;
}
export interface Column extends Rect {
  id: string;
}
export interface Plan {
  points: Pt[];
  columns: Column[];
  zones: Zone[];
  ceiling: number;
}

export type TableKind = "RB12" | "RB11" | "RB10" | "POOL9" | "POOL8" | "SNOOKER12";
export interface TableModel {
  id: string;
  kind: TableKind;
  name: string;
  length: number; // габарит по длине, мм
  width: number; // габарит по ширине, мм
  price: number; // копейки; 0 — цена по запросу
  cloth: string; // цвет сукна для 3D
  frame: string; // цвет корпуса
  note: string;
  active: boolean;
}
export interface Placed {
  id: string;
  modelId: string;
  x: number; // центр
  y: number;
  rot: 0 | 90; // 0 — длинной стороной вдоль X
}
export interface Gaps {
  wall: number;
  table: number;
}

export const ZONE_KIND: Record<ZoneKind, { label: string; color: string; w: number; h: number }> = {
  BAR: { label: "Бар", color: "#b88a3e", w: 5000, h: 2500 },
  ENTRANCE: { label: "Вход", color: "#5b8bd9", w: 2000, h: 2000 },
  LOUNGE: { label: "Зона отдыха", color: "#7a9a5b", w: 4000, h: 3000 },
  OTHER: { label: "Служебная зона", color: "#8a8a92", w: 3000, h: 2000 },
};

/** Игровое поле и габариты типовых столов (габарит — по внешнему краю бортов) */
export const TABLE_KINDS: Record<TableKind, { label: string; field: string; length: number; width: number; cloth: string; pockets: "narrow" | "wide" }> = {
  RB12: { label: "Русский бильярд 12 футов", field: "3550 × 1775 мм", length: 3830, width: 2060, cloth: "#1f6b45", pockets: "narrow" },
  RB11: { label: "Русский бильярд 11 футов", field: "3200 × 1600 мм", length: 3480, width: 1880, cloth: "#1f6b45", pockets: "narrow" },
  RB10: { label: "Русский бильярд 10 футов", field: "2840 × 1420 мм", length: 3120, width: 1700, cloth: "#1f6b45", pockets: "narrow" },
  POOL9: { label: "Пул 9 футов", field: "2540 × 1270 мм", length: 2810, width: 1550, cloth: "#2a5c9a", pockets: "wide" },
  POOL8: { label: "Пул 8 футов", field: "2240 × 1120 мм", length: 2510, width: 1400, cloth: "#2a5c9a", pockets: "wide" },
  SNOOKER12: { label: "Снукер 12 футов", field: "3569 × 1778 мм", length: 3820, width: 2030, cloth: "#2c7a3f", pockets: "narrow" },
};

/** Между столами — не меньше 1,8 м: так решил магазин, клиент может выбрать и больше */
export const TABLE_GAP_MIN = 1800;
export const DEFAULT_GAPS: Gaps = { wall: 1500, table: TABLE_GAP_MIN };

// ---------------- Геометрия

export function polygonArea(p: Pt[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function bbox(p: Pt[]): Rect {
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function pointInPolygon(pt: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Пересекает ли отрезок внутренность прямоугольника (Лианг — Барски) */
function segmentHitsRect(a: Pt, b: Pt, r: Rect) {
  const eps = 0.5;
  const x0 = r.x + eps;
  const y0 = r.y + eps;
  const x1 = r.x + r.w - eps;
  const y1 = r.y + r.h - eps;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, a.x - x0) && clip(dx, x1 - a.x) && clip(-dy, a.y - y0) && clip(dy, y1 - a.y) && t0 < t1;
}

/** Прямоугольник целиком внутри многоугольника (подходит и для невыпуклых залов) */
export function rectInPolygon(r: Rect, poly: Pt[]) {
  const corners = [
    { x: r.x + 1, y: r.y + 1 },
    { x: r.x + r.w - 1, y: r.y + 1 },
    { x: r.x + r.w - 1, y: r.y + r.h - 1 },
    { x: r.x + 1, y: r.y + r.h - 1 },
  ];
  if (!corners.every((c) => pointInPolygon(c, poly))) return false;
  for (let i = 0; i < poly.length; i++) if (segmentHitsRect(poly[i], poly[(i + 1) % poly.length], r)) return false;
  return true;
}

/** Расстояние между прямоугольниками (0 — касаются или пересекаются) */
export function rectDist(a: Rect, b: Rect) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const expand = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

/** Габарит поставленного стола */
export function footprint(t: Pick<Placed, "x" | "y" | "rot">, m: Pick<TableModel, "length" | "width">): Rect {
  const w = t.rot === 0 ? m.length : m.width;
  const h = t.rot === 0 ? m.width : m.length;
  return { x: t.x - w / 2, y: t.y - h / 2, w, h };
}

export type Problem = "wall" | "table" | "obstacle" | null;

/** Почему стол стоит неправильно (null — всё хорошо) */
export function tableProblem(r: Rect, plan: Plan, others: Rect[], gaps: Gaps, box?: Rect): Problem {
  // Сначала дешёвые проверки, многоугольник — в конце
  const z = expand(r, gaps.wall);
  if (box && (z.x < box.x || z.y < box.y || z.x + z.w > box.x + box.w || z.y + z.h > box.y + box.h)) return "wall";
  for (const o of others) if (rectDist(r, o) < gaps.table) return "table";
  for (const o of plan.columns) if (overlaps(r, o) || rectDist(r, o) < gaps.wall) return "obstacle";
  for (const o of plan.zones) if (overlaps(r, o) || rectDist(r, o) < gaps.wall) return "obstacle";
  if (!rectInPolygon(r, plan.points)) return "wall";
  if (!rectInPolygon(z, plan.points)) return "wall";
  return null;
}

export const PROBLEM_TEXT: Record<Exclude<Problem, null>, string> = {
  wall: "мало места до стены",
  table: "слишком близко к другому столу",
  obstacle: "мешает колонна или зона",
};

export function checkLayout(plan: Plan, tables: Placed[], models: TableModel[], gaps: Gaps) {
  const rects = tables.map((t) => {
    const m = models.find((x) => x.id === t.modelId);
    return m ? footprint(t, m) : null;
  });
  return tables.map((t, i) => {
    const r = rects[i];
    if (!r) return "wall" as Problem;
    return tableProblem(
      r,
      plan,
      rects.filter((x, j): x is Rect => !!x && j !== i),
      gaps,
    );
  });
}

// ---------------- Автоматическая расстановка

export interface Want {
  modelId: string;
  count: number | "max";
}

interface Strategy {
  rot: 0 | 90;
  cols: boolean; // обход по колонкам, а не по строкам
  flipX: boolean;
  flipY: boolean;
}

const STEP = 100;

function greedy(plan: Plan, want: Want[], models: TableModel[], gaps: Gaps, s: Strategy) {
  const box = bbox(plan.points);
  const placed: Placed[] = [];
  const rects: Rect[] = [];
  const left = new Map(want.map((w) => [w.modelId, w.count === "max" ? Infinity : w.count]));
  // Сначала точные количества, потом «сколько влезет»; внутри — большие столы первыми
  const order = [...want].sort((a, b) => {
    const ma = models.find((m) => m.id === a.modelId)!;
    const mb = models.find((m) => m.id === b.modelId)!;
    return (a.count === "max" ? 1 : 0) - (b.count === "max" ? 1 : 0) || mb.length * mb.width - ma.length * ma.width;
  });
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = box.x; x <= box.x + box.w; x += STEP) xs.push(x);
  for (let y = box.y; y <= box.y + box.h; y += STEP) ys.push(y);
  if (s.flipX) xs.reverse();
  if (s.flipY) ys.reverse();
  const outer = s.cols ? xs : ys;
  const inner = s.cols ? ys : xs;
  let id = 0;
  for (const w of order) {
    const m = models.find((x) => x.id === w.modelId);
    if (!m) continue;
    for (const a of outer) {
      if ((left.get(w.modelId) ?? 0) <= 0) break;
      for (const b of inner) {
        if ((left.get(w.modelId) ?? 0) <= 0) break;
        const cx = s.cols ? a : b;
        const cy = s.cols ? b : a;
        const t = { x: cx, y: cy, rot: s.rot };
        const r = footprint(t, m);
        if (tableProblem(r, plan, rects, gaps, box)) continue;
        placed.push({ id: `t${++id}`, modelId: m.id, ...t });
        rects.push(r);
        left.set(w.modelId, (left.get(w.modelId) ?? 0) - 1);
      }
    }
  }
  return placed;
}

/**
 * Расстановка «сеткой»: столы одного типа стоят рядами с одинаковым шагом — так выглядят настоящие клубы.
 * Подбираем сдвиг сетки, при котором влезает больше всего столов.
 */
function lattice(plan: Plan, want: Want[], models: TableModel[], gaps: Gaps, rot: 0 | 90) {
  const box = bbox(plan.points);
  const placed: Placed[] = [];
  const rects: Rect[] = [];
  // Сначала точные количества, потом «сколько влезет»; внутри — крупные первыми
  const area = (w: Want) => {
    const m = models.find((x) => x.id === w.modelId);
    return m ? m.length * m.width : 0;
  };
  const order = [...want].sort((a, b) => (a.count === "max" ? 1 : 0) - (b.count === "max" ? 1 : 0) || area(b) - area(a));
  let id = 0;
  for (const w of order) {
    const m = models.find((x) => x.id === w.modelId);
    if (!m) continue;
    const need = w.count === "max" ? Infinity : w.count;
    const tw = rot === 0 ? m.length : m.width;
    const th = rot === 0 ? m.width : m.length;
    const px = tw + gaps.table;
    const py = th + gaps.table;
    let best: Placed[] = [];
    let bestRects: Rect[] = [];
    for (let ox = 0; ox < px; ox += STEP)
      for (let oy = 0; oy < py; oy += STEP) {
        const got: Placed[] = [];
        const gotRects: Rect[] = [];
        for (let y = box.y + oy + th / 2; y <= box.y + box.h; y += py) {
          for (let x = box.x + ox + tw / 2; x <= box.x + box.w; x += px) {
            if (got.length >= need) break;
            const t = { x, y, rot };
            const r = footprint(t, m);
            if (tableProblem(r, plan, [...rects, ...gotRects], gaps, box)) continue;
            got.push({ id: "", modelId: m.id, ...t });
            gotRects.push(r);
          }
          if (got.length >= need) break;
        }
        if (got.length > best.length) {
          best = got;
          bestRects = gotRects;
          if (best.length >= need) break;
        }
      }
    for (const t of best) placed.push({ ...t, id: `t${++id}` });
    rects.push(...bestRects);
  }
  return placed;
}

/** Сдвинуть всю расстановку к центру свободного места — так красивее и ровнее проходы */
function centerLayout(plan: Plan, tables: Placed[], models: TableModel[], gaps: Gaps) {
  if (!tables.length) return tables;
  const ok = (dx: number, dy: number) => {
    const moved = tables.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    return checkLayout(plan, moved, models, gaps).every((p) => !p);
  };
  const reach = (sx: number, sy: number) => {
    let lo = 0;
    let hi = 0;
    for (let d = STEP; d <= 20000; d += STEP) {
      if (!ok(sx * d, sy * d)) break;
      hi = d;
    }
    return { lo, hi };
  };
  const right = reach(1, 0).hi;
  const leftR = reach(-1, 0).hi;
  const dx = Math.round((right - leftR) / 2 / 50) * 50;
  const down = reach(0, 1).hi;
  const up = reach(0, -1).hi;
  const dy = Math.round((down - up) / 2 / 50) * 50;
  if (ok(dx, dy)) return tables.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  if (ok(dx, 0)) return tables.map((t) => ({ ...t, x: t.x + dx }));
  if (ok(0, dy)) return tables.map((t) => ({ ...t, y: t.y + dy }));
  return tables;
}

/** Несколько вариантов расстановки — лучшие сверху, без повторов по количеству и ориентации */
export function autoLayouts(plan: Plan, want: Want[], models: TableModel[], gaps: Gaps, limit = 3) {
  if (plan.points.length < 3 || !want.length) return [];
  const results: { tables: Placed[]; rot: 0 | 90; score: number }[] = [];
  const score = (tables: Placed[], bonus = 0) =>
    tables.reduce((a, t) => {
      const m = models.find((x) => x.id === t.modelId)!;
      return a + 1_000_000 + (m.length * m.width) / 1000;
    }, 0) + bonus;
  // Ровная сетка — предпочтительнее при том же числе столов
  for (const rot of [0, 90] as const) {
    const tables = lattice(plan, want, models, gaps, rot);
    results.push({ tables, rot, score: score(tables, 500) });
  }
  for (const rot of [0, 90] as const)
    for (const cols of [false, true])
      for (const flipX of [false, true])
        for (const flipY of [false, true]) {
          const tables = greedy(plan, want, models, gaps, { rot, cols, flipX, flipY });
          // Больше столов — лучше; при равенстве — больше крупных столов
          results.push({ tables, rot, score: score(tables) });
        }
  results.sort((a, b) => b.score - a.score);
  const out: { tables: Placed[]; count: number; rot: 0 | 90 }[] = [];
  for (const r of results) {
    if (out.length >= limit) break;
    const key = `${r.tables.length}-${r.rot}`;
    if (out.some((o) => `${o.count}-${o.rot}` === key)) continue;
    out.push({ tables: centerLayout(plan, r.tables, models, gaps), count: r.tables.length, rot: r.rot });
  }
  return out;
}

/** Найти свободное место для ещё одного стола */
export function findSpot(plan: Plan, tables: Placed[], model: TableModel, models: TableModel[], gaps: Gaps): Placed | null {
  const rects = tables.map((t) => footprint(t, models.find((m) => m.id === t.modelId)!));
  const box = bbox(plan.points);
  for (const rot of [0, 90] as const)
    for (let y = box.y; y <= box.y + box.h; y += STEP)
      for (let x = box.x; x <= box.x + box.w; x += STEP) {
        const r = footprint({ x, y, rot }, model);
        if (!tableProblem(r, plan, rects, gaps, box)) return { id: `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, modelId: model.id, x, y, rot };
      }
  return null;
}

// ---------------- Шаблоны зала

export const rectRoom = (L: number, W: number): Pt[] => [
  { x: 0, y: 0 },
  { x: L, y: 0 },
  { x: L, y: W },
  { x: 0, y: W },
];

/** Г-образный зал: общий габарит L × W, вырезан угол a × b справа снизу */
export const lRoom = (L: number, W: number, a: number, b: number): Pt[] => [
  { x: 0, y: 0 },
  { x: L, y: 0 },
  { x: L, y: W - b },
  { x: L - a, y: W - b },
  { x: L - a, y: W },
  { x: 0, y: W },
];

/** Проверка плана, пришедшего из браузера */
export function sanePlan(raw: unknown): Plan | null {
  const p = raw as Partial<Plan> | null;
  if (!p || !Array.isArray(p.points) || p.points.length < 3 || p.points.length > 200) return null;
  const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  const pts = p.points.filter((q) => num(q?.x, -1e6, 1e6) && num(q?.y, -1e6, 1e6)).map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
  if (pts.length !== p.points.length) return null;
  const rect = <T extends Rect>(r: T) => num(r?.x, -1e6, 1e6) && num(r?.y, -1e6, 1e6) && num(r?.w, 100, 1e5) && num(r?.h, 100, 1e5);
  const columns = (Array.isArray(p.columns) ? p.columns : []).filter(rect).slice(0, 100).map((c, i) => ({ id: `c${i}`, x: c.x, y: c.y, w: c.w, h: c.h }));
  const zones = (Array.isArray(p.zones) ? p.zones : [])
    .filter((z) => rect(z) && z.kind in ZONE_KIND)
    .slice(0, 50)
    .map((z, i) => ({ id: `z${i}`, kind: z.kind, x: z.x, y: z.y, w: z.w, h: z.h }));
  return { points: pts, columns, zones, ceiling: num(p.ceiling, 2000, 10000) ? Math.round(p.ceiling!) : 3000 };
}
