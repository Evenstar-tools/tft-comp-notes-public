"use client";

import { useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, Search } from "lucide-react";
import { TraitBadge } from "@/components/Glyphs";
import { itemMap, traitMap, unitMap } from "@/data";
import catalog from "@/data/medley-groups.json";
import type { MedleyGuideFit } from "@/domain/medley-fit";
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

function unitName(id: string) {
  return compactNames[id] ?? unitMap.get(id)?.name ?? id;
}

function FitScore({ score, best }: { score: number; best?: boolean }) {
  return <span className="medley-fit-score">
    {best ? "最高 " : <span className="sr-only">适配分 </span>}{score} / 5
  </span>;
}

function MedleyFits({ fits, initiallyOpen }: { fits: MedleyGuideFit[]; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className="medley-fits" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>
      <ChevronRight size={14} aria-hidden="true" />
      <strong>适配阵容</strong>
      <span>{fits.length} 套</span>
      <FitScore score={fits[0].score} best />
    </summary>
    {open && <ul className="medley-fit-list">
      {fits.map(fit => {
        const extra = Math.max(0, 3 - fit.openingCount);
        const gear = fit.handoff?.itemIds.map(id => itemMap.get(id)?.name).filter(Boolean).join("、");
        return <li key={fit.sectionId + ":" + fit.teamId} className="medley-fit">
          <div className="medley-fit-title">
            <a href={fit.finalHref} title="查看成型棋盘">{fit.title}</a>
            <FitScore score={fit.score} />
          </div>
          <dl className="medley-fit-evidence">
            <dt>低费留牌</dt><dd>{fit.cheapIds.map(unitName).join("、")}</dd>
            <dt>过渡合奏</dt><dd>{fit.openingCount} 张{extra ? `，再补 ${extra} 张开 3` : "，可开 3"}</dd>
            {!!fit.lateIds.length && <><dt>成型高费</dt><dd>{fit.lateIds.map(unitName).join("、")}</dd></>}
            {fit.handoff && <>
              <dt>主 C 装备</dt>
              <dd>{unitName(fit.handoff.fromId)}{fit.handoff.fromId === fit.handoff.toId ? "保留装备" : ` → ${unitName(fit.handoff.toId)}`}
                {gear && <span className="medley-fit-gear">{gear}</span>}
              </dd>
            </>}
          </dl>
          <a className="text-link medley-fit-stage" href={fit.stageHref}>看{fit.stageLabel}<ChevronRight size={12} aria-hidden="true" /></a>
        </li>;
      })}
    </ul>}
  </details>;
}

export function MedleyLibrary({ fitsByGroup }: { fitsByGroup: Record<number, MedleyGuideFit[]> }) {
  const [query, setQuery] = useState("");
  const [fitOnly, setFitOnly] = useState(false);
  const cleaned = query.trim().toLowerCase();
  const groupNumber = /^(?:组合\s*|#\s*)?(\d+)$/.exec(cleaned);
  const terms = cleaned.split(/[\s、，,]+/).filter(Boolean);
  const matches = groupNumber ? [] : terms.map(matchingUnits);
  const fitCount = groups.filter(group => fitsByGroup[group.number]?.length).length;
  const shownGroups = groups.filter(group =>
    (!fitOnly || fitsByGroup[group.number]?.length) && (groupNumber
      ? group.number === Number(groupNumber[1])
      : matches.every(units => units.has(fixed.id) || group.units.some(unit => units.has(unit.id)))));

  return <div className="medley-library">
    <a className="text-link medley-back" href="/traits?trait=collab"><ArrowLeft size={14} aria-hidden="true" />羁绊速查</a>
    <header className="medley-heading">
      <div>
        <div className="medley-title"><TraitBadge trait={collab} size={32} /><h1>合奏组合</h1></div>
        <p>每局随机一组（各 {(catalog.probability * 100).toFixed(1)}%）</p>
      </div>
      <div className="medley-fixed">
        <MedleyUnit unit={fixed} />
        <p><strong>娑娜固定计入</strong><span>上场 {collab.thresholds.join(" / ")} 名开启对应档位</span></p>
      </div>
    </header>
    <section className="medley-how" aria-label="合奏过渡打法">
      <p><strong>来牌顺就早开 3 合奏。</strong>对战触发灵感有机会拿到弈子复制体，省下买牌和刷新金币，像多吃一个经济强化。低费牌和成型阵容重合、装备能接就留，缺牌或要拆关键羁绊时先用原过渡。</p>
      <details>
        <summary><ChevronRight size={14} aria-hidden="true" />适配分怎么算</summary>
        <dl>
          <dt>低费重合</dt><dd>过渡和成型都上场的 1–3 费合奏牌，每张 1 分，最多 3 分。1–2 张适配，3 张起优秀。</dd>
          <dt>成型高费</dt><dd>成型盘还有 4–5 费合奏牌，加 1 分，到对应人口再补。</dd>
          <dt>主 C 接装</dt><dd>过渡盘和成型盘的主 C 能共用成装，加 1 分。同一个主 C 留装也计分。</dd>
        </dl>
        <p>按常规攻略的已发布阶段盘评分，实战强度可点进攻略查看。</p>
      </details>
    </section>
    <div className="medley-toolbar">
      <label className="medley-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)}
          aria-label="搜弈子或组合号" placeholder="搜弈子、外号或组号" />
      </label>
      {fitCount > 0 && fitCount < groups.length && <label className="medley-fit-filter">
        <input type="checkbox" checked={fitOnly} onChange={event => setFitOnly(event.target.checked)} />只看适配
      </label>}
      <span className="medley-count" role="status">{cleaned || fitOnly ? shownGroups.length + " / " : ""}{groups.length} 组</span>
    </div>
    {shownGroups.length ? <ul className="medley-groups" aria-label="合奏组合列表">
      {shownGroups.map(group => {
        const fits = fitsByGroup[group.number];
        const openFit = !!cleaned && shownGroups.length === 1;
        return <li key={group.number} className="medley-group">
          <header><h2>组合 {group.number}</h2><span>{group.units.length} 位搭档</span></header>
          <ul className="medley-roster">
            {group.units.map(unit => <li key={unit.id}>
              <MedleyUnit unit={unit} matched={matches.some(units => units.has(unit.id))} />
            </li>)}
          </ul>
          {!!fits?.length && <MedleyFits key={String(openFit)} fits={fits} initiallyOpen={openFit} />}
        </li>;
      })}
    </ul> : <p className="medley-empty">没有符合条件的合奏组合。 <button type="button" onClick={() => { setQuery(""); setFitOnly(false); }}>清除筛选</button></p>}
    <footer className="medley-source">
      <span>资料核对 {catalog.checkedOn}</span>
      <a href={catalog.sources.maomi} target="_blank" rel="noreferrer">猫咪 TFT <ArrowUpRight size={13} aria-hidden="true" /></a>
      <a href={catalog.sources.tftips} target="_blank" rel="noreferrer">TFTips 对照 <ArrowUpRight size={13} aria-hidden="true" /></a>
    </footer>
  </div>;
}
