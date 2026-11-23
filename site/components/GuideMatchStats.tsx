"use client";

import familyData from "@/data/guide-family-stats.json";
import type { Section } from "@/domain/document";
import { guideFamilyRows, type GuideFamilyBatch, type GuideFamilyStat } from "@/domain/guide-family-stats";
import { guideBoardName } from "@/domain/guide-reading";
import type { Team } from "@/domain/types";
import type { PlacementRating } from "@/domain/guide-placement";
import { carryEvidence, GuideCarryStats } from "./GuideCarryStats";
import { GuideDistribution } from "./GuideDistribution";
import { PlacementBadge, PlacementMethod, PlacementRates, teamPlacement } from "./GuidePlacement";

const family = familyData as GuideFamilyBatch & { smallSamples?: GuideFamilyStat[] };
const views = [["board", "当前棋盘"], ["carry", "主 C 装备"], ["family", "体系战绩"]] as const;
export type MatchStatsView = typeof views[number][0];
const number = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });

function FamilyStats({ rows, rare }: {
  rows: ReturnType<typeof guideFamilyRows>; rare: GuideFamilyStat[];
}) {
  if (!rows.length && !rare.length) return <p className="muted">这张棋盘暂无对应的体系战绩。</p>;
  return <div className="guide-carry-samples">
    {!!rows.length && <ul>{rows.map(({ stat }) => <li key={stat.clusterId}>
      <div className="carry-sample-head"><strong>{stat.name}</strong><span>体系均名 <b>{stat.mean.toFixed(2)}</b> · {number.format(stat.games)} 场</span></div>
      <p>前四 {percent.format(stat.topFourRate)} · 登顶 {percent.format(stat.winRate)}</p>
      <div className="carry-source"><a href={stat.url} target="_blank" rel="noreferrer">{stat.sourceName} · {family.patch} · 近 {family.days} 天 ↗</a></div>
    </li>)}</ul>}
    {rare.map(stat => <p key={stat.clusterId}><a href={stat.url} target="_blank" rel="noreferrer">{stat.name} · {number.format(stat.games)} 场
      {stat.games === 1 && Number.isInteger(stat.mean) && stat.mean >= 1 && stat.mean <= 8 ? ` · 第 ${stat.mean} 名` : ""} ↗</a></p>)}
  </div>;
}

function countLabel(groups: { games: number }[]) {
  const samples = groups.filter(sample => sample.games > 0);
  if (!samples.length) return "暂无";
  return samples.length === 1 ? number.format(samples[0].games) + " 场" : samples.length + " 组";
}

export function GuideMatchStats({ id, rating, stage, team, teams, section, edition, augmentName, heroGuide, view, onSelectView, onPickTeam }: {
  id: string; rating?: PlacementRating; stage: boolean; team: Team; teams: Team[];
  section: Section; edition: string; augmentName?: string; heroGuide: boolean; view: MatchStatsView;
  onSelectView: (view: MatchStatsView) => void;
  onPickTeam: (team: Team, view: MatchStatsView) => void;
}) {
  const familyRows = guideFamilyRows(family, edition, section.id, teams);
  const rareRows = family.seasonId === edition
    ? family.smallSamples?.filter(stat => stat.sectionId === section.id && stat.games > 0) ?? [] : [];
  function evidenceFor(board: Team) {
    const boardRating = board.id === team.id ? rating : teamPlacement(board, section);
    const carry = carryEvidence(edition, section.id, board, augmentName);
    const rows = familyRows.filter(row => row.boards.some(entry => entry.id === board.id));
    const rare = rareRows.filter(stat => (stat.teamId ?? teams[0]?.id) === board.id);
    const groups = {
      board: boardRating ? [boardRating] : [],
      carry: [...carry.rows, ...carry.builds],
      family: [...rows.map(row => row.stat), ...rare],
    };
    return { carry, rows, rare, groups };
  }
  const { carry, rows, rare, groups } = evidenceFor(team);
  const available = !groups[view].some(sample => sample.games > 0)
    ? teams.filter(board => board.id !== team.id).flatMap(board => {
        const other = evidenceFor(board).groups;
        const nextView = [view, ...views.map(([type]) => type)].find(type => other[type].some(sample => sample.games > 0));
        return nextView ? [{ board, view: nextView, label: countLabel(other[nextView]) }] : [];
      }) : [];
  const alternatives = !!available.length && <div className="guide-stat-alternatives">
    <h4>其他棋盘</h4>
    <ul>{available.map(next => <li key={next.board.id}>
      <button type="button" onClick={() => onPickTeam(next.board, next.view)}>
        <span>{guideBoardName(next.board)}</span><small>{views.find(([value]) => value === next.view)?.[1]} · {next.label}</small>
      </button>
    </li>)}</ul>
  </div>;
  if (stage && !Object.values(groups).some(samples => samples.some(sample => sample.games > 0))) {
    return <details id={id} className="guide-match-stats guide-stage-stats">
      <summary>对局数据</summary>
      <div className="guide-stat-body">
        <p className="muted">当前盘暂无结算样本。</p>
        <GuideDistribution team={team} sectionId={section.id} rating={rating} edition={edition} heroGuide={heroGuide} />
        {alternatives}
      </div>
    </details>;
  }
  return <section id={id} className="guide-match-stats" aria-label="阵容战绩">
    <div className="guide-stat-switch" role="group" aria-label="战绩范围">
      {views.map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => onSelectView(value)}>
        <span>{value === "board" && rating?.conditions?.kind === "core" && rating.conditions.teamId ? "核心战绩" : label}</span>
        <small>{countLabel(groups[value])}</small>
      </button>)}
    </div>
    <div className="guide-stat-body">
      {view === "board" && <>
        {rating?.games ? <div className="guide-stat-summary">
          <PlacementBadge rating={rating} />
          <PlacementRates rating={rating} stage={stage} />
          <details className="guide-stat-method"><summary>样本口径</summary><PlacementMethod rating={rating} /></details>
        </div> : <p className="muted">本盘暂无结算样本。</p>}
        <GuideDistribution team={team} sectionId={section.id} rating={rating} edition={edition} heroGuide={heroGuide} />
      </>}
      {view === "carry" && <GuideCarryStats {...carry} />}
      {view === "family" && <FamilyStats rows={rows} rare={rare} />}
      {alternatives}
    </div>
  </section>;
}
