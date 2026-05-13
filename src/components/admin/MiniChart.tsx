"use client";

import { useMemo } from "react";

type MiniChartProps = {
  points: number[];
};

/** Línea mínima (misma lógica que gestión financiera admin). */
export function MiniChart({ points }: MiniChartProps) {
  if (points.length === 0) return null;

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const w = 200;
  const h = 64;
  const padding = 4;

  const pathD = useMemo(() => {
    const xs = points.map(
      (_, i) => padding + (i / Math.max(points.length - 1, 1)) * (w - 2 * padding)
    );
    const ys = points.map((v) => h - padding - ((v - min) / range) * (h - 2 * padding));
    return xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ");
  }, [points, min, range, w, h, padding]);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${w} ${h}`}
      className="gf-mini-chart-svg"
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
