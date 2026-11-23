import placements from "@/data/guide-placement.json";
import { carryMinGames, carryPeriod, guideCarryRows, type CarrySample } from "@/domain/guide-carry-stats";
import { augmentBoardSamples, type PlacementBatch } from "@/domain/guide-placement";
import type { Team } from "@/domain/types";
import { AugmentBoardBuilds } from "./AugmentBoardBuilds";

const fmt = new Intl.NumberFormat("zh-CN");
const buildBatch = placements as PlacementBatch;
const augmentBuilds = augmentBoardSamples(buildBatch.records, buildBatch.date);

function Sample({ row }: {row: CarrySample}) {
  const recent = new URL(row.url);
  recent.searchParams.set("tab", "games");
  const size = fmt.format(row.games) + " 场";
  const mean = row.games >= (row.kind === "augment" ? 1 : carryMinGames)
    ? row.placementCounts.reduce((sum, count, i) => sum + count * (i + 1), 0) / row.games : undefined;
  const gear = row.kind === "emblem" ? "K/DA 转＋两件成装" : row.kind === "augment" ? "三件成装＋专属强化" : "三格装备";
  return <li>
    <div className="carry-sample-head"><strong>{row.carryName} {row.stars}★ · {gear}</strong>
      <span>{mean !== undefined && <>均名 <b>{mean.toFixed(2)}</b> · </>}{size}</span>
    </div>
    <p>{row.scope}</p>
    {row.kind === "slots" && row.recentGames > 0 && <p>三件成装 {row.completedGames}/{row.recentGames} 场
      {row.gearComparable && <>；其中 {row.loadoutGames} 场主 C、{row.tankName}各有推荐装</>}。</p>}
    {row.kind === "augment" && <p>抽样三件成装 {row.completedGames}/{row.recentGames} 场；其中 {row.withAugments} 场公开强化。</p>}
    {row.kind === "emblem" && <p>{row.recentGames} 场近期对局核对纹章和成装。</p>}
    <div className="carry-source"><a href={row.url} target="_blank" rel="noreferrer">筛选条件 ↗</a>
      {row.kind === "slots" && row.recentGames > 0 && <a href={recent.href} target="_blank" rel="noreferrer">近期对局 ↗</a>}</div>
  </li>;
}

export function carryEvidence(seasonId: string, sectionId: string, team: Team, augmentName?: string) {
  const units = new Set(team.pieces.map(piece => piece.unitId));
  const rows = guideCarryRows(seasonId, sectionId, team.id, true)
    .filter(r => (r.kind !== "augment" || r.games > 0) && units.has(r.carryId) && r.anchorIds.every(id => units.has(id)));
  const buildEdition = buildBatch.edition && (seasonId === buildBatch.edition || seasonId.startsWith(buildBatch.edition + "."));
  const builds = augmentName && buildEdition
    ? (augmentBuilds[augmentName] ?? []).filter(sample => sample.teamId === team.id)
    : [];
  return { rows, builds };
}

export function GuideCarryStats({ rows, builds }: ReturnType<typeof carryEvidence>) {
  const current = rows.filter(r => !r.sameNine);
  const comparisons = rows.filter(r => r.sameNine);
  if (!rows.length && !builds.length) return <p className="muted">这张棋盘暂无主 C 装备样本。</p>;
  return <div className="guide-carry-samples">
    {builds.length > 0 && <AugmentBoardBuilds boards={builds} />}
    {!!current.length && <ul>{current.map(row => <Sample key={row.carryId} row={row}/>)}</ul>}
    {!!comparisons.length && <><h4>同九张换主 C</h4><ul>{comparisons.map(row => <Sample key={row.carryId} row={row}/>)}</ul></>}
    {!!rows.length && <small>{carryPeriod}</small>}
  </div>;
}
