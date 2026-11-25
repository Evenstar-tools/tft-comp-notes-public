"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Hexagon, Search } from "lucide-react";
import { unitMap } from "@/data";
import catalog from "@/data/augment-catalog.json";
import { augmentArtPath } from "@/data/augment-art";
import resultHistory from "@/data/augment-results.json";
import type { AugmentBoard } from "@/domain/guide-placement";
import {
  augmentCardId, augmentSearchText, currentSelectionSnapshot, isBronzeAugment, matchSelectionEntry, normalizeAugmentQuery, rarityClass, selectionSnapshots, tierOrder, validAugmentReturn,
  type AugmentEntry, type AugmentGuide, type SelectionRow,
} from "@/domain/augment-library";
import { guideLink } from "@/domain/guide-reading";
import { heroAugmentsById, heroAugmentProfileLink } from "@/domain/hero-augments";

import { AugmentBoardBuilds } from "./AugmentBoardBuilds";
import { HeroAugmentGear } from "./HeroAugmentDetails";
import { AugmentStats, augmentUrl, pageSize, useAugmentFilters, type AugmentParams } from "./AugmentStats";

const snapshots = selectionSnapshots(resultHistory);
const augmentUnits = new Map(Array.from(heroAugmentsById, ([id, augment]) => [id, unitMap.get(augment.unitId)]));
function sampleForSort(boards: AugmentBoard[]) {
  return boards.reduce<AugmentBoard | undefined>((best, board) =>
    board.mean !== undefined && (!best || board.games > best.games) ? board : best, undefined);
}

function Icon({entry}: {entry: AugmentEntry}) {
  const portrait = augmentUnits.get(entry.apiName)?.image;
  const src = portrait || augmentArtPath(entry);
  return <span className={"aug-icon "+rarityClass(entry.rarity)} aria-hidden="true"><Hexagon size={19}/>
    {src && <img key={src} className={portrait ? "aug-portrait" : undefined} loading="lazy" alt="" width={38} height={38} src={src}
      onError={e=>{e.currentTarget.hidden=true;}}/>}</span>;
}

function Detail({ entry, guide, samples, results, returnTo }: {
  entry: AugmentEntry; guide?: AugmentGuide; samples: AugmentBoard[]; results: SelectionRow[]; returnTo: string;
}) {
  const heroAugment = heroAugmentsById.get(entry.apiName);
  const battleSamples = heroAugment ? samples.filter(sample => sample.games > 0) : samples;
  const [panel, setPanel] = useState<"picks" | "boards">(results.length ? "picks" : "boards");
  const hasBoards = battleSamples.length > 0;
  const hasResults = results.length > 0;
  const primaryCovered = battleSamples.some(sample => sample.teamId === guide?.primaryTeamId);
  const guideEntry = panel === "picks" || !primaryCovered ? guide : undefined;
  const bronze = isBronzeAugment(entry.apiName);
  const boardLinks = guide && Object.fromEntries(Object.entries(guide.boardNames).map(([teamId, label]) =>
    [teamId, { label, href: guideLink(guide.sectionId, teamId, returnTo) }],
  ));
  return <div className={"aug-detail" + (heroAugment || hasBoards || hasResults ? " aug-detail-with-stats" : "")}>
    <div className="aug-effect">
      {heroAugment ? <>
        <strong>{heroAugment.baseRole} → {heroAugment.role}</strong>
        <p>{heroAugment.ability}</p>
      </> : <p>{entry.effect}</p>}
      {(heroAugment || bronze || guideEntry) && <nav className="aug-links" aria-label="相关资料">
        {heroAugment && <a href={heroAugmentProfileLink(heroAugment)}>对照常规技能</a>}
        {bronze && <a href="/combos?purpose=bronze">凑黄铜羁绊</a>}
        {guideEntry && <a href={guideLink(guideEntry.sectionId, guideEntry.primaryTeamId, returnTo)}>{guideEntry.title}</a>}
      </nav>}
    </div>
    {(heroAugment || hasBoards || hasResults) && <div className="aug-evidence">
      {heroAugment && <HeroAugmentGear augment={heroAugment} />}
      {hasBoards && hasResults && <div className="aug-detail-tabs" role="group" aria-label="海克斯战绩口径">
        <button type="button" aria-pressed={panel === "picks"} onClick={() => setPanel("picks")}>选取战绩</button>
        <button type="button" aria-pressed={panel === "boards"} onClick={() => setPanel("boards")}>主 C 出装战绩</button>
      </div>}
      {panel === "picks" && hasResults && <section className="aug-pick-results" aria-label="选取战绩">
        {!hasBoards && <h3>选取战绩</h3>}
        <ul>{results.map(row => <li key={row.round || "all"}><b>{row.round && row.round !== "all" ? row.round : "全回合"}</b>
            {row.mean != null && <span>均名 {row.mean.toFixed(2)}</span>}{row.top4 != null && <span>前四率 {row.top4}%</span>}
            {row.win != null && <span>登顶率 {row.win}%</span>}{row.grade && <span>评级 {row.grade}</span>}
            <span>{row.games == null ? "场数未公开" : row.games.toLocaleString("zh-CN") + " 场"}</span></li>)}</ul>
        <a href={augmentUrl({view:"stats",q:entry.name})}>查看选取榜</a>
      </section>}
      {panel === "boards" && hasBoards && <section className="aug-board-samples" aria-label="按主 C 出装识别的阵容战绩">
        {!hasResults && <h3>主 C 出装战绩</h3>}
        <AugmentBoardBuilds boards={battleSamples} boardLinks={boardLinks}/>
      </section>}
    </div>}
  </div>;
}

type Props = {
  guides: Record<string, AugmentGuide>; samples: Record<string, AugmentBoard[]>;
  initialId: string; initialSeason?: string; initialRealm?: string; initialQuery: string;
  initialView?: string; initialPatch?: string; currentPatch: string; initialFilters?: AugmentParams;
};

export function AugmentLibrary({guides, samples, initialId, initialSeason, initialRealm, initialQuery, initialView, initialPatch, currentPatch, initialFilters}: Props) {
  const stats = initialView === "stats" || initialView === "full" || !!initialSeason && (initialSeason !== "19" || initialRealm === "live");
  const scope = {season:initialSeason, realm:initialRealm, patch:initialPatch};
  const initial = { ...initialFilters, view:initialView, id:initialId, q:initialQuery, season:initialSeason, realm:initialRealm, patch:initialPatch };
  return <section className="aug-page">
    <header className="aug-heading"><h1>海克斯</h1>
      <nav aria-label="海克斯查询"><a href={stats ? augmentUrl({q:initialQuery, tier:initialFilters?.tier}) : "/augments"} aria-current={!stats ? "page" : undefined}>强化图鉴</a>
        {stats ? <span aria-current="page">选取战绩</span> :
          <a href={augmentUrl({view:"stats",...scope,q:initialQuery,tier:initialFilters?.tier})}>选取战绩</a>}</nav>
      {!stats && <details className="aug-catalog-source">
        <summary>资料来源</summary>
        <a href={catalog.source} target="_blank" rel="noreferrer" aria-label={`PBE ${currentPatch} 海克斯来源`}>PBE {currentPatch} ↗</a>
      </details>}
    </header>
    {stats ? <AugmentStats snapshots={snapshots} currentPatch={currentPatch} initial={initial}/> :
      <Catalog guides={guides} samples={samples} currentPatch={currentPatch} initial={initial}/>}
  </section>;
}

function Catalog({guides,samples,currentPatch,initial}:Pick<Props,"guides"|"samples"|"currentPatch"> & {initial:AugmentParams}) {
  const {filters,change,limit} = useAugmentFilters(initial);
  const {q:query="", tier:rarity="", round="", kind="", sort="default", id:open=""} = filters;
  const selection = currentSelectionSnapshot(snapshots,19,"pbe",currentPatch);
  const selectionById = useMemo(() => {
    const lookup = new Map<string,SelectionRow[]>();
    for (const row of selection?.rows ?? []) {
      const entry = matchSelectionEntry(row,catalog.rows);
      if (entry) lookup.set(entry.id, [...(lookup.get(entry.id) ?? []), row]);
    }
    return lookup;
  }, [selection]);
  const initialId = initial.limit ? "" : initial.id;
  const representative = useMemo(() => Object.fromEntries(Object.entries(samples)
    .map(([name, boards]) => [name, sampleForSort(boards)])), [samples]);
  const rows=useMemo(()=>{
    const normalized=normalizeAugmentQuery(query);
    return catalog.rows.filter(e=>(!rarity || e.rarity===rarity) && (!round || e.rounds.includes(round)) &&
      (!kind || e.kind===kind) && (!normalized || augmentSearchText(e,guides[e.apiName],augmentUnits.get(e.apiName)).includes(normalized))).sort((a,b)=>{
      if (sort==="rarity") return tierOrder.indexOf(a.rarity)-tierOrder.indexOf(b.rarity) || a.name.localeCompare(b.name,"zh-CN");
      if (sort==="name") return a.name.localeCompare(b.name,"zh-CN");
      if (sort==="board") return (representative[a.english]?.mean ?? 9)-(representative[b.english]?.mean ?? 9);
      const priority=(e:AugmentEntry)=>e.id===initialId ? 0 : e.kind==="hero" ? 1 : isBronzeAugment(e.apiName) ? 2 : 3;
      return priority(a)-priority(b);
    });
  },[query,rarity,round,kind,sort,guides,representative,initialId]);
  const visibleLimit = Math.max(limit, rows.findIndex(row => row.id === open) + 1);
  const pairs: AugmentEntry[][] = [];
  for (let i = 0; i < Math.min(visibleLimit, rows.length); i += 2) {
    pairs.push(rows.slice(i, Math.min(i + 2, visibleLimit)));
  }
  function reset() { change({q:undefined,tier:undefined,round:undefined,kind:undefined,sort:undefined,id:undefined}); }
  function choose(id:string) { change({id:open===id ? undefined : id, limit:filters.limit}); }
  const origin = validAugmentReturn(initial.from);
  const returnView = origin && new URL(origin,"https://tft.local").searchParams.get("view");
  const returnTo = returnView === "stats" || returnView === "full" ? origin : undefined;
  return <>
      {returnTo && <a className="aug-return" href={returnTo}>← 返回选取战绩</a>}
      <div className="aug-tools aug-catalog-tools"><label className="aug-search"><Search size={16}/><input aria-label="搜索海克斯" type="search" value={query} placeholder="搜海克斯、英雄或效果" onChange={e=>{change({q:e.target.value});}}/></label>
        <select aria-label="品质" value={rarity} onChange={e=>{change({tier:e.target.value});}}><option value="">全部品质</option>{tierOrder.map(t=><option key={t}>{t}</option>)}</select>
        <select aria-label="出现回合" value={round} onChange={e=>{change({round:e.target.value});}}><option value="">全部回合</option>{["2-1","3-2","4-2"].map(t=><option key={t}>{t}</option>)}</select>
        <select aria-label="强化类型" value={kind} onChange={e=>{change({kind:e.target.value});}}><option value="">全部类型</option><option value="hero">英雄专属</option><option value="trait">羁绊强化</option><option value="regular">通用强化</option></select>
        <select aria-label="排序" value={sort} onChange={e=>{change({sort:e.target.value});}}><option value="default">默认排序</option><option value="board">按配装均名</option><option value="rarity">按品质</option><option value="name">按名称</option></select></div>
      <p className={query || rarity || round || kind || sort === "board" ? "aug-result-count" : "sr-only"} role="status">{rows.length} 个强化{sort==="board" && " · 取各强化场数最多的配装"}</p>
      <div className="aug-list">{pairs.map(pair => <div className="aug-pair" key={pair[0].id}>{pair.map(e=>{
        const expanded=open===e.id, boards=samples[e.english] ?? [], sample=representative[e.english];
        const hero = heroAugmentsById.get(e.apiName);
        const results = selectionById.get(e.id) ?? [];
        const effectOnly = !hero && !boards.length && !results.length;
        const description = hero
          ? [augmentUnits.get(e.apiName)?.name, !expanded && hero.role].filter(Boolean).join(" · ")
          : expanded ? "" : e.effect;
        const cardId = augmentCardId(e.id);
        const descriptionIds = [description && cardId + "-effect", e.rounds.length && cardId + "-rounds"].filter(Boolean).join(" ");
        return <Fragment key={e.id}><button id={cardId} type="button" className="aug-row" aria-expanded={expanded}
          aria-label={e.name+" · "+e.rarity} aria-describedby={descriptionIds || undefined}
          aria-controls={expanded?"info-"+e.id:undefined} onClick={()=>choose(e.id)}>
          <Icon entry={e}/><span className="aug-identity"><strong>{e.name}</strong>
            {description && <small id={cardId+"-effect"}>{description}</small>}
          </span>
          {sort==="board" && sample?.mean !== undefined && <span className="aug-mean">同装均名 {sample.mean.toFixed(2)}<small>{sample.games} 场</small></span>}
          <span className="aug-row-meta"><span className={"aug-tier "+rarityClass(e.rarity)}>{e.rarity}</span>
            {e.rounds.length > 0 && <small id={cardId+"-rounds"}>{e.rounds.join(" / ")}</small>}</span><ChevronDown className="aug-chevron" size={15}/></button>
          {expanded && <div id={"info-"+e.id} className="aug-detail-panel" data-effect-only={effectOnly || undefined}>
            <Detail entry={e} guide={guides[e.apiName]} samples={boards}
              results={results} returnTo={augmentUrl({...filters,id:e.id,limit:String(visibleLimit)}) + "#" + cardId} /></div>}</Fragment>;
      })}</div>)}</div>
      {rows.length===0 && <p className="aug-empty">没有匹配的海克斯。<button type="button" onClick={reset}>重置筛选</button></p>}
      {rows.length>visibleLimit && <button className="aug-more" onClick={()=>change({limit:String(visibleLimit+pageSize)})}>显示更多（剩余 {rows.length-visibleLimit}）</button>}
  </>;
}
