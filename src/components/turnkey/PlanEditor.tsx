"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { bbox, checkLayout, expand, footprint, PROBLEM_TEXT, ZONE_KIND, type Gaps, type Placed, type Plan, type Pt, type TableModel } from "@/lib/turnkey-geom";
import { fmtM, TableShape } from "./PlanSvg";

export type Sel = { type: "vertex"; i: number } | { type: "column"; id: string } | { type: "zone"; id: string } | { type: "table"; id: string } | null;

type Drag =
  | { type: "vertex"; i: number }
  | { type: "column" | "zone"; id: string; dx: number; dy: number }
  | { type: "resize"; id: string }
  | { type: "table"; id: string; dx: number; dy: number }
  | null;

const snap = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Редактор плана: в режиме «зал» двигаем углы, колонны и зоны, рисуем свой контур;
 * в режиме «столы» двигаем и выбираем столы. Всё в миллиметрах, сетка — 1 м.
 */
export function PlanEditor({
  plan,
  onPlan,
  tables,
  onTables,
  models,
  gaps,
  mode,
  sel,
  onSel,
  drawing,
  onDraw,
  ortho,
}: {
  plan: Plan;
  onPlan: (p: Plan) => void;
  tables: Placed[];
  onTables: (t: Placed[]) => void;
  models: TableModel[];
  gaps: Gaps;
  mode: "room" | "tables";
  sel: Sel;
  onSel: (s: Sel) => void;
  /** Рисование своего контура: точки по клику */
  drawing: Pt[] | null;
  onDraw: (pts: Pt[] | null, done?: boolean) => void;
  ortho: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [hover, setHover] = useState<Pt | null>(null);

  // Рамка вида: по контуру с запасом; во время перетаскивания не меняется, чтобы план не «уезжал»
  const fit = useMemo(() => {
    const pts = drawing?.length ? [...plan.points, ...drawing] : plan.points;
    const b = pts.length >= 2 ? bbox(pts) : { x: 0, y: 0, w: 20000, h: 12000 };
    const pad = Math.max(2000, Math.max(b.w, b.h) * 0.14);
    return { x: b.x - pad, y: b.y - pad, w: Math.max(b.w, 6000) + pad * 2, h: Math.max(b.h, 4000) + pad * 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag ? null : plan.points, drawing]);
  const [vb, setVb] = useState(fit);
  useEffect(() => {
    if (!drag) setVb(fit);
  }, [fit, drag]);

  // Ручки и подписи — в экранных пикселях, чтобы на телефоне они не становились крошечными
  const [px, setPx] = useState({ w: 800, h: 500 });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx({ w: el.clientWidth || 800, h: el.clientHeight || 500 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mmPerPx = Math.max(vb.w / px.w, vb.h / px.h);
  const unit = mmPerPx * 5.5; // радиус ручки ≈ 8 px
  const font = mmPerPx * 13;
  const problems = useMemo(() => (mode === "tables" ? checkLayout(plan, tables, models, gaps) : []), [mode, plan, tables, models, gaps]);

  const toPlan = (e: { clientX: number; clientY: number }): Pt => {
    const s = svg.current!;
    const p = s.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const r = p.matrixTransform(s.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  };

  const drawPoint = (raw: Pt): Pt => {
    let p = { x: snap(raw.x, 100), y: snap(raw.y, 100) };
    const last = drawing?.[drawing.length - 1];
    if (ortho && last) p = Math.abs(p.x - last.x) < Math.abs(p.y - last.y) ? { x: last.x, y: p.y } : { x: p.x, y: last.y };
    return p;
  };

  const down = (e: React.PointerEvent, d: Drag, s: Sel) => {
    if (drawing) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onSel(s);
    setDrag(d);
  };

  const move = (e: React.PointerEvent) => {
    const p = toPlan(e);
    if (drawing) {
      setHover(drawPoint(p));
      return;
    }
    if (!drag) return;
    if (drag.type === "vertex") {
      const pts = plan.points.slice();
      pts[drag.i] = { x: snap(p.x, 100), y: snap(p.y, 100) };
      onPlan({ ...plan, points: pts });
    } else if (drag.type === "column" || drag.type === "zone") {
      const key = drag.type === "column" ? "columns" : "zones";
      const list = plan[key].map((r) => (r.id === drag.id ? { ...r, x: snap(p.x - drag.dx, 100), y: snap(p.y - drag.dy, 100) } : r));
      onPlan({ ...plan, [key]: list });
    } else if (drag.type === "resize") {
      onPlan({ ...plan, zones: plan.zones.map((z) => (z.id === drag.id ? { ...z, w: Math.max(800, snap(p.x - z.x, 100)), h: Math.max(800, snap(p.y - z.y, 100)) } : z)) });
    } else if (drag.type === "table") {
      onTables(tables.map((t) => (t.id === drag.id ? { ...t, x: snap(p.x - drag.dx, 50), y: snap(p.y - drag.dy, 50) } : t)));
    }
  };

  const click = (e: React.MouseEvent) => {
    if (!drawing) {
      // Снимаем выбор только по клику на пустое место
      if ((e.target as Element).hasAttribute("data-bg")) onSel(null);
      return;
    }
    const p = drawPoint(toPlan(e));
    const first = drawing[0];
    if (drawing.length >= 3 && first && Math.hypot(p.x - first.x, p.y - first.y) < unit * 3) {
      onDraw(drawing, true);
      return;
    }
    if (drawing.length && Math.hypot(p.x - drawing[drawing.length - 1].x, p.y - drawing[drawing.length - 1].y) < 100) return;
    onDraw([...drawing, p]);
  };

  const insertVertex = (i: number) => {
    const a = plan.points[i];
    const b = plan.points[(i + 1) % plan.points.length];
    const pts = plan.points.slice();
    pts.splice(i + 1, 0, { x: snap((a.x + b.x) / 2, 100), y: snap((a.y + b.y) / 2, 100) });
    onPlan({ ...plan, points: pts });
    onSel({ type: "vertex", i: i + 1 });
  };

  const selTable = sel?.type === "table" ? tables.find((t) => t.id === sel.id) : null;
  const selModel = selTable ? models.find((m) => m.id === selTable.modelId) : null;

  return (
    <div className="plan-editor">
      <svg
        ref={svg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className={`plan-svg plan-svg--edit${drawing ? " is-drawing" : ""}`}
        onPointerMove={move}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
        onClick={click}
        role="application"
        aria-label="Редактор плана зала"
      >
        <defs>
          <pattern id="ed-grid" width="1000" height="1000" patternUnits="userSpaceOnUse">
            <path d="M 1000 0 L 0 0 0 1000" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>
        <rect data-bg x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#ed-grid)" />

        {plan.points.length >= 3 && !drawing && (
          <polygon data-bg points={plan.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(220,191,131,0.06)" stroke="#dcbf83" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        )}

        {/* Размеры стен */}
        {!drawing &&
          (() => {
            // Подписи — снаружи стены, по нормали к ней
            let s = 0;
            const pts = plan.points;
            for (let i = 0; i < pts.length; i++) s += pts[i].x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * pts[i].y;
            const sign = s > 0 ? 1 : -1;
            return pts.map((a, i) => {
              const b = pts[(i + 1) % pts.length];
              const len = Math.hypot(b.x - a.x, b.y - a.y);
              if (len < 500) return null;
              const nx = (sign * (b.y - a.y)) / len;
              const ny = (sign * -(b.x - a.x)) / len;
              const off = font * 1.4;
              return (
                <text key={`d${i}`} x={(a.x + b.x) / 2 + nx * off} y={(a.y + b.y) / 2 + ny * off} fontSize={font} textAnchor="middle" dominantBaseline="middle" className="plan-dim">
                  {fmtM(len)} м
                </text>
              );
            });
          })()}

        {plan.zones.map((z) => (
          <g key={z.id} onPointerDown={(e) => mode === "room" && down(e, { type: "zone", id: z.id, dx: toPlan(e).x - z.x, dy: toPlan(e).y - z.y }, { type: "zone", id: z.id })} style={{ cursor: mode === "room" ? "move" : "default" }}>
            <rect
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              fill={ZONE_KIND[z.kind].color}
              fillOpacity={0.28}
              stroke={sel?.type === "zone" && sel.id === z.id ? "#fff" : ZONE_KIND[z.kind].color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <text x={z.x + z.w / 2} y={z.y + z.h / 2} fontSize={font} textAnchor="middle" dominantBaseline="middle" className="plan-label">
              {ZONE_KIND[z.kind].label}
            </text>
            {mode === "room" && sel?.type === "zone" && sel.id === z.id && (
              <rect
                x={z.x + z.w - unit * 1.6}
                y={z.y + z.h - unit * 1.6}
                width={unit * 3.2}
                height={unit * 3.2}
                className="plan-handle"
                style={{ cursor: "nwse-resize" }}
                onPointerDown={(e) => down(e, { type: "resize", id: z.id }, { type: "zone", id: z.id })}
              />
            )}
          </g>
        ))}

        {plan.columns.map((c) => (
          <rect
            key={c.id}
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            fill="#8a8a92"
            stroke={sel?.type === "column" && sel.id === c.id ? "#fff" : "none"}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: mode === "room" ? "move" : "default" }}
            onPointerDown={(e) => mode === "room" && down(e, { type: "column", id: c.id, dx: toPlan(e).x - c.x, dy: toPlan(e).y - c.y }, { type: "column", id: c.id })}
          />
        ))}

        {/* Зона удара выбранного стола */}
        {selTable && selModel && (
          <rect {...rectProps(expand(footprint(selTable, selModel), gaps.wall))} fill="none" stroke="#dcbf83" strokeDasharray="6 6" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}

        {tables.map((t, i) => {
          const m = models.find((x) => x.id === t.modelId);
          if (!m) return null;
          const bad = mode === "tables" && !!problems[i];
          return (
            <g
              key={t.id}
              style={{ cursor: mode === "tables" ? "move" : "default", opacity: mode === "room" ? 0.45 : 1 }}
              onPointerDown={(e) => mode === "tables" && down(e, { type: "table", id: t.id, dx: toPlan(e).x - t.x, dy: toPlan(e).y - t.y }, { type: "table", id: t.id })}
            >
              <TableShape t={t} m={m} n={i + 1} font={font} state={bad ? "bad" : sel?.type === "table" && sel.id === t.id ? "selected" : undefined} />
            </g>
          );
        })}

        {mode === "room" &&
          !drawing &&
          plan.points.map((p, i) => {
            const b = plan.points[(i + 1) % plan.points.length];
            return (
              <g key={`v${i}`}>
                <circle
                  cx={(p.x + b.x) / 2}
                  cy={(p.y + b.y) / 2}
                  r={unit * 1.1}
                  className="plan-add"
                  onClick={(e) => {
                    e.stopPropagation();
                    insertVertex(i);
                  }}
                >
                  <title>Добавить угол</title>
                </circle>
                <circle cx={p.x} cy={p.y} r={unit * 1.5} className={`plan-handle${sel?.type === "vertex" && sel.i === i ? " is-sel" : ""}`} onPointerDown={(e) => down(e, { type: "vertex", i }, { type: "vertex", i })} />
              </g>
            );
          })}

        {drawing && (
          <>
            {drawing.length > 0 && (
              <polyline points={[...drawing, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#dcbf83" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            )}
            {drawing.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={unit * (i === 0 && drawing.length >= 3 ? 2.2 : 1.2)} className={i === 0 ? "plan-handle is-sel" : "plan-handle"} />
            ))}
            {hover && <circle cx={hover.x} cy={hover.y} r={unit} fill="#dcbf83" opacity={0.6} />}
            {hover && drawing.length > 0 && (
              <text x={hover.x + unit * 2} y={hover.y - unit * 2} fontSize={font} className="plan-dim">
                {fmtM(Math.hypot(hover.x - drawing[drawing.length - 1].x, hover.y - drawing[drawing.length - 1].y))} м
              </text>
            )}
          </>
        )}
      </svg>
      {mode === "tables" && problems.some(Boolean) && (
        <div className="plan-problems small">
          {problems.map((p, i) => (p ? <span key={i}>Стол {i + 1}: {PROBLEM_TEXT[p]}</span> : null))}
        </div>
      )}
    </div>
  );
}

const rectProps = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y, width: r.w, height: r.h });
