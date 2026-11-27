"use client";

import { useMemo, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/domain/comp-trends";

export type Observation = { time: number; day: number; points: Map<string, TrendPoint>; values: Record<string, number> };
export type PlotLine = { key: string; trackId: string; name: string; color: string; pointCount: number; firstDay?: number };

const axisDay = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });

function sampledTicks(rows: Observation[]) {
  const count = Math.min(7, rows.length);
  if (count < 2) return rows.map(row => row.day);
  return Array.from({ length: count }, (_, index) => rows[Math.round(index * (rows.length - 1) / (count - 1))].day);
}

function plotScale(rows: Observation[]): { domain: [number, number]; ticks: number[] } {
  const values = rows.flatMap(row => Object.values(row.values));
  if (!values.length) return { domain: [0, 1], ticks: [0, 1] };
  const low = Math.min(...values), high = Math.max(...values);
  const range = high - low;
  const target = Math.max(range / 5, 0.02);
  const unit = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].map(n => n * unit)
    .reduce((a, b) => Math.abs(a - target) <= Math.abs(b - target) ? a : b);
  const pad = Math.max(range * 0.06, 0.015, (0.08 - range) / 2);
  const domain: [number, number] = [Math.max(0, low - pad), Math.min(1, high + pad)];
  const ticks: number[] = [];
  for (let n = Math.ceil(domain[0] / step - 1e-9); n <= Math.floor(domain[1] / step + 1e-9); n++) {
    ticks.push(Number((n * step).toFixed(4)));
  }
  return { domain, ticks };
}

export function CompTrendChart({ rows, lines, highlighted, activeDay, onSelect, onHover, renderTooltip }: {
  rows: Observation[]; lines: PlotLine[];
  highlighted?: string; activeDay?: number;
  onSelect: (time: number) => void;
  onHover: (trackId: string | undefined) => void;
  renderTooltip: (row?: Observation) => ReactNode;
}) {
  const scale = useMemo(() => plotScale(rows), [rows]);
  const timing: [number, number] = rows.length === 1
    ? [rows[0].day - 43_200_000, rows[0].day + 43_200_000] : [rows[0]?.day ?? 0, rows.at(-1)?.day ?? 1];
  const orderedLines = highlighted ? [...lines.filter(line => line.trackId !== highlighted),
    ...lines.filter(line => line.trackId === highlighted)] : lines;

  return <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 320 }}>
    <LineChart data={rows} margin={{ top: 12, right: 10, bottom: 10, left: 0 }} accessibilityLayer
      onClick={({ activeLabel }) => {
        const row = rows.find(entry => entry.day === Number(activeLabel));
        if (row) onSelect(row.time);
      }}>
      <CartesianGrid vertical={false} stroke="var(--trend-grid)" strokeDasharray="3 4" syncWithTicks />
      <XAxis type="number" dataKey="day" domain={timing} ticks={sampledTicks(rows)} tickFormatter={time => axisDay.format(time)}
        padding={{ left: 10, right: 10 }} height={34} tickMargin={10} minTickGap={5}
        interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: "var(--trend-grid)" }}
        tick={{ fontSize: 12, fill: "var(--muted)" }} />
      <YAxis domain={scale.domain} ticks={scale.ticks} allowDataOverflow width={38}
        tickFormatter={value => Number(value).toFixed(2)}
        tickLine={false} axisLine={false}
        tick={{ fontSize: 12, fill: "var(--muted)" }} />
      {activeDay !== undefined && <ReferenceLine x={activeDay} stroke="var(--line)" />}
      {orderedLines.map(line => {
        const emphasized = highlighted === line.trackId;
        const opacity = highlighted && !emphasized ? 0.14 : 1;
        return <Line key={line.trackId} className="comp-trend-curve" type="monotoneX" dataKey={"values." + line.key} name={line.name} stroke={line.color}
          strokeWidth={emphasized ? 3.4 : 2.25} strokeLinecap="round" opacity={opacity}
          dot={(emphasized || line.pointCount === 1 || line.firstDay !== undefined) ? ({ cx, cy, payload }) => {
            if (cx == null || cy == null || payload.values[line.key] === undefined) return null;
            if (payload.day === line.firstDay) {
              return <g className="comp-trend-start" opacity={opacity}
                onMouseEnter={() => onHover(line.trackId)} onMouseLeave={() => onHover(undefined)}>
                <title>{line.name} · {axisDay.format(payload.day)} 首次收录起点</title>
                <circle cx={cx} cy={cy} r={7.5} fill="var(--panel)" stroke="var(--panel)" strokeWidth={1.5} />
                <circle cx={cx} cy={cy} r={5.4} fill="none" stroke={line.color} strokeWidth={1.8} />
                <circle cx={cx} cy={cy} r={2.3} fill={line.color} />
              </g>;
            }
            if (!emphasized && line.pointCount !== 1) return null;
            return <circle cx={cx} cy={cy} r={3.5} fill={line.color} stroke="var(--panel)" strokeWidth={1.4} opacity={opacity} />;
          } : false}
          activeDot={emphasized ? { r: 4.7, stroke: "var(--panel)", strokeWidth: 1.8 } : false}
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
