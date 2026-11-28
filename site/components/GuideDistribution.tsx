"use client";
import { Fragment, useId } from "react";
import batch from "@/data/guide-placement.json";
import { placementEvidenceKind, type PlacementBatch, type PlacementRating } from "@/domain/guide-placement";
import type { Team } from "@/domain/types";
import { usedPopulation } from "@/domain/team";
import { currentGuidePlacementBatch, guideStatsLaunch } from "./GuidePlacement";
import "./guide-distribution.css";

const number = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const stats = batch as PlacementBatch;

type Distribution = { label: string; counts: number[]; scope: string; date?: string; url: string; recentGames?: boolean; patch?: string; window?: string };

function DistributionChart({ sample, recentGames, showCaption, ceiling }: { sample: Distribution; recentGames: boolean; showCaption: boolean; ceiling: number }) {
  const { counts, scope, date, url } = sample;
  const games = counts.reduce((a,b)=>a+b,0);
  const mean = counts.reduce((a,n,i)=>a+(i+1)*n,0) / games;
  return <>
    {showCaption && <div className="distribution-caption"><strong>{scope}</strong><span>{number.format(games)} 场 · 均名 {mean.toFixed(2)}</span></div>}
    <ol className="distribution-bars" aria-label="第一至第八名占比">{counts.map((n,i)=>
      <li key={i} aria-label={`第 ${i+1} 名，${number.format(n)} 场，${percent.format(n/games)}`} title={`第 ${i+1} 名 · ${number.format(n)} 场`}>
        <div className="distribution-track" aria-hidden="true"><b>{percent.format(n/games)}</b><i style={{height:(n/games/ceiling*58)+"px"}} /></div>
        <span aria-hidden="true">第{i+1}名</span>
      </li>)}</ol>
    <a className="distribution-source" href={url} target="_blank" rel="noreferrer">MetaTFT · {sample.patch ?? stats.patch} · {recentGames ? "按主 C 出装识别" : (sample.window ?? stats.window)}{date && " · " + date}</a>
  </>;
}

type DistributionInput = {
  team: Team; sectionId: string; ratings?: PlacementRating[]; edition: string; heroGuide: boolean; view: "board" | "carry";
};

export function guideDistributionSamples({ team, sectionId, ratings = [], edition, heroGuide, view }: DistributionInput) {
  const launch = guideStatsLaunch(edition);
  const primary = ratings.flatMap((rating): Distribution[] => {
    const counts = rating.placementCounts;
    if (rating.mean === undefined || counts?.length !== 8 || counts.reduce((a,b)=>a+b,0) !== rating.games ||
        (launch && (rating.sourcePeriod || rating.games < (placementEvidenceKind(rating) === "augment" ? 1 : stats.minGames)))) return [];
    const kind = placementEvidenceKind(rating);
    const label = { core: "指定核心同场", lineup: "名单共现", fixed: `${rating.population} 级 · 固定名单`, augment: "英雄强化样本" }[kind];
    return [{ label, counts, scope: kind === "lineup" ? label : rating.sampleScope || label,
      date: rating.date, url: rating.url, recentGames: !!rating.referencesAugment, patch: rating.patch, window: rating.window }];
  });
  const ref = stats.renataNasusReference;
  const canCompare = !heroGuide && stats.edition && (edition === stats.edition || edition.startsWith(stats.edition + ".")) &&
    (!launch || currentGuidePlacementBatch(edition));
  const core = canCompare && view === "carry" && usedPopulation(team.pieces) === 8 &&
    team.pieces.some(p=>p.unitId === "renata-glasc" && p.stars === 3 && p.items.length === 3) && team.pieces.some(p=>p.unitId === "nasus") &&
    ref?.placementCounts?.length === 8 &&
    (!launch || ref.placementCounts.reduce((sum, count) => sum + count, 0) >= stats.minGames)
    ? { label:"核心双卡", counts: ref.placementCounts, scope: "八级 · 三星三件烈娜塔＋内瑟斯 · 其余六人不限", date: ref.observedOn, url: ref.url } : null;
  const unitIds = new Set(team.pieces.map(p => p.unitId));
  const comparison = canCompare ? stats.boardComparisons?.find(group => group.sectionId === sectionId
    && (!group.teamId || (group.teamId === team.id && group.coreRoster.length === team.pieces.length))
    && group.coreRoster.every(id => unitIds.has(id))) : undefined;
  const comparisons = comparison?.samples ?? [];
  const options: Distribution[] = [...primary, ...(core ? [core] : []), ...comparisons
    .filter(sample => (placementEvidenceKind(sample) === "fixed") === (view === "board") &&
      !primary.some(rating => rating.url === sample.url) && sample.placementCounts.length === 8 && sample.placementCounts.reduce((a,b)=>a+b,0) >= stats.minGames)
    .map(sample => ({ label:sample.label, counts:sample.placementCounts, scope:sample.scope, date:sample.observedOn, url:sample.url }))]
    .filter(sample => sample.counts.some(n => n > 0));
  return { options, comparison };
}

export function GuideDistribution({ ratings = [], ...input }: DistributionInput) {
  const groupId = useId();
  const { options, comparison } = guideDistributionSamples({ ...input, ratings });
  if (!options.length) return null;
  const comparisons = comparison?.samples ?? [];
  const ceiling = Math.max(...options.map(({ counts }) => Math.max(...counts) / counts.reduce((sum, n) => sum + n, 0)));
  const chart = (sample: Distribution) => <DistributionChart sample={sample}
    ceiling={ceiling}
    recentGames={!!sample.recentGames}
    showCaption={options.length > 1 || !ratings.length || ratings.some(rating => rating.conditions || rating.sampleScope)} />;
  return <details className="guide-distribution">
    <summary>{comparisons.length > 0 && options.length > 1
      ? comparison?.teamId ? "名次分布与成型对照" : "名次分布与追三星对比"
      : "名次分布"}</summary>
    {options.length === 1 ? chart(options[0]) : <fieldset className="distribution-scopes">
      <legend>名次统计范围</legend>
      {options.map((option, index) => {
        const controlId = `${groupId}-${index}`;
        const panelId = `${controlId}-chart`;
        return <Fragment key={option.url}>
          <input type="radio" id={controlId} name={groupId} aria-controls={panelId} defaultChecked={index === 0} />
          <label htmlFor={controlId}>{option.label}</label>
          <div className="distribution-panel" id={panelId}>{chart(option)}</div>
        </Fragment>;
      })}
    </fieldset>}
  </details>;
}
