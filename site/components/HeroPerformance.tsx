import { Fragment, useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Lock } from "lucide-react";
import { itemMap, season, traitMap, unitLabel } from "@/data";
import { itemName } from "@/domain/gear-library";
import { heroCostRankTone, rankHeroes, type HeroItemSample, type HeroItemSource, type HeroResult } from "@/domain/hero-insights";
import { itemLink } from "@/domain/links";
import { withStatPeriod } from "@/domain/stat-periods";
import type { Unit } from "@/domain/types";
import { hasUnlockCondition } from "@/domain/unlocks";
import { ItemIcon } from "./ItemIcon";
import { HeroItemPlacementDelta } from "./HeroItemPlacementDelta";

export type HeroStats = {
  source: string;
  sourceUrl?: string;
  version: string;
  days: number;
  date?: string | null;
  updatedAt?: string | null;
  minGames: number;
  rows: Record<string, HeroResult>;
};

const shortGames = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const exactGames = new Intl.NumberFormat("zh-CN");
const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;
const windowLabel = (stats: HeroStats) => [stats.version, `近 ${stats.days} 天`, stats.date].filter(Boolean).join(" · ");
const dataColumns = [
  { field: "mean", label: "均名", order: "ascending" },
  { field: "top4Rate", label: "前四率", order: "descending" },
  { field: "winRate", label: "登顶率", order: "descending" },
  { field: "games", label: "场数", order: "descending" },
] as const;

export function HeroStatSources({ stats, gearSource }: { stats?: HeroStats; gearSource?: HeroItemSource }) {
  if (!stats && !gearSource) return null;
  const battleWindow = stats && windowLabel(stats);
  const itemWindow = gearSource && [gearSource.version, gearSource.window.replace(/^最近(?=\s)/, "近"), gearSource.date].filter(Boolean).join(" · ");
  const sharedWindow = stats && gearSource && stats.source === gearSource.source && battleWindow === itemWindow;
  const provider = stats?.sourceUrl && <a className="hero-data-source" href={stats.sourceUrl} target="_blank" rel="noreferrer">
    {stats.source}<ArrowUpRight size={12} aria-hidden />
  </a>;
  return <details className="hero-stat-sources">
    <summary>数据来源</summary>
    {sharedWindow ? <p>{provider} · {battleWindow}</p> : <>
      {provider ?? gearSource?.source}
      {battleWindow && <p>实战 · {battleWindow}</p>}
      {gearSource && <p>单件装备 · {stats && gearSource.source !== stats.source && gearSource.source + " · "}{itemWindow}</p>}
    </>}
  </details>;
}

export type HeroSort = { field: typeof dataColumns[number]["field"]; order: "ascending" | "descending" };

export function HeroResultsTable({ stats, units, selectedId, onSelect, sort, setSort }: {
  stats: HeroStats;
  units: Unit[]; selectedId?: string; onSelect: (id: string) => void;
  sort: HeroSort; setSort: (sort: HeroSort) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const sampleByHero: Record<string, HeroResult | undefined> = stats.rows;
  const ranks = rankHeroes(season.units, stats.rows, stats.minGames);
  const rows = [...units].sort((left, right) => {
    const leftRow = sampleByHero[left.id], rightRow = sampleByHero[right.id];
    const leftValue = sort.field === "games" || ranks.has(left.id) ? leftRow?.[sort.field] : undefined;
    const rightValue = sort.field === "games" || ranks.has(right.id) ? rightRow?.[sort.field] : undefined;
    if (leftValue === undefined && rightValue !== undefined) return 1;
    if (rightValue === undefined && leftValue !== undefined) return -1;
    const delta = (leftValue ?? 0) - (rightValue ?? 0);
    return (sort.order === "ascending" ? delta : -delta) || left.name.localeCompare(right.name, "zh-CN");
  });

  return <div className="hero-results">
    <div className="hero-results-note">
      <span>满 {stats.minGames} 场排名</span>
      <HeroStatSources stats={stats} />
    </div>
    {rows.length ? <div className="hero-results-scroll" ref={scroll}>
      <table className="hero-results-table" aria-label="英雄战绩" role="table">
        <thead role="rowgroup"><tr role="row">
          <th scope="col" className="hero-result-heading" role="columnheader">英雄</th>
          {dataColumns.map(({ field, label, order }) => {
            const active = field === sort.field;
            return <Fragment key={field}>
              <th scope="col" role="columnheader" aria-sort={active ? sort.order : undefined}>
                <button type="button" onClick={() => {
                  setSort({ field, order: active ? (sort.order === "ascending" ? "descending" : "ascending") : order });
                  if (scroll.current) scroll.current.scrollTop = 0;
                }}>
                  {label}
                  {active && (sort.order === "ascending" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                </button>
              </th>
              {field === "mean" && <th scope="col" className="hero-result-rank" role="columnheader">同费名次</th>}
            </Fragment>;
          })}
        </tr></thead>
        <tbody role="rowgroup">{rows.map(unit => {
          const row = sampleByHero[unit.id];
          const rank = ranks.get(unit.id);
          const locked = hasUnlockCondition(unit);
          const { base, form } = unitLabel(unit);
          const selected = unit.id === selectedId;
          return <tr key={unit.id} className={selected ? "is-selected" : undefined} role="row">
            <th scope="row" role="rowheader">
              <button type="button" className={`hero-result-open cost-${unit.cost}`} aria-pressed={selected}
                aria-label={`${unit.name}，${unit.cost}费${locked ? "，需要解锁" : ""}`} onClick={() => onSelect(unit.id)}>
                <span className="hero-result-avatar" aria-hidden="true">
                  <img src={unit.image} alt="" width={38} height={38} loading="lazy" decoding="async" />
                  <b>{unit.cost}</b>
                </span>
                <span className="hero-result-name">
                  <strong>{base}{form && <small> · {form}</small>}{locked && <Lock size={12} aria-hidden />}</strong>
                  <small className="hero-result-traits">{unit.traits.map(id => traitMap.get(id)?.name).filter(Boolean).join(" · ")}</small>
                </span>
              </button>
            </th>
            <td className="hero-result-mean" role="cell">{rank && row ? row.mean.toFixed(2) : "—"}
              {rank && <small className="hero-result-mobile-rank" title={`同费第 ${rank.place} / ${rank.total}`}><span>同费 </span>{rank.place}/{rank.total}</small>}
            </td>
            <td className="hero-result-rank" role="cell" title={rank ? `同费第 ${rank.place} / ${rank.total}` : undefined}>{rank ? `${rank.place}/${rank.total}` : "—"}</td>
            <td role="cell">{rank && row ? percent(row.top4Rate) : "—"}</td>
            <td role="cell">{rank && row ? percent(row.winRate) : "—"}</td>
            <td role="cell" title={row && exactGames.format(row.games)}>{row ? shortGames.format(row.games) : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <p className="empty-inline">没有匹配的英雄</p>}
  </div>;
}

export function HeroBattleSummary({ unit, stats, controls, unavailable }: {
  unit: Unit;
  stats?: HeroStats;
  controls: ReactNode;
  unavailable: ReactNode;
}) {
  const result = stats?.rows[unit.id];
  const rank = stats && rankHeroes(season.units, stats.rows, stats.minGames).get(unit.id);
  return <section className="detail-section hero-performance" aria-label="实战数据">
      <div className="hero-detail-heading"><h3>实战数据</h3>{controls}</div>
      {!stats ? unavailable : result && rank ? <dl className="hero-metric-strip">
        <div><dt>均名</dt><dd data-tone={heroCostRankTone(rank)}>{result.mean.toFixed(2)}<small>同费 {rank.place}/{rank.total}</small></dd></div>
        <div><dt>前四率</dt><dd>{percent(result.top4Rate)}</dd></div>
        <div><dt>登顶率</dt><dd>{percent(result.winRate)}</dd></div>
        <div><dt>场数</dt><dd>{exactGames.format(result.games)}</dd></div>
      </dl> : <p className="hero-data-note">
        {result ? `当前 ${exactGames.format(result.games)} 场（满 ${stats.minGames} 场显示战绩）` : "暂无当期样本"}
      </p>}
  </section>;
}

export function HeroCommonItems({ unit, items, gearSource, period }: {
  unit: Unit; items: HeroItemSample[]; gearSource: HeroItemSource;
  period?: string;
}) {
  return <section className="detail-section hero-common-items" aria-label="常见成装">
      <div className="hero-detail-heading"><h3>常见成装</h3></div>
      {items.length ? <ul>{items.map(({ itemId, games, placementDelta }) => {
        const item = itemMap.get(itemId);
        if (!item) return null;
        return <li key={itemId}>
          <a href={withStatPeriod(itemLink(item.id, unit.id), period)}>
            <ItemIcon item={item} size={28} />
            <span>{itemName(item)}<small>{exactGames.format(games)} 场
              {placementDelta !== undefined && <> · <span className="sr-only">名次差 </span>
                <HeroItemPlacementDelta value={placementDelta} />
              </>}
            </small></span>
          </a>
        </li>;
      })}</ul> : <p className="hero-data-note">暂无达到 {gearSource.minGames} 场的成装样本。</p>}
  </section>;
}
