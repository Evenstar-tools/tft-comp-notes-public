"use client";

import { useMemo, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendMetric, TrendPatch, TrendPoint } from "@/domain/comp-trends";

export type Observation = { time: number; day: number; points: Map<string, TrendPoint>; values: Record<string, number> };
export type PlotLine = { key: string; trackId: string; name: string; color: string; pointCount: number };

const axisDay = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });

function sampledTicks(rows: Observation[]) {
  const count = Math.min(7, rows.length);
  if (count < 2) return rows.map(row => row.day);
  return Array.from({ length: count }, (_, index) => rows[Math.round(index * (rows.length - 1) / (count - 1))].day);
}

function plotScale(rows: Observation[], metric: TrendMetric): { domain: [number, number]; ticks: number[] } {
  if (metric === "strength") return { domain: [0, 1], ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] };
  const values = rows.flatMap(row => Object.values(row.values));
  if (!values.length) return { domain: [0, 1], ticks: [0, 1] };
  const low = Math.min(...values), high = Math.max(...values);
  const limit = metric === "mean" ? [1, 8] : [0, 100];
  const minimumStep = metric === "mean" ? 0.05 : metric === "pickRate" ? 0.1 : 0.5;
  const target = Math.max((high - low) / 6, minimumStep);
  const unit = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].map(n => n * unit)
    .reduce((a, b) => Math.abs(a - target) <= Math.abs(b - target) ? a : b);
  const pad = Math.max((high - low) * 0.05, minimumStep * 0.35, (minimumStep * 4 - (high - low)) / 2);
  const domain: [number, number] = [Math.max(limit[0], low - pad), Math.min(limit[1], high + pad)];
  const ticks: number[] = [];
  for (let n = Math.ceil(domain[0] / step); n <= Math.floor(domain[1] / step); n++) {
    ticks.push(Number((n * step).toFixed(4)));
  }
  return { domain, ticks };
}

// Project the actual patch time between the snapshots on the daily grid.
function patchPosition(time: number, rows: Observation[]) {
  const next = rows.findIndex(row => row.time >= time);
  if (next <= 0) return rows[0]?.day;
  const left = rows[next - 1], right = rows[next];
  return left.day + (right.day - left.day) * (time - left.time) / (right.time - left.time);
}

export function CompTrendChart({ rows, lines, metric, patchMarks, highlighted, activeDay, onSelect, onHover, renderTooltip }: {
  rows: Observation[]; lines: PlotLine[]; metric: TrendMetric; patchMarks: TrendPatch[];
  highlighted?: string; activeDay?: number;
  onSelect: (time: number) => void;
  onHover: (trackId: string | undefined) => void;
  renderTooltip: (row?: Observation) => ReactNode;
}) {
  const scale = useMemo(() => plotScale(rows, metric), [rows, metric]);
  const start = rows[0]?.time;
  const end = rows.at(-1)?.time;
  const timing: [number, number] = start === end && start !== undefined
    ? [rows[0].day - 43_200_000, rows[0].day + 43_200_000] : [rows[0]?.day ?? 0, rows.at(-1)?.day ?? 1];

  return <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 320 }}>
    <LineChart data={rows} margin={{ top: 12, right: 22, bottom: 4, left: 0 }} accessibilityLayer
      onClick={({ activeLabel }) => {
        const row = rows.find(entry => entry.day === Number(activeLabel));
        if (row) onSelect(row.time);
      }}>
      <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
      <XAxis type="number" dataKey="day" domain={timing} ticks={sampledTicks(rows)} tickFormatter={time => axisDay.format(time)}
        interval="preserveStartEnd" tickLine={false} axisLine={false} tickMargin={8} minTickGap={6}
        tick={{ fontSize: 12, fill: "var(--muted)" }} />
      <YAxis reversed={metric === "mean"} domain={scale.domain} ticks={scale.ticks} allowDataOverflow width={45}
        tickFormatter={value => metric === "strength" ? Number(value).toFixed(1) : metric === "mean" ? Number(value).toFixed(2) : value + "%"}
        tickLine={false} axisLine={false}
        tick={{ fontSize: 12, fill: "var(--muted)" }} />
      {activeDay !== undefined && <ReferenceLine x={activeDay} stroke="var(--line)" />}
      {patchMarks.map(patch => <ReferenceLine key={patch.at + patch.label} x={patchPosition(Date.parse(patch.at), rows)}
        stroke="var(--gold)" strokeOpacity={0.7} strokeDasharray="4 4"
        label={{ value: patch.label.split(" ")[0], position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />)}
      {lines.map(line => {
        const emphasized = highlighted === line.trackId;
        const opacity = highlighted && !emphasized ? 0.28 : 1;
        return <Line key={line.trackId} type="monotoneX" dataKey={"values." + line.key} name={line.name} stroke={line.color}
          strokeWidth={emphasized ? 3.25 : 2} strokeLinecap="round" opacity={opacity}
          dot={line.pointCount === 1 ? { r: 3, fill: line.color, opacity } : false}
          activeDot={{ r: emphasized ? 4.5 : 3.5, opacity }}
          connectNulls isAnimationActive={false} />;
      })}
      {lines.filter(line => line.pointCount > 1).map(line => <Line key={line.trackId + "-hit"} type="monotoneX"
        dataKey={"values." + line.key} stroke="transparent" strokeWidth={12} className="comp-trend-hit"
        tooltipType="none" legendType="none" dot={false} activeDot={false} connectNulls isAnimationActive={false}
        onMouseEnter={() => onHover(line.trackId)} onMouseLeave={() => onHover(undefined)} />)}
      <Tooltip cursor={{ stroke: "var(--muted)", strokeOpacity: 0.6, strokeDasharray: "3 3" }} isAnimationActive={false}
        content={({ active, label }) => renderTooltip(active ? rows.find(row => row.day === Number(label)) : undefined)} />
    </LineChart>
  </ResponsiveContainer>;
}
