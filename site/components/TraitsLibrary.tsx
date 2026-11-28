"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { season } from "@/data";
import { traitLibraryLink } from "@/domain/library-navigation";
import type { Trait, Unit } from "@/domain/types";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import { TraitBadge } from "@/components/Glyphs";
import { MatrixTraitDetails } from "@/components/MatrixDetails";

import { TierResults, SourceComparison } from "./TraitPerformance";
import type { TierCounts, TraitBoardIndex, TraitBoardLink, TraitScope, TraitContext, TraitCrosscheck } from "@/domain/trait-performance";
import "@/app/traits/performance.css";

const collectionDate = new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeZone: "Asia/Shanghai" });

const traitGroups = [
  { axis: "column", label: "职业" },
  { axis: "row", label: "阵营" },
  { axis: "special", label: "个人羁绊" },
] as const;

type TraitAxis = typeof traitGroups[number]["axis"];

type TraitView = {
  query: string;
  linkedTrait?: string;
  scopeOn: boolean;
  shown: Record<TraitAxis, boolean>;
  tiers: Record<string, number | undefined>;
  comparison: string;
};
type TraitVisit = { url: string; view: TraitView; top: number; folds: string[]; member?: string };

const entries = season.traits.map(trait => {
  const members = season.units.filter(unit => unit.traits.includes(trait.id))
    .sort((first, second) => first.cost - second.cost);
  const traitNames = [trait.name, trait.nameEn, trait.gameName, ...(trait.aliases ?? [])]
    .flatMap(name => name ? [name.toLowerCase()] : []);
  const searchNames = [...traitNames, ...members.flatMap(unitSearchNames).map(name => name.toLowerCase())];
  return { trait, members, searchNames, traitNames };
});

function TraitEntry({ trait, members, memberQuery, overall, picked, onPick, links, comparison }: {
  trait: Trait; members: Unit[]; overall?: Record<string, number[]>; picked?: number; onPick: (tier?: number) => void;
  memberQuery: string;
  links?: Record<string, TraitBoardLink[]>;
  comparison?: { scopeOn: boolean; board?: TraitScope; overallSource?: string; currentBoard: string };
}) {
  const inlineMembers = trait.axis === "special" && members.length <= 2;
  const lineupName = (picked ? picked + (trait.countMode === "stars" ? "星" : "") : "") + trait.name;
  const roster = members.length > 0 && <div className="trait-lookup-members">
    {members.map(unit => {
      const matches = memberQuery && unitSearchNames(unit).some(name => name.toLowerCase().includes(memberQuery));
      return <a key={unit.id} href={"/heroes?" + new URLSearchParams({ unit: unit.id, trait: trait.id })}
        className={"cost-" + unit.cost + (matches ? " matches-search" : "")} aria-label={unit.name} title={unit.name}>
        <img src={unit.image} alt="" width={36} height={36} loading="lazy" decoding="async" />
        <span>{unit.name}</span>
      </a>;
    })}
  </div>;
  return (
    <article className="trait-lookup-entry">
      <div className="trait-lookup-roster">
        <header className="trait-lookup-entry-heading">
          <div className="trait-lookup-title">
            <TraitBadge trait={trait} size={27} />
            <h3 id={"lookup-" + trait.id} tabIndex={-1} title={trait.nameEn}>{trait.name}</h3>
          </div>
          <div className="trait-entry-actions">
            <a href={"/?" + new URLSearchParams({ q: (picked ?? "") + trait.name, sort: "category" })}
              aria-label={"查" + lineupName + "阵容"}>阵容</a>
            {trait.id === "collab" && <a href="/traits/medley">查看 40 组</a>}
            <a href={traitLibraryLink(trait.id, picked, true)} aria-label="在羁绊网看搭配">羁绊网</a>
          </div>
          {inlineMembers && roster}
        </header>
        {!inlineMembers && roster}
      </div>
      <MatrixTraitDetails trait={trait} compact showBasicActivation={false} renderTiers={effects =>
        <TierResults trait={trait} effects={effects} overall={overall} picked={picked} onPick={onPick}
          links={links} comparison={comparison} />} />
    </article>
  );
}

export function TraitsLibrary({ initialQuery, initialTrait, initialTier, meta, overall, context, links, comparison }: {
  initialQuery: string; initialTrait?: string; initialTier?: number;
  meta: { patch: string; queue: string; on: string; days: number; url?: string; current: boolean };
  overall: TierCounts; context?: TraitContext;
  links: TraitBoardIndex; comparison: TraitCrosscheck | null;
}) {
  const [view, setView] = useState<TraitView>({
    query: initialQuery, linkedTrait: initialTrait, scopeOn: !!context,
    shown: { column: true, row: true, special: true },
    tiers: initialTrait && initialTier ? { [initialTrait]: initialTier } : {}, comparison: "",
  });
  const { query, linkedTrait, scopeOn, shown } = view;
  const searchInput = useRef<HTMLInputElement>(null);
  const [returnVisit, setReturnVisit] = useState<TraitVisit>();
  useLayoutEffect(() => {
    const visit: TraitVisit | undefined = history.state?.tftTraitVisit;
    if (visit?.url === location.href) {
      setView(visit.view);
      setReturnVisit(visit);
    }
  }, []);
  useLayoutEffect(() => {
    if (!returnVisit) return;
    document.querySelectorAll<HTMLDetailsElement>("details[data-trait-fold]").forEach(fold => {
      fold.open = returnVisit.folds.includes(fold.dataset.traitFold!);
    });
    const member = Array.from(document.querySelectorAll<HTMLAnchorElement>(".trait-lookup-members a, .trait-entry-actions a, .tier-notes a"))
      .find(link => link.getAttribute("href") === returnVisit.member);
    member?.focus({ preventScroll: true });
    const restoreScroll = () => window.scrollTo({ top: returnVisit.top, behavior: "instant" });
    restoreScroll();
    const frame = requestAnimationFrame(restoreScroll);
    return () => cancelAnimationFrame(frame);
  }, [returnVisit]);
  useEffect(() => {
    const url = location.href;
    function remember(member?: string) {
      if (location.href !== url) return;
      const folds = Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-trait-fold][open]"), fold => fold.dataset.traitFold!);
      const visit: TraitVisit = { url, view, top: window.scrollY, folds, member };
      history.replaceState({ ...history.state, tftTraitVisit: visit }, "");
    }
    function leaving(event: MouseEvent) {
      const link = event.target instanceof Element && event.target.closest<HTMLAnchorElement>("a[href]");
      if (link && link.target !== "_blank" && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        remember(link.getAttribute("href") ?? undefined);
      }
    }
    const hide = () => remember(document.activeElement?.closest("a")?.getAttribute("href") ?? undefined);
    document.addEventListener("click", leaving, true);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("click", leaving, true);
      window.removeEventListener("pagehide", hide);
    };
  }, [view]);
  const contextScope = initialTrait ? context?.compared[initialTrait] ?? context?.stats : context?.stats;
  const search = query.trim().toLowerCase();
  const matches = linkedTrait && entries.some(entry => entry.trait.id === linkedTrait && entry.trait.name === query)
    ? entries.filter(entry => entry.trait.id === linkedTrait)
    : entries.filter(({ searchNames }) => !search || searchNames.some(name => name.includes(search)));
  const groups = traitGroups.map(group => ({
    ...group, entries: matches.filter(({ trait }) => trait.axis === group.axis),
  }));
  const visibleGroups = groups.filter(group => shown[group.axis] && group.entries.length > 0);
  const visibleCount = visibleGroups.length;
  const singleTrait = visibleCount === 1 && visibleGroups[0].entries.length === 1;

  return (
    <>
      <div className="page-heading trait-lookup-heading">
        <div className="trait-lookup-intro">
          <h1>羁绊速查</h1>
          <div className="trait-data-heading trait-lookup-source">
            {meta.current ? <details className="trait-lookup-source-details">
              <summary>数据来源</summary>
              <div>
                {(scopeOn && contextScope || meta.url) && <a href={scopeOn && contextScope ? contextScope.url : meta.url} target="_blank" rel="noreferrer">MetaTFT ↗</a>}
                <span>{meta.queue === "PBE" ? "PBE" : "正式服"} {meta.patch} · 近 {meta.days} 天 · <time dateTime={meta.on} title="北京时间">{collectionDate.format(new Date(meta.on))}</time></span>
              </div>
            </details> : <span>本版本战绩待更新</span>}
            <a href="/traits/medley">合奏组合</a>
            <a href="https://www.datatft.com/rate?season=19#true-damage" target="_blank" rel="noreferrer">收菜奖励 ↗</a>
          </div>
        </div>
        <div className="trait-lookup-controls">
          <input
            ref={searchInput}
            type="search"
            aria-label="搜索羁绊或英雄"
            placeholder="搜羁绊或英雄"
            value={query}
            onChange={event => setView({ ...view, linkedTrait: undefined, query: event.target.value })}
          />
          <div className="trait-lookup-columns-control" role="group" aria-label="显示羁绊分类">
            {traitGroups.map(({ axis, label }) => (
              <label key={axis}>
                <input type="checkbox" checked={shown[axis]} aria-controls={`trait-column-${axis}`}
                  onChange={event => {
                    const checked = event.currentTarget.checked;
                    setView({ ...view, shown: { ...shown, [axis]: checked } });
                  }} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
      {context && <div className="trait-guide-context">
        <a href={context.back}>← {context.title}</a>
        <div className="tier-buttons" role="group" aria-label="战绩范围">
          <button type="button" onClick={() => setView({ ...view, scopeOn: true })} aria-pressed={scopeOn}>当前棋盘</button>
          <button type="button" onClick={() => setView({ ...view, scopeOn: false })} aria-pressed={!scopeOn}>全部棋盘</button>
        </div>
        {scopeOn && <p>{[
          contextScope ? contextScope.labels.join(" · ") : "暂无同条件战绩",
          context.pins.length > 0 && "原棋盘 " + context.pins.join("、") + "，对比时放开当前档位",
          context.heroAugment && "未筛海克斯",
        ].filter(Boolean).join(" · ")}</p>}
      </div>}
      {visibleCount === 0 && <div className="trait-lookup-empty">
        <span role="status">{!matches.length ? "没有匹配的羁绊或英雄"
          : search ? "匹配的羁绊在已隐藏的分类里" : "未选择分类"}</span>
        {!matches.length ? <button type="button" onClick={() => {
          setView({ ...view, query: "", linkedTrait: undefined });
          searchInput.current?.focus();
        }}>清除搜索</button> : !search ? <button type="button" onClick={() =>
          setView({ ...view, shown: { column: true, row: true, special: true } })
        }>显示全部分类</button> : groups.filter(group => group.entries.length > 0).map(group =>
          <button key={group.axis} type="button" onClick={() =>
            setView({ ...view, shown: { ...shown, [group.axis]: true } })
          }>显示{group.label}</button>
        )}
      </div>}
      <div className="trait-lookup-columns" data-visible-count={visibleCount} data-single-trait={singleTrait || undefined}>
        {groups.map(group => (
          <section key={group.axis} id={`trait-column-${group.axis}`} hidden={!shown[group.axis] || group.entries.length === 0}
            aria-labelledby={`trait-group-${group.axis}`} className="trait-lookup-group">
            <header className="trait-group-heading">
              <h2 id={`trait-group-${group.axis}`}>{group.label}{search && <span aria-hidden>{group.entries.length}</span>}</h2>
              {group.entries.length > 1 && <select value="" aria-label={"在" + group.label + "栏定位"}
                onChange={event => {
                  const heading = document.getElementById("lookup-" + event.currentTarget.value);
                  heading?.focus({ preventScroll: true });
                  heading?.scrollIntoView({ block: "start" });
                }}>
                <option value="" disabled>跳到…</option>
                {group.entries.map(({ trait }) => <option key={trait.id} value={trait.id}>{trait.name}</option>)}
              </select>}
            </header>
            {group.entries.map(entry => <TraitEntry key={entry.trait.id} trait={entry.trait} members={entry.members}
              memberQuery={entry.traitNames.includes(search) ? "" : search}
              overall={overall[entry.trait.id]} comparison={context ? {
                scopeOn, board: context.compared[entry.trait.id] ?? context.stats, overallSource: meta.current ? meta.url : undefined, currentBoard: context.back,
              } : undefined} picked={view.tiers[entry.trait.id]}
              onPick={tier => setView({ ...view, tiers: { ...view.tiers, [entry.trait.id]: tier } })} links={links[entry.trait.id]} />)}
          </section>
        ))}
      </div>
      {comparison && <SourceComparison data={comparison} filter={view.comparison} onFilter={comparison => setView({ ...view, comparison })} />}
    </>
  );
}
