"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Search } from "lucide-react";
import catalog from "@/data/augment-catalog.json";
import {
  augmentTableRows, compareAugmentRows, normalizeAugmentQuery, rarityClass, tierOrder,
  type AugmentTableColumn, type AugmentTableRow, type SelectionSnapshot,
} from "@/domain/augment-library";

export type AugmentParams = Record<string, string | undefined>;
export const pageSize = 30;

export function augmentUrl(params: AugmentParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return "/augments" + (search.size ? "?" + search.toString() : "");
}

export function useAugmentFilters(initial: AugmentParams) {
  const [filters, setFilters] = useState(initial);
  const limit = Math.max(pageSize, Number.parseInt(filters.limit || "", 10) || pageSize);
  function change(patch: AugmentParams) {
    const next = { ...filters, limit: undefined, ...patch };
    setFilters(next);
    window.history.replaceState(window.history.state, "", augmentUrl(next));
  }
  return { filters, change, limit };
}

const defaultRealm = "pbe";
const archivePatch = "unreported";
function scopeLabel(season: number, realm: string) {
  return "S" + season + (realm === "pbe" ? " 测试服" : " 正式服");
}

const summaryColumns = ["name", "mean", "games", "top4"];
const columns: { key: AugmentTableColumn; label: string }[] = [
  { key: "name", label: "海克斯" }, { key: "english", label: "英文名" },
  { key: "mean", label: "均名" }, { key: "games", label: "场数" }, { key: "top4", label: "前四率" },
  { key: "win", label: "登顶率" }, { key: "grade", label: "评级" },
  { key: "2-1", label: "2-1 均名" }, { key: "3-2", label: "3-2 均名" }, { key: "4-2", label: "4-2 均名" },
];
const highestFirst = ["games", "top4", "win"];
const stages = ["2-1", "3-2", "4-2"] as const;
const hasMetrics = (row: AugmentTableRow) =>
  [row.mean, row.top4, row.win, row.games, row["2-1"], row["3-2"], row["4-2"]].some(Number.isFinite) || Boolean(row.grade);

function shownValue(row: AugmentTableRow, key: AugmentTableColumn) {
  const value = row[key];
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  if (key === "games") return value.toLocaleString("zh-CN");
  if (key === "top4" || key === "win") return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + "%";
  return value.toFixed(2);
}

function SnapshotSource({snapshot, hasGames}: {snapshot: SelectionSnapshot; hasGames: boolean}) {
  const sourceHost = new URL(snapshot.source).hostname;
  const isNoxu = ["noxutft.com", "www.noxutft.com"].includes(sourceHost);
  const scope = [
    snapshot.scope || (isNoxu ? "客户端对局，均名经来源校正" : ""),
    snapshot.roundBasis === "pick-order" && "2-1／3-2／4-2 按第 1／2／3 次选取统计，含提前发放",
  ].filter(Boolean).join(" · ");
  return <div className="aug-snapshot-source">
    <p className="aug-snapshot-meta">
      <a href={snapshot.source} target="_blank" rel="noreferrer">{snapshot.sourceName || (isNoxu ? "NoxuTFT" : sourceHost)} ↗</a>
      <time dateTime={snapshot.date}>{snapshot.date}</time>
      <span>{snapshot.patch ? "补丁 " + snapshot.patch : "补丁未标注"}</span>
      {!hasGames && <span>场数未公开</span>}
    </p>
    {scope && <details className="aug-source-method"><summary>统计口径</summary><p className="aug-scope-note">{scope}</p></details>}
  </div>;
}

function SelectionTable({ snapshot, current, filters, change, limit, picker }: {
  snapshot: SelectionSnapshot; current: boolean; filters: AugmentParams; change: (patch: AugmentParams) => void;
  limit: number; picker: ReactNode;
}) {
  const [expanded, setExpanded] = useState("");
  const detailed = filters.view === "full";
  const rounds = useMemo(() => ["all", ...stages.filter(stage => snapshot.rows.some(row => row.round === stage))], [snapshot]);
  const round = rounds.includes(filters.round || "") ? filters.round! : "all";
  const all = useMemo(() => augmentTableRows(current ? catalog.rows : undefined, snapshot, round), [current, snapshot, round]);
  const available = columns.filter(column => column.key === "name" || all.some(row => row[column.key] != null && row[column.key] !== ""));
  const hasEnglish = available.some(column => column.key === "english");
  const hasGames = available.some(column => column.key === "games");
  const countWithMetrics = all.filter(hasMetrics).length;
  const selectedSort = available.find(column => column.key === filters.sort);
  const earliestStage = stages.find(stage => available.some(column => column.key === stage));
  const defaultSort = available.some(column => column.key === "mean") ? "mean" : earliestStage ?? "name";
  const key = selectedSort?.key ?? defaultSort;
  const descending = selectedSort != null && (filters.dir ? filters.dir === "desc" : !detailed && highestFirst.includes(key));
  const displayed = available.filter(column => detailed
    ? column.key !== "english" || filters.english === "1"
    : summaryColumns.includes(column.key) || !available.some(value => value.key !== "name" && summaryColumns.includes(value.key)) && column.key === earliestStage);
  const minimum = hasGames ? Number(filters.minGames) || 0 : 0;
  const onlyMetrics = countWithMetrics > 0 && filters.metrics === "1";
  const needle = normalizeAugmentQuery(filters.q || "");
  const rows = useMemo(() => all.filter(row =>
    (!filters.tier || filters.tier === row.rarity) &&
    (minimum <= 0 || (row.games ?? -1) >= minimum) &&
    (!onlyMetrics || hasMetrics(row)) &&
    (!needle || normalizeAugmentQuery([row.name, row.english, row.effect].filter(Boolean).join(" ")).includes(needle))
  ).sort((a, b) => compareAugmentRows(a, b, key, descending)), [all, filters.tier, minimum, onlyMetrics, needle, key, descending]);

  function sortBy(column: AugmentTableColumn) {
    const desc = column === key ? !descending : highestFirst.includes(column);
    change({ sort: column, dir: desc ? "desc" : "asc" });
  }
  const origin = augmentUrl(filters);
  const defaultShown = displayed.some(column => column.key === key);
  return <section className="aug-full" aria-label="海克斯选取战绩">
    <div className="aug-stats-context">{picker}<SnapshotSource snapshot={snapshot} hasGames={hasGames}/></div>
    <div className="aug-tools">
      <label className="aug-search"><Search size={16}/><input type="search" aria-label="搜索战绩" value={filters.q || ""} placeholder="搜海克斯名称或效果" onChange={event => change({q:event.target.value})}/></label>
      <select aria-label="战绩品质" value={filters.tier || ""} onChange={event => change({tier:event.target.value})}><option value="">全部品质</option>{tierOrder.map(tier => <option key={tier}>{tier}</option>)}</select>
      {rounds.length > 1 && <label className="aug-select-label">选取回合
        <select aria-label="选取回合" value={round} onChange={event => change({round:event.target.value})}>{rounds.map(option => <option key={option} value={option}>{option === "all" ? "全回合汇总" : option}</option>)}</select>
      </label>}
      <button className="aug-sort-reset aug-layout-toggle" type="button" aria-expanded={detailed} onClick={() =>
        change({view:detailed ? "stats" : "full", dir:selectedSort ? descending ? "desc" : "asc" : undefined, limit:filters.limit})
      }>{detailed ? "收起明细" : "展开明细"} <ChevronDown size={15} aria-hidden="true"/></button>
    </div>
    {(hasGames || hasEnglish && detailed || countWithMetrics > 0 && countWithMetrics < all.length || selectedSort || !defaultShown) && <div className="aug-secondary-tools">
      {hasGames && <label className="aug-minimum">最少选取数<input aria-label="最少选取数" type="number" min="0" step="1" inputMode="numeric" placeholder="不限"
        value={filters.minGames || ""} onChange={event => change({minGames:event.target.value})}/></label>}
      {hasEnglish && detailed && <label className="aug-check"><input type="checkbox" checked={filters.english === "1"} onChange={event => change({english:event.target.checked ? "1" : undefined})}/>显示英文名</label>}
      {countWithMetrics > 0 && countWithMetrics < all.length && <label className="aug-check"><input type="checkbox" checked={onlyMetrics} onChange={event => change({metrics:event.target.checked ? "1" : undefined})}/>只看有战绩</label>}
      {!defaultShown && <span className="aug-hidden-sort">按{available.find(column => column.key === key)?.label}排序</span>}
      {selectedSort && <button className="aug-text-button" type="button" onClick={() => change({sort:undefined, dir:undefined})}>恢复默认排序</button>}
    </div>}
    {rows.length !== all.length && <p className="aug-result-count" aria-live="polite">{rows.length} 个强化</p>}
    {rows.length ? <div className="aug-full-scroll" role="region" aria-label="强化选取数据" tabIndex={0}>
      <table className={"aug-full-grid" + (displayed.length <= 5 ? " aug-full-compact" : "")}><thead><tr>{displayed.map(column => {
        const Icon = column.key !== key ? ArrowUpDown : descending ? ArrowDown : ArrowUp;
        return <th key={column.key} scope="col" className={column.key === "english" ? "aug-full-english" : undefined}
          aria-sort={column.key === key ? descending ? "descending" : "ascending" : undefined}>
          <button type="button" onClick={() => sortBy(column.key)}>{column.label}<Icon size={13} aria-hidden="true"/></button>
        </th>;
      })}</tr></thead><tbody>{rows.slice(0,limit).map(row => <Fragment key={row.id}><tr>
        <th scope="row"><span className="aug-stat-name">
          {current ? <a href={augmentUrl({id:row.id,q:row.name,from:origin})}>{row.name}{row.variantLabel && <small>{row.variantLabel}</small>}</a> :
            row.effect ? <button type="button" className="aug-stat-effect" aria-expanded={expanded === row.id}
              onClick={() => setExpanded(expanded === row.id ? "" : row.id)}>{row.name}<ChevronDown size={13} aria-hidden="true"/></button> : row.name}
          <span className={"aug-tier " + rarityClass(row.rarity)}>{row.rarity}</span>
        </span></th>
        {displayed.slice(1).map(column => <td key={column.key} className={column.key === "english" ? "aug-full-english" : row[column.key] == null ? "aug-no-value" : undefined}>{shownValue(row,column.key)}</td>)}
      </tr>{expanded === row.id && !current && row.effect && <tr className="aug-stat-expanded"><td colSpan={displayed.length}>{row.effect}</td></tr>}</Fragment>)}</tbody></table>
    </div> : <p className="aug-empty">没有匹配的海克斯。 <button type="button" onClick={() => change({q:undefined,tier:undefined,minGames:undefined,metrics:undefined,round:undefined})}>重置筛选</button></p>}
    {rows.length > limit && <button type="button" className="aug-more" onClick={() => change({limit:String(limit + pageSize)})}>显示更多（剩余 {rows.length - limit}）</button>}
  </section>;
}

export function AugmentStats({ snapshots, currentPatch, initial }: { snapshots: SelectionSnapshot[]; currentPatch: string; initial: AugmentParams }) {
  const requestedSeason = initial.season || "19";
  const requestedRealm = initial.realm || (requestedSeason === "19" ? defaultRealm : "live");
  const requestedScope = requestedSeason + "-" + requestedRealm;
  const scopes = new Map<string,string>([["19-pbe", scopeLabel(19, "pbe")]]);
  for (const snapshot of snapshots) scopes.set(snapshot.season + "-" + snapshot.realm,scopeLabel(snapshot.season,snapshot.realm));
  const scope = scopes.has(requestedScope) ? requestedScope : "19-pbe";
  const [seasonString, realm] = scope.split("-");
  const season = Number(seasonString);
  const versions = snapshots.filter(snapshot => snapshot.season === season && snapshot.realm === realm).sort((a,b) => b.date.localeCompare(a.date));
  const currentRealm = season === 19 && realm === defaultRealm;
  const patches = new Set([...(currentRealm ? [currentPatch] : []), ...versions.map(snapshot => snapshot.patch || archivePatch)]);
  const preferred = currentRealm ? currentPatch : versions[0]?.patch || archivePatch;
  const patch = requestedScope === scope && initial.patch && patches.has(initial.patch) ? initial.patch : preferred;
  const snapshot = versions.find(entry => (entry.patch || archivePatch) === patch);
  const view = initial.view === "full" ? "full" : "stats";
  const {filters, change, limit} = useAugmentFilters({...initial,view,season:seasonString,realm,patch:patch === archivePatch ? undefined : patch});
  const urlFor = (nextSeason:string, nextRealm:string, nextPatch?:string) =>
    augmentUrl({...filters,season:nextSeason,realm:nextRealm,patch:nextPatch,limit:undefined});
  const picker = <div className="aug-snapshot-picker">
      <nav className="aug-scope-options" aria-label="赛季与服务器">
        {Array.from(scopes, ([key,label]) => {
          if (key === scope) return <span key={key} aria-current="page">{label}</span>;
          const [nextSeason,nextRealm] = key.split("-");
          return <a key={key} href={urlFor(nextSeason,nextRealm)}>{label}</a>;
        })}
      </nav>
      {patches.size > 1 && <label>补丁<select aria-label="战绩补丁" value={patch} onChange={event => location.assign(urlFor(seasonString,realm,event.target.value))}>
        {Array.from(patches,option => <option key={option} value={option}>{option === archivePatch ? "补丁未标注" : option}</option>)}</select></label>}
    </div>;
  return snapshot ? <SelectionTable key={scope + patch} snapshot={snapshot} current={currentRealm && patch === currentPatch} filters={filters} change={change} limit={limit} picker={picker}/> :
    <div className="aug-stats-context aug-stats-pending">{picker}
      <p className="aug-unavailable" role="status">{patch !== archivePatch && patch ? `${patch} 暂无选取战绩` : "暂无选取战绩"}</p>
    </div>;
}
