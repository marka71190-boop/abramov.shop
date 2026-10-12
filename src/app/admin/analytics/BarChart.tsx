"use client";
import { useState } from "react";
import { num, rub } from "@/lib/format";

/**
 * Столбчатая диаграмма по дням (SVG, без библиотек).
 * Наведение на столбец показывает значение; под графиком — таблица с теми же данными.
 */
export function BarChart({ data, unit, label }: { data: { day: string; value: number }[]; unit: "rub" | "count"; label: string }) {
  const format = (v: number) => (unit === "rub" ? rub(v) : num(v));
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = 220;
  const pad = { l: 4, r: 74, t: 30, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const slot = (W - pad.l - pad.r) / n;
  const gap = n > 45 ? 1 : 2;
  const bw = Math.max(2, slot - gap);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const tickEvery = n > 60 ? 14 : n > 20 ? 7 : 1;
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: всего ${format(total)}`} className="chart__svg">
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart__grid" />
            <text x={W - pad.r + 8} y={y(max * f) + 4} textAnchor="start" className="chart__axis">
              {format(Math.round(max * f))}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="chart__base" />
        {data.map((d, i) => {
          const x = pad.l + i * slot + gap / 2;
          const top = y(d.value);
          const h = H - pad.b - top;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.day} className="chart__bar" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              {d.value > 0 && (
                <path
                  d={`M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - pad.b} Z`}
                  className="chart__mark"
                />
              )}
              {i % tickEvery === 0 && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="chart__axis">
                  {d.day.slice(8, 10)}.{d.day.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
        {hover !== null &&
          (() => {
            const d = data[hover];
            const x = pad.l + hover * slot + slot / 2;
            const tipX = Math.min(Math.max(x, 72), W - 72);
            return (
              <g className="chart__tip" pointerEvents="none">
                <rect x={tipX - 70} y={2} width={140} height={22} rx={3} />
                <text x={tipX} y={17} textAnchor="middle">
                  {d.day.slice(8, 10)}.{d.day.slice(5, 7)} · {format(d.value)}
                </text>
              </g>
            );
          })()}
      </svg>
      <details className="chart__table">
        <summary className="small muted">Таблица</summary>
        <table className="table">
          <tbody>
            {data
              .filter((d) => d.value)
              .map((d) => (
                <tr key={d.day}>
                  <td>{d.day.split("-").reverse().join(".")}</td>
                  <td>{format(d.value)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
