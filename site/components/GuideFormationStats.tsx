import batch from "@/data/guide-placement.json";
import { formationComparisonFor, remainingPlacements, type FormationFamilyReference, type PlacementBatch } from "@/domain/guide-placement";
import { usedPopulation } from "@/domain/team";
import { tierPerformance } from "@/domain/trait-performance";
import type { Team } from "@/domain/types";

const stats = batch as PlacementBatch;
const number = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const checkedDate = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Shanghai",
});

export function formationEvidence(team: Team, edition: string) {
  return formationComparisonFor(stats.formationComparisons ?? [], edition,
    team.pieces.map(piece => piece.unitId), usedPopulation(team.pieces));
}

export function formationCoreResult(team: Team, edition: string, build?: string) {
  const evidence = formationEvidence(team, edition);
  const core = evidence?.group.coreSummary;
  if (!build || evidence?.group.build !== build || !core) return;
  const result = tierPerformance(core.placementCounts);
  if (result && result.games >= stats.minGames) return { label: core.label, ...result };
}

export function GuideFormationFamilyReference({ sample }: { sample: FormationFamilyReference }) {
  const result = tierPerformance(sample.placementCounts);
  if (!result || result.games < stats.minGames) return null;
  return <div className="guide-carry-samples">
    <p>MetaTFT 阵容榜参考 · 同类棋盘的玩家结算，包含不同等级和成型质量。</p>
    <ul><li>
      <div className="carry-sample-head"><strong>{sample.name}</strong><span>平均排名 <b>{result.mean.toFixed(2)}</b> · {number.format(result.games)} 场</span></div>
      <p>前四 {percent.format(result.top4)} · 登顶 {percent.format(result.win)}</p>
      <div className="carry-source"><a href={sample.url} target="_blank" rel="noreferrer">
        {sample.patch ?? "PBE"} 阵容榜 · {sample.window ?? `近 ${sample.windowHours} 小时`} · {checkedDate.format(new Date(sample.checkedAt))} 北京时间 ↗
      </a></div>
    </li></ul>
  </div>;
}

type Row = { name: string; counts: number[]; url?: string };

function ComparisonTable({ rows, caption }: { rows: Row[]; caption: string }) {
  return <table className="formation-table">
    <caption>{caption}</caption>
    <thead><tr><th scope="col">筛选</th><th scope="col">场数</th><th scope="col">均名</th><th scope="col">前四</th></tr></thead>
    <tbody>{rows.map(row => {
      const result = tierPerformance(row.counts);
      const enough = result && result.games >= stats.minGames;
      return <tr key={row.name}>
        <th scope="row">{row.url ? <a href={row.url} target="_blank" rel="noreferrer">{row.name} ↗</a> : row.name}</th>
        <td>{number.format(result?.games ?? 0)}</td>
        <td>{enough ? result.mean.toFixed(2) : <span title="样本不足">—</span>}</td>
        <td>{enough ? percent.format(result.top4) : <span title="样本不足">—</span>}</td>
      </tr>;
    })}</tbody>
  </table>;
}

export function GuideFormationStats({ evidence }: { evidence: NonNullable<ReturnType<typeof formationEvidence>> }) {
  const { group, board } = evidence;
  const rows = group.boards.map(({ name, sample }) => ({ name, counts: sample.placementCounts, url: sample.url }));
  const core = group.coreSummary;
  const coreResult = core && tierPerformance(core.placementCounts);
  const subset = board.subset;
  const remaining = subset && remainingPlacements(board.sample.placementCounts, subset.sample.placementCounts);
  return <details className="guide-formation" open>
    <summary>同条件阵容对照</summary>
    <p>{group.population} 级结算 · 各自固定名单 · {group.condition} · {group.exclusions}</p>
    {core && coreResult && coreResult.games >= stats.minGames && <p>
      <a href={core.url} target="_blank" rel="noreferrer">{core.label} ↗</a> · 恰好九张不同棋子 · 均名 {coreResult.mean.toFixed(2)} · {number.format(coreResult.games)} 场
    </p>}
    <ComparisonTable rows={rows} caption={group.condition} />
    {subset && remaining && <ComparisonTable caption={board.name + " · 同盘成型对照"} rows={[
      { name: subset.remainder, counts: remaining },
      { name: subset.condition, counts: subset.sample.placementCounts, url: subset.sample.url },
    ]} />}
    <small>MetaTFT · {group.patch} · {group.window ?? `滚动 ${group.windowHours} 小时`} · {checkedDate.format(new Date(group.checkedAt))} 北京时间取数。少于 {stats.minGames} 场仅列场数。</small>
  </details>;
}
