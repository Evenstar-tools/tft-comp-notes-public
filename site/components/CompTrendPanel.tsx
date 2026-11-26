"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import type { Observation, PlotLine } from "./CompTrendChart";
import { selectTrendWindow, type CompTrendModel, type TrendDiscovery, type TrendMetric, type TrendPoint, type TrendTrack } from "@/domain/comp-trends";
import { beijingDateTime } from "@/lib/beijing-time";
import "./comp-trend-panel.css";

const CompTrendChart = dynamic(() => import("./CompTrendChart").then(module => module.CompTrendChart), { ssr: false });
const tftableUrl = "https://tftable.cc/meta";
const metrics = {
  strength: "综合表现",
  mean: "均名",
  winShare: "登顶占比",
  top4Share: "前四占比",
  pickRate: "出场率",
} satisfies Record<TrendMetric, string>;
const metricKeys = Object.keys(metrics) as TrendMetric[];
const number = new Intl.NumberFormat("zh-CN");
const archiveDay = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "UTC" });
const beijingDay = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "Asia/Shanghai" });
const trackColors = [
  "var(--trend-gold)", "var(--trend-blue)", "var(--trend-green)", "var(--trend-purple)", "var(--trend-red)",
  "var(--trend-cyan)", "var(--trend-pink)", "var(--trend-gray)", "var(--trend-olive)", "var(--trend-indigo)",
];

function pointValue(point: TrendPoint, metric: TrendMetric) {
  const value = point[metric];
  return value === null ? null : metric === "mean" || metric === "strength" ? value : 100 * value;
}

function valueLabel(value: number | null, metric: TrendMetric) {
  if (value === null) return "—";
  return value.toFixed(2) + (metric === "mean" || metric === "strength" ? "" : "%");
}

function pointSampleLabel(point: TrendPoint, metric: TrendMetric) {
  if (metric !== "pickRate") return number.format(point.games) + " 场";
  if (point.pickRate === null || point.totalFinishes == null) return "缺少同批分母";
  return number.format(point.games) + " / " + number.format(point.totalFinishes) + " 条玩家结算";
}

function makePlot(days: string[], tracks: TrendTrack[], metric: TrendMetric) {
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
    let pointCount = 0;
    for (const point of track.points) {
      const row = observations.get(Date.parse(point.at));
      if (!row) continue;
      row.points.set(track.id, point);
      const value = pointValue(point, metric);
      if (value === null) continue;
      row.values[key] = value;
      pointCount += 1;
    }
    if (pointCount) lines.push({ key, trackId: track.id, color, name: track.name, pointCount });
  }
  return { rows: [...observations.values()].sort((a, b) => a.time - b.time), lines, colors };
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

function trendReadout(tracks: TrendTrack[], row: Observation | undefined, metric: TrendMetric) {
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
  row?: Observation; tracks: TrendTrack[]; metric: TrendMetric; colors: Map<string, string>; focused?: string;
  onPreview: (time: number | undefined) => void;
}) {
  const time = row?.time;
  useEffect(() => {
    onPreview(time);
    return () => onPreview(undefined);
  }, [time, onPreview]);

  if (!row) return null;
  return <div className="comp-trend-tooltip">
    <strong>{archiveDay.format(row.day)} · {metrics[metric]}</strong>
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
  const [metric, setMetric] = useState<TrendMetric>("strength");
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
  const highlighted = hovered ?? pinned?.id;
  const activeRow = rows.find(row => row.time === selectedTime) ?? rows.at(-1);
  const readoutRow = rows.find(row => row.time === previewTime) ?? activeRow;
  const start = rows[0]?.time;
  const end = rows.at(-1)?.time;
  const patchMarks = model.patches.filter(patch => {
    const time = Date.parse(patch.at);
    return start !== undefined && end !== undefined && time >= start && time <= end;
  });
  const pinnedPoint = pinned && readoutRow?.points.get(pinned.id);
  const metricLabel = metrics[metric];
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
          {metricKeys.map(key => <button type="button" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{metrics[key]}</button>)}
        </div>
        <select className="comp-trend-filter" aria-label="筛选趋势阵容" value={activeFilter}
          onChange={event => onFilter(event.target.value)}>
          <option value="top">{metricLabel} Top 10</option>
          {hasRecommendations && <option value="recommended">本版推荐</option>}
          <option value="up">上升趋势</option>
          <option value="down">下降趋势</option>
          {costs.length > 0 && <optgroup label="主 C 费用">{costs.map(cost => <option key={cost} value={"cost:" + cost}>{cost === 5 ? "5 费及以上" : cost + " 费"}主 C</option>)}</optgroup>}
        </select>
      </div>}
      <div className="comp-trend-sources">
        <details className="comp-trend-method">
          <summary>口径与来源</summary>
          <div>
            <p>{model.scope} · 按世界协调时归日</p>
            {model.note && <p>{model.note}</p>}
            <p>占比使用当日全部有效收录阵容（至少 100 场、名次与比率有效）。同批同体系的相同样本只计一次，图表筛选不改变分母。</p>
            <dl>
              <dt>登顶占比</dt><dd>登顶数 = 场数 × 登顶率。占比 = 本阵容登顶数 ÷ 当日总登顶数。</dd>
              <dt>前四占比</dt><dd>前四数 = 场数 × 前四率。占比 = 本阵容前四数 ÷ 当日总前四数。</dd>
              <dt>综合表现</dt><dd>登顶、前四归一值各为（本阵容占比 ÷ 当日最高对应占比）<sup>0.65</sup>。均名归一值 = (5 − 均名) ÷ (5 − 3)，限制在 0～1。得分 = 35% × 登顶归一值 + 30% × 前四归一值 + 35% × 均名归一值，限制在 0～1。对应总数为零时，占比留空，该项归一值计 0。</dd>
              <dt>出场率</dt><dd>场数 ÷ 同批玩家结算数。</dd>
            </dl>
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
            <CompTrendChart rows={rows} lines={lines} metric={metric} patchMarks={patchMarks}
              highlighted={highlighted} activeDay={previewTime === undefined ? activeRow?.day : undefined}
              onSelect={setSelectedTime} onHover={setHovered}
              renderTooltip={row => <TrendTooltip row={row} tracks={visible} metric={metric}
                colors={colors} focused={highlighted} onPreview={setPreviewTime} />} />
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
        : ranked.length ? "当前筛选暂无" + metricLabel + "数据"
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
