"use client";

import { useState } from "react";
import { ArrowLeft, ArrowUpRight, Search } from "lucide-react";
import { TraitBadge } from "@/components/Glyphs";
import { traitMap, unitMap } from "@/data";
import catalog from "@/data/medley-groups.json";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import type { Unit } from "@/domain/types";

const fixed = unitMap.get(catalog.fixedUnit)!;
const collab = traitMap.get("collab")!;
const searchNames = (unit: Unit) => unitSearchNames(unit).map(name => name.toLowerCase());
const groups = catalog.groups.map(group => ({
  number: group.number,
  units: group.unitIds.map(id => unitMap.get(id)!),
}));
const candidateIds = new Set([fixed.id, ...catalog.groups.flatMap(group => group.unitIds)]);
const unitNames = [...candidateIds].map(id => ({ id, names: searchNames(unitMap.get(id)!) }));

function matchingUnits(term: string) {
  const exact = unitNames.filter(unit => unit.names.includes(term));
  const matched = exact.length ? exact : unitNames.filter(unit => unit.names.some(name => name.includes(term)));
  return new Set(matched.map(unit => unit.id));
}

const compactNames: Record<string, string> = { "renata-glasc": "烈娜塔", "nunu-willump": "努努" };

function heroLink(unit: Unit) {
  return "/heroes?" + new URLSearchParams({ unit: unit.id });
}

function MedleyUnit({ unit, matched }: { unit: Unit; matched?: boolean }) {
  return <a className={"medley-unit cost-" + unit.cost} data-matched={matched || undefined}
    href={heroLink(unit)} aria-label={unit.name + "，" + unit.cost + " 费"} title={unit.name + " · " + unit.cost + " 费"}>
    <img src={unit.image} alt="" width={37} height={37} loading="lazy" decoding="async" />
    <span>{compactNames[unit.id] ?? unit.name}</span>
  </a>;
}

export function MedleyLibrary() {
  const [query, setQuery] = useState("");
  const cleaned = query.trim().toLowerCase();
  const groupNumber = /^(?:组合\s*|#\s*)?(\d+)$/.exec(cleaned);
  const terms = cleaned.split(/[\s、，,]+/).filter(Boolean);
  const matches = groupNumber ? [] : terms.map(matchingUnits);
  const shownGroups = groups.filter(group => groupNumber
    ? group.number === Number(groupNumber[1])
    : matches.every(units => units.has(fixed.id) || group.units.some(unit => units.has(unit.id))));

  return <div className="medley-library">
    <a className="text-link medley-back" href="/traits?trait=collab"><ArrowLeft size={14} aria-hidden="true" />羁绊速查</a>
    <header className="medley-heading">
      <div>
        <div className="medley-title"><TraitBadge trait={collab} size={32} /><h1>合奏组合</h1></div>
        <p>S{catalog.set} {catalog.environment} · 每局随机一组，每组 {(catalog.probability * 100).toFixed(1)}%</p>
      </div>
      <div className="medley-fixed">
        <MedleyUnit unit={fixed} />
        <p><strong>娑娜固定计入</strong><span>上场 {collab.thresholds.join(" / ")} 名合奏弈子开启对应档位</span></p>
      </div>
    </header>
    <div className="medley-toolbar">
      <label className="medley-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)}
          aria-label="搜弈子或组合号" placeholder="搜弈子、外号或组号" />
      </label>
      <span className="medley-count" role="status">{cleaned ? shownGroups.length + " / " : ""}{groups.length} 组</span>
    </div>
    {shownGroups.length ? <ul className="medley-groups" aria-label="合奏组合列表">
      {shownGroups.map(group => <li key={group.number} className="medley-group">
        <header><h2>组合 {group.number}</h2><span>{group.units.length} 位搭档</span></header>
        <ul className="medley-roster">
          {group.units.map(unit => <li key={unit.id}>
            <MedleyUnit unit={unit} matched={matches.some(units => units.has(unit.id))} />
          </li>)}
        </ul>
      </li>)}
    </ul> : <p className="medley-empty">没有符合条件的合奏组合。 <button type="button" onClick={() => setQuery("")}>清除搜索</button></p>}
    <footer className="medley-source">
      <span>资料核对 {catalog.checkedOn}</span>
      <a href={catalog.sources.maomi} target="_blank" rel="noreferrer">猫咪 TFT <ArrowUpRight size={13} aria-hidden="true" /></a>
      <a href={catalog.sources.tftips} target="_blank" rel="noreferrer">TFTips 对照 <ArrowUpRight size={13} aria-hidden="true" /></a>
    </footer>
  </div>;
}
