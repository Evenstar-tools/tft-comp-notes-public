"use client";

import familyData from "@/data/guide-family-stats.json";
import type { Section } from "@/domain/document";
import { guideFamilyRows, type GuideFamilyBatch, type GuideFamilyStat } from "@/domain/guide-family-stats";
import { guideBoardName } from "@/domain/guide-reading";
import { displayGuideName } from "@/domain/trait-names.mjs";
import type { Team } from "@/domain/types";
import type { PlacementRating } from "@/domain/guide-placement";
import { carryEvidence, GuideCarryStats } from "./GuideCarryStats";
import { GuideDistribution } from "./GuideDistribution";
import { formationEvidence, GuideFormationFamilyReference, GuideFormationStats } from "./GuideFormationStats";
import { PlacementBadge, PlacementMethod, PlacementRates, rankedOceanBoards, teamPlacement } from "./GuidePlacement";

const family = familyData as GuideFamilyBatch & { smallSamples?: GuideFamilyStat[] };
const views = [["family", "体系战绩"], ["board", "固定终盘"], ["carry", "核心与装备"]] as const;
export type MatchStatsView = typeof views[number][0];
const number = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });

function FamilyStats({ rows, rare }: {
  rows: ReturnType<typeof guideFamilyRows>; rare: GuideFamilyStat[];
}) {
  if (!rows.length && !rare.length) return <p className="muted">这张棋盘暂无对应的体系战绩。</p>;
  return <div className="guide-carry-samples guide-family-results">
    <p>含不同等级和变阵。</p>
    {!!rows.length && <ul>{rows.map(({ stat }) => <li key={stat.clusterId}>
      <div className="guide-family-result-head"><strong>{displayGuideName(stat.name)}</strong>
        <a href={stat.url} target="_blank" rel="noreferrer" title={stat.sourceName}>MetaTFT · {family.patch} · 近 {family.days} 天 ↗</a>
      </div>
      <dl className="guide-family-metrics">
        <div><dt>平均排名</dt><dd>{stat.mean.toFixed(2)}</dd></div>
        <div><dt>前四率</dt><dd>{percent.format(stat.topFourRate)}</dd></div>
        <div><dt>登顶率</dt><dd>{percent.format(stat.winRate)}</dd></div>
        <div><dt>场数</dt><dd>{number.format(stat.games)}</dd></div>
      </dl>
    </li>)}</ul>}
    {rare.map(stat => <p key={stat.clusterId}><a href={stat.url} target="_blank" rel="noreferrer">{displayGuideName(stat.name)} · {number.format(stat.games)} 场
      {stat.games === 1 && Number.isInteger(stat.mean) && stat.mean >= 1 && stat.mean <= 8 ? ` · 第 ${stat.mean} 名` : ""} ↗</a></p>)}
  </div>;
}

function countLabel(groups: { games: number }[]) {
  const samples = groups.filter(sample => sample.games > 0);
  if (!samples.length) return "";
  return samples.length === 1 ? number.format(samples[0].games) + " 场" : samples.length + " 组";
}

function PlacementSummary({ rating, stage = false }: { rating: PlacementRating; stage?: boolean }) {
  return <div className="guide-stat-summary">
    <PlacementBadge rating={rating} />
    <PlacementRates rating={rating} stage={stage} />
    <details className="guide-stat-method"><summary>样本口径</summary><PlacementMethod rating={rating} /></details>
  </div>;
}

export function GuideMatchStats({ id, stage, team, teams, section, edition, augmentName, heroGuide, familyRows, view, onSelectView, onPickTeam }: {
  id: string; stage: boolean; team: Team; teams: Team[];
  section: Section; edition: string; augmentName?: string; heroGuide: boolean; view?: MatchStatsView;
  familyRows: ReturnType<typeof guideFamilyRows>;
  onSelectView: (view: MatchStatsView) => void;
  onPickTeam: (team: Team, view: MatchStatsView) => void;
}) {
  const rareRows = family.seasonId === edition
    ? family.smallSamples?.filter(stat => stat.sectionId === section.id && stat.games > 0) ?? [] : [];
  const viewLabel = (value: MatchStatsView) => value === "board" && heroGuide ? "强化样本" : views.find(([key]) => key === value)?.[1];
  function evidenceFor(board: Team) {
    const rating = teamPlacement(board, section, heroGuide ? "augment" : "fixed");
    const related = heroGuide ? [] : [teamPlacement(board, section, "lineup"), teamPlacement(board, section, "core")]
      .filter((sample): sample is PlacementRating => !!sample?.games);
    const carry = carryEvidence(edition, section.id, board, augmentName);
    const rows = familyRows.filter(row => row.boards.some(entry => entry.id === board.id));
    const rare = rareRows.filter(stat => (stat.teamId ?? teams[0]?.id) === board.id);
    const formation = !heroGuide ? formationEvidence(board, edition) : undefined;
    const reference = !rows.length && !rare.length ? formation?.board.familyReference : undefined;
    const groups = {
      board: rating?.games ? [rating] : formation ? [{ games: formation.board.sample.placementCounts.reduce((n, count) => n + count, 0) }] : [],
      carry: [...related, ...carry.rows, ...carry.builds],
      family: reference ? [{ games: reference.placementCounts.reduce((n, count) => n + count, 0) }]
        : [...rows.map(row => row.stat), ...rare],
    };
    return { rating, related, carry, rows, rare, groups, formation, reference };
  }
  const { rating, related, carry, rows, rare, groups, formation, reference } = evidenceFor(team);
  const activeView = view ?? (heroGuide ? "board" : (["family", "board", "carry"] as const)
    .find(type => groups[type].some(sample => sample.games > 0)) ?? "board");
  const oceanBoards = activeView === "board" ? rankedOceanBoards(teams, section) : undefined;
  const available = oceanBoards ? oceanBoards.flatMap(({ board, sample }) => {
    if (board.id === team.id || !sample?.games) return [];
    const count = number.format(sample.games) + " 场";
    return [{ board, view: "board" as const, label: sample.mean === undefined ? count : sample.mean.toFixed(2) + " · " + count }];
  }) : !groups[activeView].some(sample => sample.games > 0)
    ? teams.filter(board => board.id !== team.id).flatMap(board => {
        const other = evidenceFor(board).groups;
        const nextView = [activeView, ...views.map(([type]) => type)].find(type => other[type].some(sample => sample.games > 0));
        return nextView ? [{ board, view: nextView, label: countLabel(other[nextView]) }] : [];
      }) : [];
  const alternatives = !!available.length && <div className="guide-stat-alternatives">
    <h4>{oceanBoards ? "其他终盘样本" : "其他棋盘"}</h4>
    <ul>{available.map(next => <li key={next.board.id}>
      <button type="button" onClick={() => onPickTeam(next.board, next.view)}>
        <span>{guideBoardName(next.board)}</span><small>{!oceanBoards && <>{viewLabel(next.view)} · </>}{next.label}</small>
      </button>
    </li>)}</ul>
  </div>;
  if (stage && !Object.values(groups).some(samples => samples.some(sample => sample.games > 0))) {
    return <details id={id} className="guide-match-stats guide-stage-stats">
      <summary>对局数据</summary>
      <div className="guide-stat-body">
        <p className="muted">当前盘暂无结算样本。</p>
        <GuideDistribution team={team} sectionId={section.id} edition={edition} heroGuide={heroGuide} view="board" />
        {alternatives}
      </div>
    </details>;
  }
  return <section id={id} className="guide-match-stats" aria-label="阵容战绩">
    <div className="guide-stat-switch" role="group" aria-label="战绩范围">
      {views.map(([value]) => {
        const total = countLabel(groups[value]);
        return <button key={value} type="button" aria-pressed={activeView === value} onClick={() => onSelectView(value)}>
          <span>{viewLabel(value)}</span>
          {total && <small>{total}</small>}
        </button>;
      })}
    </div>
    <div className="guide-stat-body">
      {activeView === "board" && <>
        {!heroGuide && <p className="muted guide-stat-scope">按结算等级和完整名单统计。</p>}
        {rating?.games ? <PlacementSummary rating={rating} stage={stage} />
          : !formation && <p className="muted">{heroGuide ? "本盘暂无强化样本。" : "本盘暂无固定名单样本。"}</p>}
        {formation && <GuideFormationStats evidence={formation} />}
        <GuideDistribution team={team} sectionId={section.id} ratings={rating ? [rating] : []} edition={edition} heroGuide={heroGuide} view="board" />
      </>}
      {activeView === "carry" && <>
        <p className="muted guide-stat-scope">按棋子、星级或装备筛选，各组场数可能重叠。</p>
        {related.map(sample => <PlacementSummary key={sample.url} rating={sample} />)}
        {(carry.rows.length > 0 || carry.builds.length > 0 || !related.length) && <GuideCarryStats {...carry} />}
        <GuideDistribution team={team} sectionId={section.id} ratings={related} edition={edition} heroGuide={heroGuide} view="carry" />
      </>}
      {activeView === "family" && (reference ? <GuideFormationFamilyReference sample={reference} /> : <FamilyStats rows={rows} rare={rare} />)}
      {alternatives}
    </div>
  </section>;
}
