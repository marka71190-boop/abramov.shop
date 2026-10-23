/** План зала сверху: контур с размерами, колонны, зоны, столы. Без хуков — подходит для печати и админки */
import { bbox, footprint, TABLE_KINDS, ZONE_KIND, type Placed, type Plan, type TableModel } from "@/lib/turnkey-geom";

export const fmtM = (mm: number) => (mm / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function PlanSvg({ plan, tables, models, print = false, numbers = true }: { plan: Plan; tables: Placed[]; models: TableModel[]; print?: boolean; numbers?: boolean }) {
  const b = bbox(plan.points);
  const pad = 1200;
  const vb = `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`;
  const ink = print ? "#111" : "currentColor";
  const font = Math.max(220, Math.min(b.w, b.h) / 28);
  return (
    <svg viewBox={vb} className="plan-svg" role="img" aria-label="План зала" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={print ? "gridp" : "grid"} width="1000" height="1000" patternUnits="userSpaceOnUse" x={b.x} y={b.y}>
          <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke={print ? "#ddd" : "rgba(255,255,255,0.07)"} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <polygon points={plan.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={`url(#${print ? "gridp" : "grid"})`} stroke={ink} strokeWidth="3" vectorEffect="non-scaling-stroke" />
      <Dimensions plan={plan} font={font} ink={ink} />
      {plan.zones.map((z) => (
        <g key={z.id}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={ZONE_KIND[z.kind].color} fillOpacity={0.25} stroke={ZONE_KIND[z.kind].color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <text x={z.x + z.w / 2} y={z.y + z.h / 2} fontSize={font} textAnchor="middle" dominantBaseline="middle" fill={ink}>
            {ZONE_KIND[z.kind].label}
          </text>
        </g>
      ))}
      {plan.columns.map((c) => (
        <rect key={c.id} x={c.x} y={c.y} width={c.w} height={c.h} fill={print ? "#666" : "#8a8a92"} />
      ))}
      {tables.map((t, i) => {
        const m = models.find((x) => x.id === t.modelId);
        if (!m) return null;
        return <TableShape key={t.id} t={t} m={m} n={numbers ? i + 1 : undefined} font={font} />;
      })}
    </svg>
  );
}

export function TableShape({ t, m, n, font, state }: { t: Placed; m: TableModel; n?: number; font: number; state?: "selected" | "bad" }) {
  const r = footprint(t, m);
  const rail = 140;
  const wide = TABLE_KINDS[m.kind]?.pockets === "wide";
  const pr = wide ? 70 : 55;
  const long = t.rot === 0;
  const pockets = [
    [r.x + rail * 0.6, r.y + rail * 0.6],
    [r.x + r.w - rail * 0.6, r.y + rail * 0.6],
    [r.x + rail * 0.6, r.y + r.h - rail * 0.6],
    [r.x + r.w - rail * 0.6, r.y + r.h - rail * 0.6],
    long ? [r.x + r.w / 2, r.y + rail * 0.45] : [r.x + rail * 0.45, r.y + r.h / 2],
    long ? [r.x + r.w / 2, r.y + r.h - rail * 0.45] : [r.x + r.w - rail * 0.45, r.y + r.h / 2],
  ];
  return (
    <g>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={60} fill={m.frame} stroke={state === "bad" ? "#ff5a5a" : state === "selected" ? "#dcbf83" : "none"} strokeWidth={state ? 4 : 0} vectorEffect="non-scaling-stroke" />
      <rect x={r.x + rail} y={r.y + rail} width={r.w - rail * 2} height={r.h - rail * 2} fill={m.cloth} />
      {pockets.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={pr} fill="#0b0b0b" />
      ))}
      {n != null && (
        <text x={t.x} y={t.y} fontSize={font * 1.1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontWeight={700}>
          {n}
        </text>
      )}
    </g>
  );
}

/** Длины стен в метрах — подписи снаружи контура */
function Dimensions({ plan, font, ink }: { plan: Plan; font: number; ink: string }) {
  const pts = plan.points;
  // Направление обхода — чтобы подпись была снаружи
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += pts[i].x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * pts[i].y;
  const cw = s > 0;
  return (
    <g>
      {pts.map((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 800) return null;
        const nx = (cw ? 1 : -1) * ((b.y - a.y) / len);
        const ny = (cw ? 1 : -1) * (-(b.x - a.x) / len);
        const off = font * 1.3;
        return (
          <text key={i} x={(a.x + b.x) / 2 + nx * off} y={(a.y + b.y) / 2 + ny * off} fontSize={font} textAnchor="middle" dominantBaseline="middle" fill={ink} opacity={0.75}>
            {fmtM(len)} м
          </text>
        );
      })}
    </g>
  );
}
