"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import type { Observation, PlotLine } from "./CompTrendChart";
import { selectTrendWindow, type CompTrendModel, type TrendDiscovery, type TrendTrack } from "@/domain/comp-trends";
import { beijingDateTime } from "@/lib/beijing-time";
import "./comp-trend-panel.css";

const CompTrendChart = dynamic(() => import("./CompTrendChart").then(module => module.CompTrendChart), {
  ssr: false,
  loading: () => <p className="comp-trend-loading" role="status">正在加载趋势图…</p>,
});
const tftableUrl = "https://tftable.cc/meta";
const number = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 });
const archiveDay = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "UTC" });
const beijingDay = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "Asia/Shanghai" });
const trackColors = [
  "var(--trend-red)", "var(--trend-blue)", "var(--trend-gold)", "var(--trend-purple)", "var(--trend-green)",
  "var(--trend-orange)", "var(--trend-pink)", "var(--trend-gray)", "var(--trend-brown)", "var(--trend-cyan)",
];

function makePlot(days: string[], tracks: TrendTrack[]) {
  const observations = new Map<number, Observation>(days.map(at => {
    const time = Date.parse(at);
    const day = Math.floor(time / 86_400_000) * 86_400_000;
    return [time, { time, day, points: new Map(), values: {} }];
  }));
  const lines: PlotLine[] = [];
  const colors = new Map<string, string>();
  const chartStart = Date.parse(days[0]);
  for (const [index, track] of tracks.entries()) {
    const key = "s" + index;
    const color = trackColors[index];
    colors.set(track.id, color);
    let pointCount = 0;
    let firstDay: number | undefined;
    const firstTime = Date.parse(track.points[0].at);
    for (const point of track.points) {
      const row = observations.get(Date.parse(point.at));
      if (!row) continue;
      row.points.set(track.id, point);
      row.values[key] = point.strength;
      if (row.time === firstTime && firstTime > chartStart) firstDay = row.day;
      pointCount += 1;
    }
    if (pointCount) lines.push({ key, trackId: track.id, color, name: track.name, pointCount, firstDay });
  }
  return { rows: [...observations.values()].sort((a, b) => a.time - b.time), lines, colors };
}

function trendReadout(tracks: TrendTrack[], row: Observation | undefined) {
  return tracks.map(track => ({ track, point: row?.points.get(track.id) }))
    .sort((a, b) => (b.point?.strength ?? -1) - (a.point?.strength ?? -1));
}

function TrendTooltip({ row, tracks, colors, focused, onPreview }: {
  row?: Observation; tracks: TrendTrack[]; colors: Map<string, string>; focused?: string;
  onPreview: (time: number | undefined) => void;
}) {
  const time = row?.time;
  useEffect(() => {
    onPreview(time);
    return () => onPreview(undefined);
  }, [time, onPreview]);

  if (!row) return null;
  return <div className="comp-trend-tooltip">
    <strong>{archiveDay.format(row.day)} · 综合表现</strong>
    <ul>{trendReadout(tracks, row).map(({ track, point }) =>
      <li key={track.id} className="comp-trend-tooltip-row" data-focused={track.id === focused || undefined}>
        <span className="comp-trend-track-mark" style={{ "--trend-track": colors.get(track.id) } as CSSProperties} aria-hidden="true" />
        <span>{track.name}</span>
        <b>{point?.strength.toFixed(2) ?? "—"}</b>
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
  const [filter, setFilter] = useState("top");
  const [page, setPage] = useState(0);
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
  const { tracks: matches, days } = useMemo(() => selectTrendWindow(ranked, activeFilter, model.days, "strength"), [ranked, activeFilter, model.days]);
  const pageSize = trackColors.length;
  const pageIndex = Math.min(page, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
  const firstTrack = pageIndex * pageSize;
  const visible = useMemo(() => matches.slice(firstTrack, firstTrack + pageSize), [matches, firstTrack, pageSize]);
  const pinned = visible.find(track => track.id === focused);
  const waitingForComparison = (activeFilter === "up" || activeFilter === "down") &&
    !ranked.some(track => track.points.length > 1);
  const { rows, lines, colors } = useMemo(() => makePlot(days, visible), [days, visible]);
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
  const pinnedStartsHere = pinnedPoint && lines.some(line => line.trackId === pinned?.id && line.firstDay === readoutRow?.day);
  const costs = [...new Set(ranked.filter(track => track.points.at(-1)?.at === model.days.at(-1))
    .flatMap(track => track.costs))].sort((a, b) => a - b);
  function showPage(index: number) {
    setPage(index);
    setFocused(undefined);
    setHovered(undefined);
  }

  return <section className="comp-trend-panel" id="comp-trends" aria-labelledby={id + "-title"}>
    <header className="comp-trend-header">
      <h2 id={id + "-title"}>阵容趋势</h2>
      {ranked.length > 0 && <label className="comp-trend-filter-label">
        <span>筛选</span>
        <select className="comp-trend-filter" aria-label="筛选趋势阵容" value={activeFilter}
          onChange={event => { setFilter(event.target.value); showPage(0); }}>
          <option value="top">Top 10</option>
          {hasRecommendations && <option value="recommended">本版推荐</option>}
          <option value="up">上升趋势</option>
          <option value="down">下降趋势</option>
          {costs.length > 0 && <optgroup label="主 C 费用">{costs.map(cost => <option key={cost} value={"cost:" + cost}>{cost === 5 ? "5 费及以上" : cost + " 费"}主 C</option>)}</optgroup>}
        </select>
      </label>}
      <div className="comp-trend-sources">
        <details className="comp-trend-method">
          <summary>评分口径</summary>
          <div>
            <p><strong>{model.scope}</strong> · 至少 100 场 · 按 UTC 归日</p>
            {model.note && <p>{model.note}</p>}
            <p>质量分按均名 55%、登顶率 25%、前四率 20% 加权。均名 4.90 → 3.50、登顶率 6% → 24%、前四率 42% → 68%，各自线性映射到 0～1。</p>
            <p>样本分 = log₁₀(max(100, 场数) ÷ 100) ÷ 3。综合表现 = 82% × 质量分 + 18% × 样本分 × 均名归一值。各项归一值、样本分和最终得分均限于 0～1。</p>
          </div>
        </details>
        <a className="comp-trend-credit" href={tftableUrl} target="_blank" rel="noopener">
          TFTable 环境趋势 <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
    </header>
    {lines.length > 0 ?
      <div className="comp-trend-body">
        <div className="comp-trend-plot">
          <div className="comp-trend-mobile-picker">
            <select aria-label="选择曲线阵容" value={pinned?.id ?? ""} onChange={event => setFocused(event.target.value || undefined)}>
              <option value="">全部曲线</option>
              {visible.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
            </select>
            {pinned && readoutRow && <output aria-live="polite">
              {archiveDay.format(readoutRow.day)} · {pinnedPoint ? pinnedPoint.strength.toFixed(2) : "无样本"}
            </output>}
          </div>
          <div className="comp-trend-canvas">
            <CompTrendChart rows={rows} lines={lines}
              highlighted={highlighted} activeDay={previewTime === undefined && selectedTime !== undefined ? activeRow?.day : undefined}
              onSelect={setSelectedTime} onHover={setHovered}
              renderTooltip={row => <TrendTooltip row={row} tracks={visible}
                colors={colors} focused={highlighted} onPreview={setPreviewTime} />} />
          </div>
          {(patchMarks.length > 0 || lines.some(line => line.firstDay !== undefined)) && <div className="comp-trend-caption">
            {patchMarks.length > 0 && <div className="comp-trend-patches" aria-label="补丁节点">
              {patchMarks.map(patch => <span key={patch.at + patch.label}>
                <time dateTime={patch.at} title={beijingDateTime.format(new Date(patch.at)) + " 北京时间"}>{beijingDay.format(new Date(patch.at))}</time>
                {patch.href ? <a href={patch.href}>{patch.label.split(" ")[0]}</a> : patch.label.split(" ")[0]}
              </span>)}
            </div>}
            {lines.some(line => line.firstDay !== undefined) && <span className="comp-trend-start-key">首次收录起点</span>}
          </div>}
        </div>
        <div className="comp-trend-legend">
          <div className="comp-trend-legend-heading" data-preview={previewTime !== undefined || undefined}>
            <select className="comp-trend-date" aria-label="趋势日期" value={readoutRow?.time}
              onChange={event => setSelectedTime(Number(event.target.value))}>
              {rows.map(row => <option key={row.time} value={row.time}>{archiveDay.format(row.day)}</option>)}
            </select>
            <span>综合表现</span>
          </div>
          <ul className="comp-trend-readings">
            {trendReadout(visible, readoutRow).map(({ track, point }) => {
              return <li key={track.id} style={{ "--trend-track": colors.get(track.id) } as CSSProperties}>
                <button type="button" onClick={() => setFocused(pinned?.id === track.id ? undefined : track.id)}
                  onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(track.id); }}
                  onPointerLeave={() => setHovered(undefined)}
                  onFocus={event => { if (event.currentTarget.matches(":focus-visible")) setHovered(track.id); }}
                  onBlur={() => setHovered(undefined)}
                  aria-pressed={pinned?.id === track.id} data-highlighted={highlighted === track.id || undefined}>
                  <span className="comp-trend-track-avatar" aria-hidden="true">
                    {track.image && <img src={track.image} width={24} height={24} alt="" loading="lazy" />}
                  </span>
                  <span className="comp-trend-track-name" title={point?.board?.name ?? track.name}>{track.name}</span>
                  <small className="comp-trend-track-cost" title={track.cost !== undefined ? "首位主 C 费用" : undefined}>
                    {track.cost !== undefined && track.cost + "费"}
                  </small>
                  <b title={point ? number.format(point.games) + " 场 · " + point.patch : "当天无样本"}>
                    {point?.strength.toFixed(2) ?? "—"}
                  </b>
                </button>
              </li>;
            })}
          </ul>
          {matches.length > pageSize && <nav className="comp-trend-pages" aria-label="费用筛选分页">
            <button type="button" aria-label="上一页" disabled={firstTrack === 0} onClick={() => showPage(pageIndex - 1)}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span aria-live="polite">{firstTrack + 1}–{Math.min(firstTrack + pageSize, matches.length)} / {matches.length} 套</span>
            <button type="button" aria-label="下一页" disabled={firstTrack + pageSize >= matches.length} onClick={() => showPage(pageIndex + 1)}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </nav>}
          {pinned && <div className="comp-trend-focused" style={{ "--trend-track": colors.get(pinned.id) } as CSSProperties}>
            <strong>{pinnedPoint?.board?.name ?? pinned.name}</strong>
            {pinnedPoint ? <>
              {pinnedStartsHere && <span className="comp-trend-start-key">首次收录起点</span>}
              <dl>
                <div><dt>均名</dt><dd>{pinnedPoint.mean.toFixed(2)}</dd></div>
                <div><dt>前四率</dt><dd>{percent.format(pinnedPoint.topFourRate)}</dd></div>
                <div><dt>登顶率</dt><dd>{percent.format(pinnedPoint.winRate)}</dd></div>
                <div><dt>场数</dt><dd>{number.format(pinnedPoint.games)}</dd></div>
                <div><dt>补丁</dt><dd>{pinnedPoint.patch}</dd></div>
              </dl>
            </> : <span>当天无样本</span>}
            {pinned.href && <a href={pinnedPoint?.board?.href ?? pinned.href}>查看阵容 <ChevronRight size={13} aria-hidden="true" /></a>}
            {pinnedPoint?.sourceUrl && <a href={pinnedPoint.sourceUrl} target="_blank" rel="noopener">查看数据 <ArrowUpRight size={13} aria-hidden="true" /></a>}
          </div>}
        </div>
      </div>
      : <p className="comp-trend-empty">{waitingForComparison ? "至少需两天可比样本"
        : ranked.length ? "当前筛选暂无综合表现数据"
        : "暂无可比样本"}</p>}
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
