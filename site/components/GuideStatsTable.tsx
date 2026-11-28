import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { guideTierLabels as tierLabels, formatRecommendationMean, placementCutoff, type RecommendationTier } from "@/domain/guide-family-stats";
import "../app/guide-stats-table.css";

export type GuideStatsMetric = "pickRate" | "mean" | "topFourRate" | "winRate";
export type GuideStatsDirection = "asc" | "desc";

export const guideStatsMetricLabels = {
  pickRate: "出场率",
  mean: "均名",
  topFourRate: "前四率",
  winRate: "登顶率",
} satisfies Record<GuideStatsMetric, string>;

const metrics = ["mean", "pickRate", "topFourRate", "winRate"] as const;
const sampleLimits = [100, 200, 500] as const;

const formats = {
  pickRate: new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 2, minimumFractionDigits: 2 }),
  mean: new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
  topFourRate: new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 }),
  winRate: new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 }),
} satisfies Record<GuideStatsMetric, Intl.NumberFormat>;
const gameFormat = new Intl.NumberFormat("zh-CN");

export type GuideStatsTableRow = {
  id: string;
  name: string;
  note?: string;
  tier: RecommendationTier;
  style?: string;
  link: ReactNode;
  units: ReactNode;
  games: number;
  pickRate: number | null;
  mean: number | null;
  topFourRate: number | null;
  winRate: number | null;
};

export function GuideStatsTable({ rows, metric, direction, onSort }: {
  rows: GuideStatsTableRow[];
  metric: GuideStatsMetric;
  direction: GuideStatsDirection;
  onSort: (metric: GuideStatsMetric) => void;
}) {
  const order = direction === "asc" ? "ascending" : "descending";

  return <table className="guide-stats-table" aria-label="阵容数据对照" role="table">
    <colgroup>
      <col />
      <col className="guide-stats-units-column" />
      <col className="guide-stats-metric-column" span={4} />
    </colgroup>
    <thead role="rowgroup">
      <tr role="row">
        <th scope="col" role="columnheader">阵容</th>
        <th scope="col" role="columnheader">核心棋子</th>
        {metrics.map(key => {
          const active = key === metric;
          const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
          return <th key={key} className="guide-stats-sort-head" scope="col" role="columnheader" aria-sort={active ? order : undefined}>
            <button type="button" onClick={() => onSort(key)}>
              {guideStatsMetricLabels[key]}<Icon size={12} aria-hidden="true" />
            </button>
          </th>;
        })}
      </tr>
    </thead>
    <tbody role="rowgroup">
      {rows.map(row => {
        const sampleLimit = sampleLimits.find(limit => row.games < limit);
        return <tr key={row.id} id={row.id} role="row">
          <th scope="row" role="rowheader" className="guide-stats-identity">
            <div className="guide-stats-title">
              {row.link}
              {sampleLimit && <span className="guide-stats-sample-tag" data-limit={sampleLimit}>{`<${sampleLimit} 场`}</span>}
              {row.style && <span className="guide-playstyle-tag">{row.style}</span>}
            </div>
            <div className="guide-stats-mobile-meta">
              <span data-tier={row.tier}>{tierLabels[row.tier]}</span>
              <span>{gameFormat.format(row.games)} 场</span>
            </div>
            {row.note && <p>{row.note}</p>}
          </th>
          <td className="guide-stats-units" role="cell"><div className="guide-stats-portraits">{row.units}</div></td>
          {metrics.map(key => {
            const value = row[key];
            const meanTone = key !== "mean" ? undefined : value === null || !Number.isFinite(value) || row.tier === "review"
              ? row.tier : value <= placementCutoff ? "recommended" : "secondary";
            return <td key={key} className="guide-stats-metric" role="cell" data-active={key === metric ? "true" : undefined}>
              <span className="guide-stats-mobile-label">{guideStatsMetricLabels[key]}</span>
              <strong data-tier={meanTone}>
                {value === null || !Number.isFinite(value) ? "—" : key === "mean" ? formatRecommendationMean(value) : formats[key].format(value)}
              </strong>
              {key === "mean" && <small className="guide-stats-sample"><span>{tierLabels[row.tier]}</span><span>{gameFormat.format(row.games)} 场</span></small>}
            </td>;
          })}
        </tr>;
      })}
    </tbody>
  </table>;
}
