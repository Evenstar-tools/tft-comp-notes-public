"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompTrendModel, TrendDiscovery, TrendPoint, TrendTrack } from "@/domain/comp-trends";
import "./comp-trend-panel.css";

const tftableUrl = "https://tftable.cc/meta";
const metrics = [
  ["mean", "平均排名"],
  ["pickRate", "出场率"],
  ["topFourRate", "前四率"],
  ["winRate", "登顶率"],
] as const;
type Metric = (typeof metrics)[number][0];
type Observation = { time: number; day: number; points: Map<string, TrendPoint>; values: Record<string, number> };
type PlotLine = { key: string; trackId: string; name: string; color: string; dash?: string };
const number = new Intl.NumberFormat("zh-CN");
const date = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
});
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

function selectTracks(tracks: TrendTrack[], filter: string, latest?: string) {
  if (filter === "up") return tracks.filter(track => (track.delta ?? 0) < 0)
    .sort((a, b) => a.delta! - b.delta!).slice(0, 10);
  if (filter === "down") return tracks.filter(track => (track.delta ?? 0) > 0)
    .sort((a, b) => b.delta! - a.delta!).slice(0, 10);
  if (filter === "recommended") return tracks.filter(track => track.recommended).slice(0, 6);
  const cost = filter.startsWith("cost:") ? Number(filter.slice(5)) : undefined;
  return tracks.filter(track => track.points.at(-1)?.at === latest && (cost === undefined || track.cost === cost)).slice(0, 10);
}

function makePlot(days: string[], tracks: TrendTrack[], metric: Metric) {
  const observations = new Map<number, Observation>(days.map(at => {
    const time = Date.parse(at);
    const day = Date.parse(at.slice(0, 10) + "T00:00:00Z");
    return [time, { time, day, points: new Map(), values: {} }];
  }));
  const lines: PlotLine[] = [];
  for (const [index, track] of tracks.entries()) {
    const segmentKeys = new Map<string, string>();
    const color = trackColors[index % trackColors.length];
    for (const point of track.points) {
      const row = observations.get(Date.parse(point.at))!;
      row.points.set(track.id, point);
      const value = pointValue(point, metric);
      if (value === null) continue;
      const segment = point.segment ?? "";
      let key = segmentKeys.get(segment);
      if (!key) {
        key = "s" + index + "_" + segmentKeys.size;
        segmentKeys.set(segment, key);
        lines.push({ key, trackId: track.id, color, name: track.name, dash: index >= 8 ? "5 3" : undefined });
      }
      row.values[key] = value;
    }
  }
  return { rows: [...observations.values()].sort((a, b) => a.time - b.time), lines };
}

function sampledTicks(rows: Observation[]) {
  const count = Math.min(5, rows.length);
  if (count < 2) return rows.map(row => row.day);
  return Array.from({ length: count }, (_, index) => rows[Math.round(index * (rows.length - 1) / (count - 1))].day);
}

function plotScale(rows: Observation[], metric: Metric, focused?: string): { domain: [number, number]; ticks: number[] } {
  const values = rows.flatMap(row => {
    if (!focused) return Object.values(row.values);
    const point = row.points.get(focused);
    const value = point && pointValue(point, metric);
    return value == null ? [] : [value];
  });
  if (focused && !values.length) return plotScale(rows, metric);
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

function TrendTooltip({ row, tracks, metric, focused }: {
  row?: Observation; tracks: TrendTrack[]; metric: Metric; focused?: string;
}) {
  if (!row?.points.size) return null;
  const present = tracks.filter(track => {
    const point = row.points.get(track.id);
    return point && pointValue(point, metric) !== null;
  });
  const picked = present.find(track => track.id === focused);
  const shown = picked ? [picked] : present.slice(0, 4);
  const sample = shown.length ? row.points.get(shown[0].id) : undefined;
  return <div className="comp-trend-tooltip">
    <strong>{dateTime.format(row.time)} UTC</strong>
    {metric === "pickRate" && sample?.totalFinishes != null && <small>
      {sample.patch} · {number.format(sample.totalFinishes)} 条玩家结算
    </small>}
    {!present.length && <small>这批缺少可核对的出场率</small>}
    {shown.map(track => {
      const point = row.points.get(track.id)!;
      return <div key={track.id} className="comp-trend-tooltip-row">
        <span>{track.name}</span>
        <b>{valueLabel(pointValue(point, metric), metric)}</b>
        <small>{metric === "pickRate" ? number.format(point.games) + " 条" : point.patch + " · " + pointSampleLabel(point, metric)}</small>
      </div>;
    })}
    {!picked && present.length > shown.length && <small>另有 {present.length - shown.length} 套</small>}
  </div>;
}

function DiscoveryCard({ item }: { item: TrendDiscovery }) {
  const external = item.href?.startsWith("https://");
  const Icon = external ? ArrowUpRight : ChevronRight;
  return <li className="comp-trend-discovery">
    <div className="comp-trend-discovery-meta">
      <span data-kind={item.kind}>{item.kind === "新阵容" ? "新阵容线索" : item.kind}</span>
      <time dateTime={item.at} title={dateTime.format(new Date(item.at)) + " UTC"}>{date.format(new Date(item.at))}</time>
    </div>
    <h4>{item.href ? <a href={item.href} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>{item.name}<Icon size={13} aria-hidden="true" /></a> : item.name}</h4>
    <p>{item.note.replace("尚未关联攻略，核对是否补变阵", "未关联攻略")}</p>
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
  const [selectedTime, setSelectedTime] = useState<number>();
  const ranked = model.tracks;
  const hasRecommendations = ranked.some(track => track.recommended);
  const activeFilter = filter === "recommended" && !hasRecommendations ? "top" : filter;
  const latest = model.days.at(-1);
  const visible = useMemo(() => selectTracks(ranked, activeFilter, latest), [ranked, activeFilter, latest]);
  const pinned = visible.find(track => track.id === focused);
  const waitingForComparison = (activeFilter === "up" || activeFilter === "down") &&
    !ranked.some(track => track.delta !== undefined);
  const { rows, lines } = useMemo(() => makePlot(model.days, visible, metric), [model.days, visible, metric]);
  const scale = useMemo(() => plotScale(rows, metric, pinned?.id), [rows, metric, pinned?.id]);
  const activeRow = rows.find(row => row.time === selectedTime) ?? rows.at(-1);
  const start = rows[0]?.time;
  const end = rows.at(-1)?.time;
  const timing: [number, number] = start === end && start !== undefined
    ? [rows[0].day - 43_200_000, rows[0].day + 43_200_000] : [rows[0]?.day ?? 0, rows.at(-1)?.day ?? 1];
  const patchMarks = model.patches.filter(patch => {
    const time = Date.parse(patch.at);
    return start !== undefined && end !== undefined && time >= start && time <= end;
  });
  const pinnedPoint = pinned && activeRow?.points.get(pinned.id);
  const costs = [...new Set(ranked.flatMap(track => track.cost ? [track.cost] : []))].sort((a, b) => a - b);
  function onFilter(value: string) {
    setFilter(value);
    setFocused(undefined);
  }

  return <section className="comp-trend-panel" id="comp-trends" aria-labelledby={id + "-title"}>
    <header className="comp-trend-header">
      <div>
        <h2 id={id + "-title"}>阵容强度趋势</h2>
        <p>{model.scope} · UTC</p>
      </div>
      <a className="comp-trend-credit" href={tftableUrl} target="_blank" rel="noopener">
        去 TFTable 看版本环境 <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </header>
    {ranked.length > 0 && <div className="comp-trend-controls">
      <div role="group" aria-label="趋势指标" className="comp-trend-metrics">
        {metrics.map(([key, label]) => <button type="button" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}
      </div>
      <select className="comp-trend-filter" aria-label="趋势阵容范围" value={activeFilter}
        onChange={event => onFilter(event.target.value)}>
        <option value="top">Top 10（最新均名）</option>
        {hasRecommendations && <option value="recommended">本版推荐</option>}
        <option value="up">均名走强</option>
        <option value="down">均名走弱</option>
        {costs.length > 0 && <optgroup label="主 C 费用">{costs.map(cost => <option key={cost} value={"cost:" + cost}>{cost} 费主 C</option>)}</optgroup>}
      </select>
    </div>}
    {lines.length > 0 ?
      <div className="comp-trend-body">
        <div className="comp-trend-plot">
          <p className="comp-trend-axis">{metric === "mean" ? "平均排名 · 越靠上越强" : metric === "pickRate" ? "占同批全部玩家结算的比例" : "比率越高越好"}
            {pinned && <span> · 纵轴按{pinned.name}缩放</span>}
          </p>
          <div className="comp-trend-canvas">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 320 }}>
              <LineChart data={rows} margin={{ top: 12, right: 22, bottom: 4, left: 0 }} accessibilityLayer
                onClick={({ activeLabel }) => {
                  const row = rows.find(entry => entry.day === Number(activeLabel));
                  if (row) setSelectedTime(row.time);
                }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 4" />
                <XAxis type="number" dataKey="day" domain={timing} ticks={sampledTicks(rows)} tickFormatter={time => date.format(time)}
                  tickLine={false} axisLine={false} tickMargin={8} minTickGap={10} tick={{ fontSize: 12, fill: "var(--muted)" }} />
                <YAxis reversed={metric === "mean"} domain={scale.domain} ticks={scale.ticks} allowDataOverflow width={45}
                  tickFormatter={value => metric === "mean" ? Number(value).toFixed(2) : value + "%"} tickLine={false} axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted)" }} />
                {activeRow && <ReferenceLine x={activeRow.day} stroke="var(--line)" />}
                {patchMarks.map(patch => <ReferenceLine key={patch.at + patch.label} x={patchPosition(Date.parse(patch.at), rows)}
                  stroke="var(--gold)" strokeOpacity={0.7} strokeDasharray="4 4"
                  label={{ value: patch.label.split(" ")[0], position: "insideTopLeft", fill: "var(--muted)", fontSize: 11 }} />)}
                {lines.map(line => <Line key={line.key} type="bumpX" dataKey={"values." + line.key} name={line.name} stroke={line.color}
                  strokeWidth={pinned?.id === line.trackId ? 3 : 2} opacity={pinned && pinned.id !== line.trackId ? 0.24 : 1}
                  strokeDasharray={line.dash} dot={{ r: 3, strokeWidth: 1.5, fill: "var(--panel)" }} activeDot={{ r: 4.5 }}
                  connectNulls={false} isAnimationActive={false} />)}
                <Tooltip cursor={{ stroke: "var(--line)" }} isAnimationActive={false}
                  content={({ active, label }) => active && label !== undefined
                    ? <TrendTooltip row={rows.find(row => row.day === Number(label))} tracks={visible} metric={metric} focused={pinned?.id} />
                    : null} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="comp-trend-legend">
          <div className="comp-trend-legend-heading">
            <span>点选高亮</span>
            <select className="comp-trend-date" aria-label="趋势日期" value={activeRow?.time}
              onChange={event => setSelectedTime(Number(event.target.value))}>
              {rows.map(row => <option key={row.time} value={row.time}>{date.format(row.time)} 快照</option>)}
            </select>
          </div>
          <ul>
            {visible.map((track, index) => {
              const point = activeRow?.points.get(track.id);
              const color = lines.find(line => line.trackId === track.id)?.color ?? trackColors[index % trackColors.length];
              return <li key={track.id} style={{ "--trend-track": color } as CSSProperties}>
                <button type="button" onClick={() => setFocused(pinned?.id === track.id ? undefined : track.id)} aria-pressed={pinned?.id === track.id}>
                  <span className="comp-trend-track-mark" aria-hidden="true" />
                  {track.image && <img src={track.image} width={22} height={22} alt="" loading="lazy" />}
                  <span className="comp-trend-track-name">{track.name}</span>
                  <b title={point ? pointSampleLabel(point, metric) + " · " + point.patch : "当天无样本"}>
                    {point ? valueLabel(pointValue(point, metric), metric) : "—"}
                  </b>
                  {metric === "mean" && activeRow === rows.at(-1) && <Delta value={track.delta} />}
                </button>
              </li>;
            })}
          </ul>
          {pinned && <div className="comp-trend-focused">
            <span>{pinnedPoint ? pinnedPoint.patch + " · " + pointSampleLabel(pinnedPoint, metric) : "当天无样本"}</span>
            {pinned.href && <a href={pinned.href}>查看阵容 <ChevronRight size={13} aria-hidden="true" /></a>}
            {pinnedPoint?.sourceUrl && <a href={pinnedPoint.sourceUrl} target="_blank" rel="noopener">查看数据 <ArrowUpRight size={13} aria-hidden="true" /></a>}
          </div>}
        </div>
      </div>
      : <p className="comp-trend-empty">{waitingForComparison ? "当前补丁还没有两批可比记录。"
        : ranked.length ? metric === "pickRate" ? "当前筛选暂无可核对的出场率。" : "当前筛选暂无可比趋势。"
        : "等待可比较的阵容样本。"}</p>}
      {(patchMarks.length > 0 || model.note) && <div className="comp-trend-caption">
        {patchMarks.length > 0 && <div className="comp-trend-patches"><span>补丁节点</span>
          {patchMarks.map(patch => <span key={patch.at + patch.label}>
            <time dateTime={patch.at} title={dateTime.format(new Date(patch.at)) + " UTC"}>{date.format(new Date(patch.at))}</time>
            {patch.href ? <a href={patch.href}>{patch.label}</a> : patch.label}
          </span>)}
        </div>}
        {model.note && <p>{model.note}</p>}
      </div>}
    <section className="comp-trend-watch" aria-labelledby={id + "-watch"}>
      <h3 id={id + "-watch"}>新阵容与打法变化</h3>
      {model.discoveries.length ? <>
        <ul>{model.discoveries.slice(0, 3).map(item => <DiscoveryCard key={item.id} item={item} />)}</ul>
        {model.discoveries.length > 3 && <details><summary>其余 {model.discoveries.length - 3} 条</summary>
          <ul>{model.discoveries.slice(3).map(item => <DiscoveryCard key={item.id} item={item} />)}</ul>
        </details>}
      </> : <p className="comp-trend-empty">本期暂无已核查的新阵容或打法变化。</p>}
    </section>
  </section>;
}
