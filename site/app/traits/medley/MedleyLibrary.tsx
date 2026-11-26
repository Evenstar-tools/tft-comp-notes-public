"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, Minus, Search, X } from "lucide-react";
import { TraitBadge } from "@/components/Glyphs";
import { itemMap, traitMap, unitMap } from "@/data";
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
    <p>娑娜属于每组，上场才计数。上场 {collab.thresholds.join(" / ")} 名开启对应档位。来牌顺就早开 3 合奏，灵感有机会送弈子复制体，省下买牌和刷新金币。缺牌或要拆关键羁绊时，沿用原过渡。</p>
    <p>终盘上场满 3 张、同定位主 C 能接开局合奏棋子的输出装、加入 4–5 费合奏后仍能开 3，各算一项。勾数相同时优先过渡能开合奏、低费留牌多的路线。</p>
  </details>;
}

function FitPortrait({ id, nameVisible }: { id: string; nameVisible?: boolean }) {
  const unit = unitMap.get(id);
  if (!unit) return null;
  const name = compactNames[id] ?? unit.name;
  return <span className={"medley-fit-portrait cost-" + unit.cost} title={name}>
    <img src={unit.image} alt={nameVisible ? "" : name} width={26} height={26} loading="lazy" decoding="async" />
    {nameVisible && <span>{name}</span>}
  </span>;
}

function FitCheck({ label, met, children }: { label: string; met: boolean; children?: ReactNode }) {
  return <div className="medley-check" data-met={met}>
    <div className="medley-check-label">
      {met ? <Check size={15} strokeWidth={2.6} aria-hidden="true" /> : <Minus size={15} aria-hidden="true" />}
      <span>{label}</span>
      <span className="sr-only">{met ? "达成" : "未达成"}</span>
    </div>
    {children}
  </div>;
}

function MedleyFitChecks({ fit }: { fit: MedleyGuideFit }) {
  const handoff = fit.handoff;
  return <div className="medley-fit-checks" aria-label="适配条件">
    <FitCheck label={`终盘 ${fit.finalIds.length} 张`} met={fit.finalIds.length >= 3}>
      <div className="medley-fit-portraits">
        {fit.finalIds.map(id => <FitPortrait key={id} id={id} />)}
      </div>
      {!fit.score && <small className="medley-fit-note">低费留 {fit.cheapIds.length} 张</small>}
    </FitCheck>
    <FitCheck label="同定位接装" met={!!handoff}>
      {handoff && <>
        <div className="medley-fit-portraits medley-fit-handoff">
          <FitPortrait id={handoff.fromId} nameVisible />
          {handoff.fromId === handoff.toId ? <small>留原装</small> : <>
            <ArrowRight size={13} aria-hidden="true" /><span className="sr-only">交给</span>
            <FitPortrait id={handoff.toId} nameVisible />
          </>}
        </div>
        <div className="medley-fit-items">
          {handoff.itemIds.map(id => {
            const item = itemMap.get(id);
            return item?.image && <img key={id} src={item.image} title={item.name} alt={item.name}
              width={18} height={18} loading="lazy" decoding="async" />;
          })}
        </div>
        {handoff.source === "guide" && <small className="medley-fit-note">攻略换人</small>}
      </>}
    </FitCheck>
    <FitCheck label="4–5费开3" met={fit.lateIds.length > 0 && fit.finalIds.length >= 3}>
      <div className="medley-fit-portraits">
        {fit.lateIds.map(id => <FitPortrait key={id} id={id} />)}
      </div>
    </FitCheck>
  </div>;
}

function MedleyGroup({ group, matches, fits, focused, showFits }: {
  group: (typeof groups)[number];
  matches: Set<string>[];
  fits?: MedleyGuideFit[];
  focused: boolean;
  showFits: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<MedleyGuideFit | null>(null);
  const [keyFocused, setKeyFocused] = useState<MedleyGuideFit | null>(null);
  const [picked, setPicked] = useState<MedleyGuideFit | null>(null);
  const visible = showFits || open;
  const active = visible ? hovered ?? keyFocused ?? picked : null;
  const fitIds = new Set(active ? [...active.finalIds, active.handoff?.fromId] : []);
  const routeList = visible && !!fits?.length && <ul className="medley-fit-list" aria-label="适配阵容">
    {fits.map(fit => <li key={fit.sectionId} className="medley-fit-row" data-active={active === fit || undefined}
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(fit); }}
      onPointerLeave={() => setHovered(null)}
      onFocus={event => { if (event.target.matches(":focus-visible")) setKeyFocused(fit); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyFocused(null); }}>
      <header className="medley-fit-head">
        <button type="button" aria-pressed={picked === fit} onClick={() => setPicked(picked === fit ? null : fit)}>{fit.title}</button>
        <div className="medley-fit-links">
          {fit.stageHref
            ? <a href={fit.stageHref} aria-label={"查看过渡：" + fit.title}>{fit.handoff?.source === "guide" ? "原过渡" : "过渡"}</a>
            : <span>过渡待核</span>}
          <a href={fit.finalHref} aria-label={"查看阵容：" + fit.title}>
            终盘<ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </header>
      <MedleyFitChecks fit={fit} />
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
    {focused && !fits?.length && <p className="medley-empty">这组暂无已核对的适配阵容。</p>}
    {!!fits?.length && (showFits ? <section className="medley-fits-focused" aria-label="适配阵容">
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
  const showFits = terms.length > 0 && shownGroups.length < groups.length;

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
      </div>
      <div className="medley-search-context">
        <span className="medley-count" role="status">{shownGroups.length} 组{terms.length || fitOnly ? "匹配" : ""}</span>
        <span id="medley-search-hint">输入多个英雄，用空格隔开</span>
        {fitCount > 0 && fitCount < groups.length && <label className="medley-fit-filter">
          <input type="checkbox" checked={fitOnly} onChange={event => setFitOnly(event.target.checked)} />只看适配
        </label>}
        {fixedMatched && <span>{fixed.name}属于每组，上场才计数</span>}
      </div>
    </div>
    <MedleyHow />
    {shownGroups.length ? <ul className={focused ? "medley-groups is-focused" : "medley-groups"} aria-label="合奏组合列表">
      {shownGroups.map(group => <MedleyGroup key={group.number + ":" + showFits} group={group} matches={matches}
        fits={fitsByGroup[group.number]} focused={focused} showFits={showFits} />)}
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
