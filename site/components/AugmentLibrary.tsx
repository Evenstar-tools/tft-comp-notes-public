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
import { HeroAugmentGear, HeroSkill } from "./HeroAugmentDetails";
import { AugmentStats, augmentUrl, pageSize, useAugmentFilters, type AugmentParams } from "./AugmentStats";

const snapshots = selectionSnapshots(resultHistory);
const augmentUnits = new Map(Array.from(heroAugmentsById, ([id, augment]) => [id, unitMap.get(augment.unitId)]));
const catalogSorts = [
  ["default", "默认排序"],
  ["board", "按配装均名"],
  ["rarity", "按品质"],
  ["name", "按名称"],
] as const;
const catalogFacets = [
  { key: "tier", label: "品质", options: [...tierOrder].reverse().map(tier => [tier, tier] as const) },
  { key: "round", label: "回合", options: [["2-1", "2-1"], ["3-2", "3-2"], ["4-2", "4-2"]] },
  { key: "kind", label: "类型", options: [["regular", "通用强化"], ["hero", "英雄专属"], ["trait", "羁绊强化"]] },
] as const;

function sampleForSort(boards: AugmentBoard[]) {
  return boards.reduce<AugmentBoard | undefined>((best, board) =>
    board.mean !== undefined && (!best || board.games > best.games) ? board : best, undefined);
}

function representativePick(rows: SelectionRow[]) {
  const available = rows.filter(row => row.games !== 0 && (row.mean != null || row.top4 != null || row.grade));
  return available.find(row => !row.round || row.round === "all") ??
    available.reduce<SelectionRow | undefined>((best, row) =>
      !best || (row.mean ?? Infinity) < (best.mean ?? Infinity) ? row : best, undefined);
}

function EffectText({ text }: { text: string }) {
  const parts = text.split(/(【[^】]+】|\d+(?:[.,/–-]\d+)*(?:[%％]|[ \t]*(?:次(?:免费)?商店刷新|个回合|最大生命值|生命值|法力回复|法术强度|魔法伤害|物理伤害|真实伤害|伤害增幅|攻击速度|魔法抗性|经验值?|攻击力|法强|法力值?|金币|护甲|人口|回合|级|秒|费|星|格|倍|件|个|次)))/u);
  return <>{parts.map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)}</>;
}

function Icon({entry}: {entry: AugmentEntry}) {
  const portrait = augmentUnits.get(entry.apiName)?.image;
  const src = portrait || augmentArtPath(entry);
  return <span className={"aug-icon "+rarityClass(entry.rarity)} aria-hidden="true"><Hexagon size={19}/>
    {src && <img key={src} className={portrait ? "aug-portrait" : undefined} loading="lazy" alt="" width={38} height={38} src={src}
      onError={e=>{e.currentTarget.hidden=true;}}/>}</span>;
}

function AugmentCard({ entry, cardId, sample, results, expanded, onClick }: {
  entry: AugmentEntry; cardId: string; sample?: AugmentBoard; results: SelectionRow[];
  expanded: boolean; onClick: () => void;
}) {
  const hero = heroAugmentsById.get(entry.apiName);
  const heroName = hero && augmentUnits.get(entry.apiName)?.name;
  const name = hero?.label ?? entry.name;
  const boardMean = sample?.mean;
  const pick = boardMean == null ? representativePick(results) : undefined;
  const mean = boardMean ?? pick?.mean;
  const hasStats = mean != null || !!pick;
  const tone = mean == null || mean > 4.35 ? "neutral" : mean <= 4 ? "strong" : "good";
  const effectId = cardId + "-effect";
  const roundsId = entry.rounds.length ? cardId + "-rounds" : undefined;
  const statsId = hasStats ? cardId + "-stats" : undefined;

  return <button id={cardId} type="button" className={"aug-card " + rarityClass(entry.rarity)} aria-expanded={expanded}
    aria-label={name + " · " + entry.rarity} aria-describedby={[roundsId, effectId, statsId].filter(Boolean).join(" ")}
    aria-controls={expanded ? "info-" + entry.id : undefined} onClick={onClick}>
    <span className="aug-card-head">
      <span className="aug-card-identity">
        <Icon entry={entry}/>
        <span className="aug-identity">
          <strong className="aug-card-name">{name}</strong>
          <span className="aug-card-tags">
            <span className={"aug-tier " + rarityClass(entry.rarity)}>{entry.rarity}</span>
            {roundsId && <span className="aug-card-rounds" id={roundsId} aria-label={"出现回合 " + entry.rounds.join("、")}>
              {entry.rounds.map(round => <span className="aug-round" key={round}>{round}</span>)}
            </span>}
          </span>
        </span>
      </span>
      <span className="aug-card-aside">
        {hasStats && <span className="aug-card-stat" id={statsId}>
          <span className="aug-card-stat-note">{pick
            ? "选取 · " + (!pick.round || pick.round === "all" ? "全回合" : pick.round)
            : "S19 配装均名"}</span>
          <span className={"aug-stat-badge " + tone}>
            {(pick?.grade || mean != null) && <strong>{[pick?.grade, mean?.toFixed(2)].filter(Boolean).join(" · ")}</strong>}
            {pick?.top4 != null && <span>前四 {pick.top4}%</span>}
          </span>
          {boardMean != null && sample && <span className="aug-card-stat-note">{sample.games.toLocaleString("zh-CN")} 场</span>}
        </span>}
        <ChevronDown className="aug-chevron" size={15} aria-hidden="true"/>
      </span>
    </span>
    <span className="aug-card-effect" id={effectId}>
      {hero && <strong className="aug-card-role">{heroName && heroName + " · "}{hero.baseRole} → {hero.role}</strong>}
      <EffectText text={entry.effect}/>
      {hero && <span className="aug-card-skill"><EffectText text={hero.ability}/></span>}
    </span>
  </button>;
}

function Detail({ entry, guide, samples, results, returnTo }: {
  entry: AugmentEntry; guide?: AugmentGuide; samples: AugmentBoard[]; results: SelectionRow[]; returnTo: string;
}) {
  const heroAugment = heroAugmentsById.get(entry.apiName);
  const heroUnit = augmentUnits.get(entry.apiName);
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
      {heroAugment && entry.effect && entry.effect !== heroAugment.ability &&
        <p className="aug-hero-effect-mobile"><EffectText text={entry.effect} /></p>}
      {heroAugment && heroUnit ? <HeroSkill unit={heroUnit} augment={heroAugment} defaultAugmented showGear={false}/> : heroAugment ? <>
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
    return catalog.rows.filter(e => {
      if ((rarity && e.rarity !== rarity) || (round && !e.rounds.includes(round)) || (kind && e.kind !== kind)) return false;
      if (!normalized || augmentSearchText(e, guides[e.apiName], augmentUnits.get(e.apiName)).includes(normalized)) return true;
      const hero = heroAugmentsById.get(e.apiName);
      return !!hero && normalizeAugmentQuery(hero.label + " " + hero.ability).includes(normalized);
    }).sort((a,b)=>{
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
      <div className="aug-filter-card">
        <div className="aug-filter-top">
          <label className="aug-search">
            <Search size={17} aria-hidden="true"/>
            <input aria-label="搜索海克斯" type="search" value={query} placeholder="搜海克斯名、英雄或效果"
              onChange={event => change({ q: event.target.value })}/>
          </label>
          <div className="aug-sort-segments" role="group" aria-label="排序">
            {catalogSorts.map(([value, label]) => <button type="button" key={value}
              aria-pressed={sort === value} onClick={() => change({ sort: value })}>{label}</button>)}
          </div>
        </div>
        <div className="aug-filter-facets">
          {catalogFacets.map(({ key, label, options }) => <div className="aug-filter-group" role="group" aria-label={label} key={key}>
            <span className="aug-filter-label" aria-hidden="true">{label}</span>
            <span className="aug-filter-options">
              {[["", "全部"], ...options].map(([value, option]) => <button type="button" key={value}
                className="aug-filter-chip" aria-pressed={(filters[key] ?? "") === value}
                onClick={() => change({ [key]: value })}>
                {key === "tier" && value && <span className={"aug-tier-dot " + rarityClass(value)} aria-hidden="true"/>}
                {option}
              </button>)}
            </span>
          </div>)}
        </div>
      </div>
      <p className={query || rarity || round || kind || sort === "board" ? "aug-result-count" : "sr-only"} role="status">{rows.length} 个强化{sort==="board" && " · 取各强化场数最多的配装"}</p>
      <div className="aug-list">{pairs.map(pair => <div className="aug-pair" key={pair[0].id}>{pair.map(entry => {
        const expanded = open === entry.id;
        const boards = samples[entry.english] ?? [];
        const results = selectionById.get(entry.id) ?? [];
        const effectOnly = !heroAugmentsById.has(entry.apiName) && !boards.length && !results.length;
        const cardId = augmentCardId(entry.id);
        return <Fragment key={entry.id}>
          <AugmentCard entry={entry} cardId={cardId} sample={representative[entry.english]} results={results}
            expanded={expanded} onClick={() => choose(entry.id)}/>
          {expanded && <div id={"info-" + entry.id} className="aug-detail-panel" data-effect-only={effectOnly || undefined}>
            <Detail entry={entry} guide={guides[entry.apiName]} samples={boards} results={results}
              returnTo={augmentUrl({ ...filters, id: entry.id, limit: String(visibleLimit) }) + "#" + cardId}/>
          </div>}
        </Fragment>;
      })}</div>)}</div>
      {rows.length===0 && <p className="aug-empty">没有匹配的海克斯。<button type="button" onClick={reset}>重置筛选</button></p>}
      {rows.length>visibleLimit && <button className="aug-more" onClick={()=>change({limit:String(visibleLimit+pageSize)})}>显示更多（剩余 {rows.length-visibleLimit}）</button>}
  </>;
}
