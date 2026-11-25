"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { selectTrendWindow, type CompTrendModel, type TrendDiscovery, type TrendPoint, type TrendTrack } from "@/domain/comp-trends";
import { beijingDateTime } from "@/lib/beijing-time";
import "./comp-trend-panel.css";

const tftableUrl = "https://tftable.cc/meta";
const metrics = [
  ["mean", "均名"],
  ["pickRate", "出场率"],
  ["topFourRate", "前四率"],
  ["winRate", "登顶率"],
] as const;
type Metric = (typeof metrics)[number][0];
type Observation = { time: number; day: number; points: Map<string, TrendPoint>; values: Record<string, number> };
type PlotLine = { key: string; trackId: string; name: string; color: string };
const number = new Intl.NumberFormat("zh-CN");
const archiveDay = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "UTC" });
const beijingDay = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "Asia/Shanghai" });
const trackColors = [
  "var(--trend-gold)", "var(--trend-blue)", "var(--trend-green)", "var(--trend-purple)", "var(--trend-red)",
  "var(--trend-cyan)", "var(--trend-pink)", "var(--trend-gray)", "var(--trend-olive)", "var(--trend-indigo)",
];

function pointValue(point: TrendPoint, metric: Metric) {
  const value = point[metric];
  return value === null ? null : metric === "mean" ? value : 100 * value;
}

function valueLabel(value: number | null, metric: Metric) {
  if (value === null) return "—";
  if (metric === "mean") return value.toFixed(2);
  return value.toFixed(metric === "pickRate" ? 2 : 1) + "%";
}

function pointSampleLabel(point: TrendPoint, metric: Metric) {
  if (metric !== "pickRate") return number.format(point.games) + " 场";
  if (point.pickRate === null || point.totalFinishes == null) return "缺少同批分母";
  return number.format(point.games) + " / " + number.format(point.totalFinishes) + " 条玩家结算";
}

function makePlot(days: string[], tracks: TrendTrack[], metric: Metric) {
  const observations = new Map<number, Observation>(days.map(at => {
    const time = Date.parse(at);
    const day = Date.parse(at.slice(0, 10) + "T00:00:00Z");
    return [time, { time, day, points: new Map(), values: {} }];
  }));
  const lines: PlotLine[] = [];
  const colors = new Map<string, string>();
  for (const [index, track] of tracks.entries()) {
    const key = "s" + index;
    const color = trackColors[index % trackColors.length];
    colors.set(track.id, color);
    let hasValue = false;
    for (const point of track.points) {
      const row = observations.get(Date.parse(point.at));
      if (!row) continue;
      row.points.set(track.id, point);
      const value = pointValue(point, metric);
      if (value === null) continue;
      row.values[key] = value;
      hasValue = true;
    }
    if (hasValue) lines.push({ key, trackId: track.id, color, name: track.name });
  }
  return { rows: [...observations.values()].sort((a, b) => a.time - b.time), lines, colors };
}

function sampledTicks(rows: Observation[]) {
  const count = Math.min(7, rows.length);
  if (count < 2) return rows.map(row => row.day);
  return Array.from({ length: count }, (_, index) => rows[Math.round(index * (rows.length - 1) / (count - 1))].day);
}

function plotScale(rows: Observation[], metric: Metric): { domain: [number, number]; ticks: number[] } {
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

function Delta({ value }: { value?: number }) {
  const rounded = Number(value?.toFixed(2) ?? 0);
  if (!rounded) return null;
  const label = rounded < 0 ? "走强" : "走弱";
  const Icon = rounded < 0 ? ArrowUpRight : ArrowDownRight;
  return <span className="comp-trend-delta" data-direction={rounded < 0 ? "up" : "down"} title={label}>
    <Icon size={12} aria-hidden="true" /><span className="sr-only">{label} </span>{Math.abs(rounded).toFixed(2)}
  </span>;
}

function trendReadout(tracks: TrendTrack[], row: Observation | undefined, metric: Metric) {
  const direction = metric === "mean" ? 1 : -1;
  return tracks.map(track => {
    const point = row?.points.get(track.id);
    return { track, point, value: point ? pointValue(point, metric) : null };
  }).sort((a, b) => {
    if (a.value === null) return b.value === null ? 0 : 1;
    return b.value === null ? -1 : direction * (a.value - b.value);
  });
}

function TrendTooltip({ row, tracks, metric, colors, focused, onPreview }: {
  row?: Observation; tracks: TrendTrack[]; metric: Metric; colors: Map<string, string>; focused?: string;
  onPreview: (time: number | undefined) => void;
}) {
  const time = row?.time;
  useEffect(() => {
    onPreview(time);
    return () => onPreview(undefined);
  }, [time, onPreview]);

  if (!row) return null;
  return <div className="comp-trend-tooltip">
    <strong>{archiveDay.format(row.day)}</strong>
    <ul>{trendReadout(tracks, row, metric).map(({ track, value }) =>
      <li key={track.id} className="comp-trend-tooltip-row" data-focused={track.id === focused || undefined}>
        <span className="comp-trend-track-mark" style={{ "--trend-track": colors.get(track.id) } as CSSProperties} aria-hidden="true" />
        <span>{track.name}</span>
        <b>{valueLabel(value, metric)}</b>
      </li>)}</ul>
  </div>;
}

function DiscoveryCard({ item }: { item: TrendDiscovery }) {
  const external = item.href?.startsWith("https://");
  const Icon = external ? ArrowUpRight : ChevronRight;
  return <li className="comp-trend-discovery">
    <h4>{item.href ? <a href={item.href} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>{item.name}<Icon size={13} aria-hidden="true" /></a> : item.name}</h4>
    <p>{[item.reason, item.status].filter(Boolean).join(" · ")}</p>
    {(typeof item.games === "number" || typeof item.mean === "number") && <small>
      {typeof item.mean === "number" && "均名 " + item.mean.toFixed(2)}
      {typeof item.mean === "number" && typeof item.games === "number" && " · "}
      {typeof item.games === "number" && number.format(item.games) + " 场"}
    </small>}
  </li>;
}

export function CompTrendPanel({ model }: { model: CompTrendModel }) {
  const id = useId();
  const [metric, setMetric] = useState<Metric>("mean");
  const [filter, setFilter] = useState("top");
  const [focused, setFocused] = useState<string>();
  const [hovered, setHovered] = useState<string>();
  const [selectedTime, setSelectedTime] = useState<number>();
  const [previewTime, setPreviewTime] = useState<number>();
  const ranked = model.tracks;
  const discoveryGroups = new Map<string, TrendDiscovery[]>();
  for (const item of model.discoveries) {
    const key = item.at.slice(0, 10) + "|" + item.patch;
    const items = discoveryGroups.get(key);
    if (items) items.push(item);
    else discoveryGroups.set(key, [item]);
  }
  const hasRecommendations = ranked.some(track => track.recommended);
  const activeFilter = filter === "recommended" && !hasRecommendations ? "top" : filter;
  const { tracks: visible, days } = useMemo(() => selectTrendWindow(ranked, activeFilter, model.days, metric), [ranked, activeFilter, model.days, metric]);
  const pinned = visible.find(track => track.id === focused);
  const waitingForComparison = (activeFilter === "up" || activeFilter === "down") &&
    !ranked.some(track => track.points.length > 1);
  const { rows, lines, colors } = useMemo(() => makePlot(days, visible, metric), [days, visible, metric]);
  const scale = useMemo(() => plotScale(rows, metric), [rows, metric]);
  const highlighted = hovered ?? pinned?.id;
  const activeRow = rows.find(row => row.time === selectedTime) ?? rows.at(-1);
  const readoutRow = rows.find(row => row.time === previewTime) ?? activeRow;
  const start = rows[0]?.time;
  const end = rows.at(-1)?.time;
  const timing: [number, number] = start === end && start !== undefined
    ? [rows[0].day - 43_200_000, rows[0].day + 43_200_000] : [rows[0]?.day ?? 0, rows.at(-1)?.day ?? 1];
  const patchMarks = model.patches.filter(patch => {
    const time = Date.parse(patch.at);
    return start !== undefined && end !== undefined && time >= start && time <= end;
  });
  const pinnedPoint = pinned && readoutRow?.points.get(pinned.id);
  const metricLabel = metrics.find(([key]) => key === metric)?.[1];
  const showDelta = metric === "mean" && readoutRow === rows.at(-1) && visible.some(track => Number(track.delta?.toFixed(2)));
  const costs = [...new Set(ranked.flatMap(track => track.cost ? [Math.min(5, track.cost)] : []))].sort((a, b) => a - b);
  function onFilter(value: string) {
    setFilter(value);
    setFocused(undefined);
    setHovered(undefined);
  }

  return <section className="comp-trend-panel" id="comp-trends" aria-labelledby={id + "-title"}>
    <header className="comp-trend-header">
      <h2 id={id + "-title"}>阵容趋势</h2>
      {ranked.length > 0 && <div className="comp-trend-controls">
        <div role="group" aria-label="趋势指标" className="comp-trend-metrics">
          {metrics.map(([key, label]) => <button type="button" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}
        </div>
        <select className="comp-trend-filter" aria-label="筛选趋势阵容" value={activeFilter}
          onChange={event => onFilter(event.target.value)}>
          <option value="top">最新均名前十</option>
          {hasRecommendations && <option value="recommended">本版推荐</option>}
          <option value="up">均名走强</option>
          <option value="down">均名走弱</option>
          {costs.length > 0 && <optgroup label="主 C 费用">{costs.map(cost => <option key={cost} value={"cost:" + cost}>{cost === 5 ? "5 费及以上" : cost + " 费"}主 C</option>)}</optgroup>}
        </select>
      </div>}
      <div className="comp-trend-sources">
        <details className="comp-trend-method">
          <summary>口径与来源</summary>
          <div>
            <p>{model.scope} · 按世界协调时归日</p>
            {model.note && <p>{model.note}</p>}
            <p><a className="comp-trend-credit" href={tftableUrl} target="_blank" rel="noopener">
              TFTable 环境对照 <ArrowUpRight size={13} aria-hidden="true" />
            </a></p>
          </div>
        </details>
      </div>
    </header>
    {lines.length > 0 ?
      <div className="comp-trend-body">
        <div className="comp-trend-plot">
          <div className="comp-trend-canvas">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 320 }}>
              <LineChart data={rows} margin={{ top: 12, right: 22, bottom: 4, left: 0 }} accessibilityLayer
                onClick={({ activeLabel }) => {
                  const row = rows.find(entry => entry.day === Number(activeLabel));
                  if (row) setSelectedTime(row.time);
                }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                <XAxis type="number" dataKey="day" domain={timing} ticks={sampledTicks(rows)} tickFormatter={time => archiveDay.format(time)}
                  tickLine={false} axisLine={false} tickMargin={8} minTickGap={10} tick={{ fontSize: 12, fill: "var(--muted)" }} />
                <YAxis reversed={metric === "mean"} domain={scale.domain} ticks={scale.ticks} allowDataOverflow width={45}
                  tickFormatter={value => metric === "mean" ? Number(value).toFixed(2) : value + "%"} tickLine={false} axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted)" }} />
                {activeRow && previewTime === undefined && <ReferenceLine x={activeRow.day} stroke="var(--line)" />}
                {patchMarks.map(patch => <ReferenceLine key={patch.at + patch.label} x={patchPosition(Date.parse(patch.at), rows)}
                  stroke="var(--gold)" strokeOpacity={0.7} strokeDasharray="4 4"
                  label={{ value: patch.label.split(" ")[0], position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />)}
                {lines.map(line => {
                  const emphasized = highlighted === line.trackId;
                  const opacity = highlighted && !emphasized ? 0.28 : 1;
                  return <Line key={line.trackId} type={rows.length === 2 ? "bumpX" : "monotoneX"} dataKey={"values." + line.key} name={line.name} stroke={line.color}
                    strokeWidth={emphasized ? 3.25 : 2} strokeLinecap="round" opacity={opacity}
                    dot={rows.length === 1 ? { r: 3 } : false}
                    activeDot={{ r: emphasized ? 4.5 : 3.5, opacity }}
                    connectNulls isAnimationActive={false} />;
                })}
                {rows.length > 1 && lines.map(line => <Line key={line.trackId + "-hit"} type={rows.length === 2 ? "bumpX" : "monotoneX"}
                  dataKey={"values." + line.key} stroke="transparent" strokeWidth={12} className="comp-trend-hit"
                  tooltipType="none" legendType="none" dot={false} activeDot={false} connectNulls isAnimationActive={false}
                  onMouseEnter={() => setHovered(line.trackId)} onMouseLeave={() => setHovered(undefined)} />)}
                <Tooltip cursor={{ stroke: "var(--muted)", strokeOpacity: 0.6, strokeDasharray: "3 3" }} isAnimationActive={false}
                  content={({ active, label }) => <TrendTooltip
                    row={active ? rows.find(row => row.day === Number(label)) : undefined}
                    tracks={visible} metric={metric} colors={colors} focused={highlighted} onPreview={setPreviewTime} />} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="comp-trend-legend">
          <div className="comp-trend-legend-heading" data-preview={previewTime !== undefined || undefined}>
            <select className="comp-trend-date" aria-label="趋势日期" value={readoutRow?.time}
              onChange={event => setSelectedTime(Number(event.target.value))}>
              {rows.map(row => <option key={row.time} value={row.time}>{archiveDay.format(row.day)}</option>)}
            </select>
            <span>{metricLabel}</span>
          </div>
          <ul className="comp-trend-readings" data-delta={showDelta || undefined}>
            {trendReadout(visible, readoutRow, metric).map(({ track, point, value }) => {
              return <li key={track.id} style={{ "--trend-track": colors.get(track.id) } as CSSProperties}>
                <button type="button" onClick={() => setFocused(pinned?.id === track.id ? undefined : track.id)}
                  onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(track.id); }}
                  onPointerLeave={() => setHovered(undefined)}
                  onFocus={event => { if (event.currentTarget.matches(":focus-visible")) setHovered(track.id); }}
                  onBlur={() => setHovered(undefined)}
                  aria-pressed={pinned?.id === track.id} data-highlighted={highlighted === track.id || undefined}>
                  <span className="comp-trend-track-mark" aria-hidden="true" />
                  <span className="comp-trend-track-avatar" aria-hidden="true">
                    {track.image && <img src={track.image} width={24} height={24} alt="" loading="lazy" />}
                  </span>
                  <span className="comp-trend-track-name" title={point?.board?.name ?? track.name}>{track.name}</span>
                  <small className="comp-trend-track-cost">{track.cost !== undefined && track.cost + "费"}</small>
                  {showDelta && <span className="comp-trend-track-change"><Delta value={track.delta} /></span>}
                  <b title={point ? pointSampleLabel(point, metric) + " · " + point.patch : "当天无样本"}>
                    {valueLabel(value, metric)}
                  </b>
                </button>
              </li>;
            })}
          </ul>
          {pinned && <div className="comp-trend-focused" style={{ "--trend-track": colors.get(pinned.id) } as CSSProperties}>
            <strong>{pinnedPoint?.board?.name ?? pinned.name}</strong>
            <span>{pinnedPoint ? pinnedPoint.patch + " · " + pointSampleLabel(pinnedPoint, metric)
              : "当天无样本"}</span>
            {pinned.href && <a href={pinnedPoint?.board?.href ?? pinned.href}>查看阵容 <ChevronRight size={13} aria-hidden="true" /></a>}
            {pinnedPoint?.sourceUrl && <a href={pinnedPoint.sourceUrl} target="_blank" rel="noopener">查看数据 <ArrowUpRight size={13} aria-hidden="true" /></a>}
          </div>}
        </div>
      </div>
      : <p className="comp-trend-empty">{waitingForComparison ? "至少需两天可比样本"
        : ranked.length ? metric === "pickRate" ? "当前筛选暂无出场率" : "当前筛选暂无可比趋势"
        : "暂无可比样本"}</p>}
      {patchMarks.length > 0 && <div className="comp-trend-caption">
        <div className="comp-trend-patches" aria-label="补丁节点">
          {patchMarks.map(patch => <span key={patch.at + patch.label}>
            <time dateTime={patch.at} title={beijingDateTime.format(new Date(patch.at)) + " 北京时间"}>{beijingDay.format(new Date(patch.at))}</time>
            {patch.href ? <a href={patch.href}>{patch.label.split(" ")[0]}</a> : patch.label.split(" ")[0]}
          </span>)}
        </div>
      </div>}
    {model.discoveries.length > 0 && <details className="comp-trend-watch">
      <summary><span>阵容线索</span><span>{model.discoveries.length} 条</span></summary>
      {[...discoveryGroups].map(([key, items]) => {
        const { at, patch } = items[0];
        return <section key={key} className="comp-trend-discovery-group">
          <h3><time dateTime={at.slice(0, 10)}>{archiveDay.format(new Date(at))}</time><span>{patch}</span></h3>
          <ul>{items.map(item => <DiscoveryCard key={item.id} item={item} />)}</ul>
        </section>;
      })}
    </details>}
  </section>;
}
