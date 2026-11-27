"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { SiteSearchContext, SiteSearchHit, SiteSearchResponse } from "@/domain/site-search";
import { HeroAugmentSearchCard } from "./HeroAugmentSearchCard";
import "./site-search-results.css";

type SearchState = { phase: "idle" } | { phase: "pending" } | { phase: "loading" } | { phase: "error" } | {
  phase: "ready"; result: SiteSearchResponse; refreshing?: boolean;
};

export function useSiteSearch(query: string, exclude?: string, initial?: SiteSearchResponse, initialExclude?: string, keepQueryResult = false,
  { pending = false, includeSeven, submission }: { pending?: boolean; includeSeven?: boolean; submission?: { context?: SiteSearchContext; attempt: number } } = {},
): SearchState {
  const term = query.trim();
  const body = submission ? JSON.stringify({ query: term, context: submission.context, exclude, includeSeven }) : undefined;
  const key = JSON.stringify([term, exclude, includeSeven, submission?.attempt, body]);
  const [loaded, setLoaded] = useState<{ key: string; search: SearchState }>();
  const useInitial = initialExclude === exclude && initial?.query === term;

  useEffect(() => {
    if (!term || useInitial || pending) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: term });
        if (exclude) params.set("exclude", exclude);
        if (includeSeven) params.set("seven", "1");
        const response = body
          ? await fetch("/api/search", { method: "POST", body, headers: { "Content-Type": "application/json" }, signal: controller.signal })
          : await fetch("/api/search?" + params, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const result: SiteSearchResponse = await response.json();
        if (!controller.signal.aborted) setLoaded({ key, search: { phase: "ready", result } });
      } catch {
        if (!controller.signal.aborted) setLoaded({ key, search: { phase: "error" } });
      }
    }, body ? 0 : 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, term, exclude, useInitial, pending, includeSeven, body]);

  if (!term) return { phase: "idle" };
  if (pending) return { phase: "pending" };
  if (useInitial && initial) return { phase: "ready", result: initial };
  if (loaded?.key === key) return loaded.search;
  if (keepQueryResult) {
    const previous = loaded?.search.phase === "ready" ? loaded.search.result : undefined;
    const old = previous?.query === term ? previous : initial?.query === term ? initial : undefined;
    if (old) return { phase: "ready", result: old, refreshing: true };
  }
  return { phase: "loading" };
}

type LinkResult = Pick<SiteSearchHit, "id" | "name" | "href" | "image" | "detail" | "category" | "advice" | "games" | "mean">;

function ResultLink({ hit, primary, numericColumns = false, resultType, terminal = false }: {
  hit: LinkResult; primary?: boolean; numericColumns?: boolean; resultType?: string; terminal?: boolean;
}) {
  return <a href={hit.href} className="site-lookup-result" data-search-result data-search-result-type={resultType} data-search-primary={primary || undefined}>
    {hit.image && <img src={hit.image} alt="" width={30} height={30} decoding="async" />}
    <span className="site-lookup-label">
      <strong>{hit.name}</strong>
      {hit.detail && <small>{hit.detail}</small>}
      {hit.advice && <small className="site-lookup-advice">{hit.advice}</small>}
    </span>
    {(typeof hit.games === "number" || typeof hit.mean === "number" || hit.category) && <span className="site-lookup-metrics" data-numeric={numericColumns || undefined}>
      {hit.category && <small>{hit.category}</small>}
      {typeof hit.mean === "number" && <strong>{numericColumns ? <span className="sr-only">平均排名 </span> : terminal ? "体系均名 " : "均名 "}{hit.mean.toFixed(2)}</strong>}
      {typeof hit.games === "number" && <small>{hit.games.toLocaleString("zh-CN")}{numericColumns ? <span className="sr-only"> 场</span> : " 场"}</small>}
    </span>}
    {terminal && <ChevronRight className="site-lookup-arrow" size={15} aria-hidden="true" />}
  </a>;
}

function GearResult({ hit, intent, onToggleExclusion, onToggleSeven, groupKind }: {
  hit: SiteSearchHit; intent: SiteSearchResponse["intent"]; onToggleExclusion?: (value: "rakan" | "none") => void;
  onToggleSeven?: (value: boolean) => void; groupKind: string;
}) {
  const gear = hit.gear;
  if (!gear) return hit.evidence?.length ? <div className="site-lookup-board">
    <ResultLink hit={hit} resultType={groupKind} />
    <details className="site-lookup-board-evidence">
      <summary>战绩口径</summary>
      {hit.evidence.map(row => <div key={row.label}>
        <a href={row.href}>{row.label} · {row.games.toLocaleString("zh-CN")} 场{row.mean === undefined ? "" : ` · 均名 ${row.mean.toFixed(2)}`}</a>
        <small>{row.note ? `${row.note} · ` : ""}{row.source}</small>
      </div>)}
    </details>
  </div> : <ResultLink hit={hit} resultType={groupKind} />;
  const hasHolders = gear.holders.length > 0;
  const columns = <span className="site-lookup-column-names" aria-hidden="true"><span>均名</span><span>场数</span></span>;
  const snapshotLabel = gear.snapshot?.label.match(/^(.*?)(\d{4}-\d{2}-\d{2})$/);
  return <div className="site-lookup-gear">
    <ResultLink hit={{ ...hit, games: gear.totalGames }} resultType="item" />
    <div className="site-lookup-gear-meta">
      {gear.snapshot && <a className="site-lookup-source" href={gear.snapshot.href}>
        {snapshotLabel ? <>{snapshotLabel[1]}<time dateTime={snapshotLabel[2]}>{snapshotLabel[2]}</time></> : gear.snapshot.label}
      </a>}
      {onToggleSeven && <button type="button" aria-pressed={gear.includeSeven} onClick={() => onToggleSeven(!gear.includeSeven)}>包含 7 费</button>}
      {!onToggleSeven && gear.type === "emblem" && onToggleExclusion && <button type="button" aria-pressed={gear.exclude === "rakan"}
        onClick={() => onToggleExclusion(gear.exclude === "rakan" ? "none" : "rakan")}>剔除洛</button>}
    </div>
    <div className="site-lookup-evidence-grid">
      <section className="site-lookup-evidence" aria-label="最佳使用者">
        <header><h3>最佳使用者</h3>{hasHolders && <>
          <span className="site-lookup-order">{gear.holderOrder === "games" ? "按场数" : "按携带均名"}</span>{columns}
        </>}</header>
        {gear.holders.map((holder, i) => <ResultLink key={holder.id} hit={holder} numericColumns resultType="unit"
          primary={i === 0 && intent === "holders"} />)}
        {!hasHolders && <p className="site-lookup-message">暂无携带者战绩</p>}
      </section>
      <section className="site-lookup-evidence" aria-label="主 C 候选">
        <header><h3>主 C 候选</h3>{gear.carries.length > 0 && <><span className="site-lookup-order">终盘优先</span>{columns}</>}</header>
        {gear.carries.map(carry => <ResultLink key={carry.id} hit={carry} numericColumns resultType="guide" />)}
        {!gear.carries.length && <p className="site-lookup-message">暂无有携带战绩的攻略主 C</p>}
      </section>
    </div>
    <section className="site-lookup-evidence site-lookup-terminals" aria-label="阵容终盘">
      <header><h3>阵容终盘</h3><span className="site-lookup-order">按体系均名 · 排除 7 费</span></header>
      {gear.examples.map((example, i) => <ResultLink key={example.id} hit={example} resultType="guide" terminal primary={i === 0 && intent === "comps"} />)}
      {gear.routeNote && <p className="site-lookup-message">{gear.routeNote}</p>}
    </section>
    {!!gear.stageBoards?.length && <details className="site-lookup-board-evidence">
      <summary>查看实戴棋盘</summary>
      {gear.stageBoards.map(board => <ResultLink key={board.id} hit={board} resultType="guide" />)}
    </details>}
  </div>;
}

export function SiteSearchResults({ search, onToggleExclusion, onToggleSeven, filter, quiet = false }: {
  search: SearchState; onToggleExclusion?: (value: "rakan" | "none") => void;
  onToggleSeven?: (value: boolean) => void;
  filter?: (group: SiteSearchResponse["groups"][number]) => boolean;
  quiet?: boolean;
}) {
  if (search.phase === "idle") return null;
  if (search.phase === "pending") return quiet ? null : <p className="site-lookup-message" role="status">按回车或点搜索提交</p>;
  if (search.phase === "loading") return quiet ? null : <p className="site-lookup-message" role="status">正在搜索…</p>;
  if (search.phase === "error") return quiet ? null : <p className="site-lookup-message" role="status">暂时读不到搜索结果，可以重新输入。</p>;

  const { groups: allGroups, intent } = search.result;
  const groups = filter ? allGroups.filter(filter) : allGroups;
  if (!groups.length) return quiet ? null : <p className="site-lookup-message" role="status">{search.result.answer ?? "暂无匹配结果"}</p>;
  const hero = groups.find(group => group.kind === "heroes" && group.hits.length === 1)?.hits[0];

  return <div className="site-lookup-results">
    {search.result.answer && <p className="site-lookup-message" role="status">{search.result.answer}</p>}
    {groups.map(group => <section className="site-lookup-group" key={group.kind} aria-label={group.title} data-search-kind={group.kind}>
      <h2>{group.title}</h2>
      {group.hits.map(hit => {
        const detail = hit.detail;
        const shown = group.kind === "guides" && hero && detail && detail.startsWith(hero.name + " ")
          ? { ...hit, detail: detail.slice(hero.name.length + 1), image: hit.image === hero.image ? undefined : hit.image }
          : hit;
        return hit.heroAugment ? <HeroAugmentSearchCard key={hit.id} hit={hit} /> :
          <GearResult key={hit.id} hit={shown} intent={intent} onToggleExclusion={onToggleExclusion} onToggleSeven={onToggleSeven} groupKind={group.kind} />;
      })}
    </section>)}
  </div>;
}
