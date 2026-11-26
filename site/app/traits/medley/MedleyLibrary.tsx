"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, Search, X } from "lucide-react";
import { TraitBadge } from "@/components/Glyphs";
import { traitMap, unitMap } from "@/data";
import catalog from "@/data/medley-groups.json";
import type { MedleyGuideFit } from "@/domain/medley-fit";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import type { Unit } from "@/domain/types";

const fixed = unitMap.get(catalog.fixedUnit)!;
const collab = traitMap.get("collab")!;
const groups = catalog.groups.map(group => ({
  number: group.number,
  units: group.unitIds.map(id => unitMap.get(id)!),
}));
const candidateIds = new Set([fixed.id, ...catalog.groups.flatMap(group => group.unitIds)]);
const unitNames = [...candidateIds].map(id => ({
  id,
  names: unitSearchNames(unitMap.get(id)!).map(name => name.toLowerCase()),
}));
const compactNames: Record<string, string> = { "renata-glasc": "烈娜塔", "nunu-willump": "努努" };

function matchingUnits(term: string) {
  const exact = unitNames.filter(unit => unit.names.includes(term));
  const matched = exact.length ? exact : unitNames.filter(unit => unit.names.some(name => name.includes(term)));
  return new Set(matched.map(unit => unit.id));
}

function MedleyUnit({ unit, matched, fitMatch }: { unit: Unit; matched: boolean; fitMatch: boolean }) {
  const label = unit.name + "，" + unit.cost + " 费" + (fitMatch ? "，适配棋子" : "");
  return <a className={"medley-unit cost-" + unit.cost} data-matched={matched || undefined} data-fit-match={fitMatch || undefined}
    href={"/heroes?" + new URLSearchParams({ unit: unit.id })} aria-label={label} title={label}>
    <img src={unit.image} alt="" width={37} height={37} loading="lazy" decoding="async" />
    <span>{compactNames[unit.id] ?? unit.name}</span>
  </a>;
}

function MedleyHow() {
  return <details className="medley-how">
    <summary><ChevronRight size={14} aria-hidden="true" />合奏怎么玩</summary>
    <p>娑娜固定计入，上场 {collab.thresholds.join(" / ")} 名开启对应档位。来牌顺就早开 3 合奏，灵感有机会送弈子复制体，省下买牌和刷新金币。缺牌或要拆关键羁绊时，沿用原过渡。</p>
    <p>优先找能留到成型的 1–3 费合奏牌。能留 1–2 张就可以考虑，3 张更适合。成型还能补高费合奏、主 C 能接装时优先。</p>
  </details>;
}

function MedleyGroup({ group, matches, fits, focused }: {
  group: (typeof groups)[number];
  matches: Set<string>[];
  fits?: MedleyGuideFit[];
  focused: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<MedleyGuideFit | null>(null);
  const [keyFocused, setKeyFocused] = useState<MedleyGuideFit | null>(null);
  const [picked, setPicked] = useState<MedleyGuideFit | null>(null);
  const visible = focused || open;
  const active = visible ? hovered ?? keyFocused ?? picked : null;
  const fitIds = new Set(active ? [...active.cheapIds, ...active.lateIds] : []);
  const routeList = visible && !!fits?.length && <ul className="medley-fit-list" aria-label="适配阵容">
    {fits.map(fit => <li key={fit.sectionId} className="medley-fit-row" data-active={active === fit || undefined}
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(fit); }}
      onPointerLeave={() => setHovered(null)}
      onFocus={event => { if (event.target.matches(":focus-visible")) setKeyFocused(fit); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyFocused(null); }}>
      <button type="button" aria-pressed={picked === fit} onClick={() => setPicked(picked === fit ? null : fit)}>{fit.title}</button>
      <a href={fit.finalHref} aria-label={"查看阵容：" + fit.title} title="查看阵容"><ArrowUpRight size={15} aria-hidden="true" /></a>
    </li>)}
  </ul>;

  return <li className="medley-group">
    <div className="medley-group-roster">
      <header className="medley-group-heading">
        <h2>{focused ? "合奏搭档" : "组合 " + group.number}</h2>
        <span>{focused ? "第 " + group.number + " 组" : group.units.length + " 位搭档"}</span>
      </header>
      <ul className={group.units.length === 5 ? "medley-roster five" : "medley-roster"}>
        {group.units.map(unit => <li key={unit.id}>
          <MedleyUnit unit={unit} matched={matches.some(ids => ids.has(unit.id))} fitMatch={fitIds.has(unit.id)} />
        </li>)}
      </ul>
    </div>
    {!!fits?.length && (focused ? <section className="medley-fits-focused" aria-label="适配阵容">
      <div className="medley-group-heading"><h2>适配阵容</h2><span>{fits.length} 套</span></div>
      {routeList}
    </section> : <details className="medley-fits" onToggle={event => {
      const next = event.currentTarget.open;
      setOpen(next);
      if (!next) {
        setHovered(null);
        setKeyFocused(null);
        setPicked(null);
      }
    }}>
      <summary><ChevronRight size={14} aria-hidden="true" />适配阵容 <span>{fits.length} 套</span></summary>
      {routeList}
    </details>)}
  </li>;
}

export function MedleyLibrary({ fitsByGroup }: { fitsByGroup: Record<number, MedleyGuideFit[]> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [fitOnly, setFitOnly] = useState(false);
  const terms = query.trim().toLowerCase().split(/[\s、，,]+/).filter(Boolean);
  const matches = terms.map(matchingUnits);
  const fixedMatched = matches.some(units => units.has(fixed.id));
  const fitCount = groups.filter(group => fitsByGroup[group.number]?.length).length;
  const shownGroups = groups.filter(group => (!fitOnly || fitsByGroup[group.number]?.length) &&
    matches.every(units => units.has(fixed.id) || group.units.some(unit => units.has(unit.id))));
  const focused = terms.length > 0 && shownGroups.length === 1;

  function clearSearch() {
    setQuery("");
    inputRef.current?.focus();
  }

  return <div className="medley-library">
    <a className="text-link medley-back" href="/traits?trait=collab"><ArrowLeft size={14} aria-hidden="true" />羁绊速查</a>
    <header className="medley-heading">
      <div className="medley-title"><TraitBadge trait={collab} size={32} /><h1>合奏组合</h1></div>
      <p>每局随机一组（各 {(catalog.probability * 100).toFixed(1)}%）</p>
    </header>
    <div className="medley-search-region" role="search" aria-label="合奏组合">
      <label className="medley-search-label" htmlFor="medley-hero-search">搜英雄</label>
      <div className="medley-toolbar">
        <div className="medley-search">
          <Search size={16} aria-hidden="true" />
          <input ref={inputRef} id="medley-hero-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
            aria-describedby="medley-search-hint" placeholder="英雄名或外号，如 塔里克" />
          {!!query && <button type="button" className="medley-clear" aria-label="清除搜索" onClick={clearSearch}>
            <X size={17} aria-hidden="true" />
          </button>}
        </div>
        {fitCount > 0 && fitCount < groups.length && <label className="medley-fit-filter">
          <input type="checkbox" checked={fitOnly} onChange={event => setFitOnly(event.target.checked)} />只看适配
        </label>}
      </div>
      <div className="medley-search-context">
        <span className="medley-count" role="status">{shownGroups.length} 组{terms.length || fitOnly ? "匹配" : ""}</span>
        <span id="medley-search-hint">输入多个英雄，用空格隔开</span>
        {fixedMatched && <span>{fixed.name}固定计入每组</span>}
      </div>
    </div>
    <MedleyHow />
    {shownGroups.length ? <ul className={focused ? "medley-groups is-focused" : "medley-groups"} aria-label="合奏组合列表">
      {shownGroups.map(group => <MedleyGroup key={group.number + ":" + focused} group={group} matches={matches}
        fits={fitsByGroup[group.number]} focused={focused} />)}
    </ul> : <p className="medley-empty">没有找到符合条件的组合。 <button type="button" onClick={() => {
      setFitOnly(false);
      clearSearch();
    }}>清除筛选</button></p>}
    <footer className="medley-source">
      <span>资料核对 {catalog.checkedOn}</span>
      <a href={catalog.sources.maomi} target="_blank" rel="noreferrer">猫咪 TFT <ArrowUpRight size={13} aria-hidden="true" /></a>
      <a href={catalog.sources.tftips} target="_blank" rel="noreferrer">TFTips 对照 <ArrowUpRight size={13} aria-hidden="true" /></a>
    </footer>
  </div>;
}
