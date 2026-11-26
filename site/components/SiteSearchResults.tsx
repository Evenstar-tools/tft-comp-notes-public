"use client";

import { useEffect, useState } from "react";
import type { SiteSearchHit, SiteSearchResponse } from "@/domain/site-search";
import "./site-search-results.css";

type SearchState = { phase: "idle" } | { phase: "loading" } | { phase: "error" } | {
  phase: "ready"; result: SiteSearchResponse; refreshing?: boolean;
};

export function useSiteSearch(query: string, exclude?: string, initial?: SiteSearchResponse, initialExclude?: string, keepQueryResult = false): SearchState {
  const term = query.trim();
  const key = term + "\0" + (exclude ?? "");
  const [loaded, setLoaded] = useState<{ key: string; search: SearchState }>();
  const useInitial = initialExclude === exclude && initial?.query === term;

  useEffect(() => {
    if (!term || useInitial) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: term });
        if (exclude) params.set("exclude", exclude);
        const response = await fetch("/api/search?" + params, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const result: SiteSearchResponse = await response.json();
        if (!controller.signal.aborted) setLoaded({ key, search: { phase: "ready", result } });
      } catch {
        if (!controller.signal.aborted) setLoaded({ key, search: { phase: "error" } });
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, term, exclude, useInitial]);

  if (!term) return { phase: "idle" };
  if (useInitial && initial) return { phase: "ready", result: initial };
  if (loaded?.key === key) return loaded.search;
  if (keepQueryResult) {
    const previous = loaded?.search.phase === "ready" ? loaded.search.result : undefined;
    const old = previous?.query === term ? previous : initial?.query === term ? initial : undefined;
    if (old) return { phase: "ready", result: old, refreshing: true };
  }
  return { phase: "loading" };
}

type LinkResult = Pick<SiteSearchHit, "id" | "name" | "href" | "image" | "detail" | "category"> & { games?: number; mean?: number };

function ResultLink({ hit, primary, numericColumns = false, resultType }: { hit: LinkResult; primary?: boolean; numericColumns?: boolean; resultType?: string }) {
  return <a href={hit.href} className="site-lookup-result" data-search-result data-search-result-type={resultType} data-search-primary={primary || undefined}>
    {hit.image && <img src={hit.image} alt="" width={30} height={30} decoding="async" />}
    <span className="site-lookup-label">
      <strong>{hit.name}</strong>
      {hit.detail && <small>{hit.detail}</small>}
    </span>
    {(typeof hit.games === "number" || typeof hit.mean === "number" || hit.category) && <span className="site-lookup-metrics" data-numeric={numericColumns || undefined}>
      {hit.category && <small>{hit.category}</small>}
      {typeof hit.mean === "number" && <strong>{numericColumns ? <span className="sr-only">平均排名 </span> : "均名 "}{hit.mean.toFixed(2)}</strong>}
      {typeof hit.games === "number" && <small>{hit.games.toLocaleString("zh-CN")}{numericColumns ? <span className="sr-only"> 场</span> : " 场"}</small>}
    </span>}
  </a>;
}

function GearResult({ hit, intent, onToggleExclusion, groupKind }: {
  hit: SiteSearchHit; intent: SiteSearchResponse["intent"]; onToggleExclusion?: (value: "rakan" | "none") => void; groupKind: string;
}) {
  const gear = hit.gear;
  if (!gear) return <ResultLink hit={hit} resultType={groupKind} />;
  const hasHolders = gear.holders.length > 0;
  const hasExamples = gear.examples.length > 0;
  const canExclude = gear.type === "emblem" && onToggleExclusion;
  const missingExamples = hasExamples ? null : <p>{gear.examplesAvailable ? "暂无实戴棋盘" : "暂时读不到阵容笔记"}</p>;
  const holders = (hasHolders || canExclude) && <div className="site-lookup-evidence site-lookup-holders">
    <header>
      <h3>携带者</h3>
      {canExclude && <button aria-pressed={gear.exclude === "rakan"}
        type="button" onClick={() => canExclude(gear.exclude === "rakan" ? "none" : "rakan")}>剔除洛</button>}
      {hasHolders && <span className="site-lookup-column-names" aria-hidden="true"><span>均名</span><span>场数</span></span>}
    </header>
    {gear.holders.slice(0, 3).map((holder, i) => <ResultLink key={holder.id} hit={holder} numericColumns resultType="unit"
      primary={i === 0 && (intent === "holders" || (intent === "comps" && !hasExamples))} />)}
  </div>;
  const examples = hasExamples && <div className="site-lookup-evidence">
    <header><h3>实戴阵容</h3></header>
    {gear.examples.slice(0, 3).map((example, i) => <ResultLink key={example.id} hit={example} resultType="guide" primary={i === 0 && intent === "comps"} />)}
  </div>;
  const prioritizeExamples = intent === "comps";
  const hasFooter = (!prioritizeExamples && missingExamples) || !hasHolders || gear.snapshot;
  return <div className="site-lookup-gear">
    <ResultLink hit={{ ...hit, games: gear.totalGames }} resultType="item" />
    {prioritizeExamples && missingExamples && <div className="site-lookup-evidence-note">{missingExamples}</div>}
    {(examples || holders) && <div className="site-lookup-evidence-grid" data-single={!(examples && holders) || undefined}>
      {prioritizeExamples ? <>{examples}{holders}</> : <>{holders}{examples}</>}
    </div>}
    {hasFooter && <footer className="site-lookup-evidence-foot">
      {!prioritizeExamples && missingExamples}
      {!hasHolders && <p>暂无携带者战绩</p>}
      {gear.snapshot && <a className="site-lookup-source" href={gear.snapshot.href}>{gear.snapshot.label}</a>}
    </footer>}
  </div>;
}

export function SiteSearchResults({ search, onToggleExclusion, filter, quiet = false }: {
  search: SearchState; onToggleExclusion?: (value: "rakan" | "none") => void;
  filter?: (group: SiteSearchResponse["groups"][number]) => boolean;
  quiet?: boolean;
}) {
  if (search.phase === "idle") return null;
  if (search.phase === "loading") return quiet ? null : <p className="site-lookup-message" role="status">正在搜索…</p>;
  if (search.phase === "error") return quiet ? null : <p className="site-lookup-message" role="status">暂时读不到搜索结果，可以重新输入。</p>;

  const { groups: allGroups, intent } = search.result;
  const groups = filter ? allGroups.filter(filter) : allGroups;
  if (!groups.length) return quiet ? null : <p className="site-lookup-message" role="status">暂无匹配结果</p>;
  const hero = groups.find(group => group.kind === "heroes" && group.hits.length === 1)?.hits[0];

  return <div className="site-lookup-results">
    {groups.map(group => <section className="site-lookup-group" key={group.kind} aria-label={group.title} data-search-kind={group.kind}>
      <h2>{group.title}</h2>
      {group.hits.map(hit => {
        const detail = hit.detail;
        const shown = group.kind === "guides" && hero && detail && detail.startsWith(hero.name + " ")
          ? { ...hit, detail: detail.slice(hero.name.length + 1), image: hit.image === hero.image ? undefined : hit.image }
          : hit;
        return <GearResult key={hit.id} hit={shown} intent={intent} onToggleExclusion={onToggleExclusion} groupKind={group.kind} />;
      })}
    </section>)}
  </div>;
}
