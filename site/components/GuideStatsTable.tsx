import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { formatRecommendationMean, type RecommendationTier } from "@/domain/guide-family-stats";
import "../app/guide-stats-table.css";

export type GuideStatsMetric = "pickRate" | "mean" | "topFourRate" | "winRate";
export type GuideStatsDirection = "asc" | "desc";

export const guideStatsMetricLabels = {
  pickRate: "出场率",
  mean: "平均排名",
  topFourRate: "前四率",
  winRate: "登顶率",
} satisfies Record<GuideStatsMetric, string>;

const metrics = ["mean", "pickRate", "topFourRate", "winRate"] as const;
const tierLabels = { recommended: "推荐", secondary: "次选", review: "待复核" } satisfies Record<RecommendationTier, string>;
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
  mean: number;
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

  return <table className="guide-stats-table" aria-label="阵容战绩对照" role="table">
    <colgroup>
      <col />
      <col className="guide-stats-units-column" />
      <col className="guide-stats-metric-column" span={4} />
    </colgroup>
    <thead role="rowgroup">
      <tr role="row">
        <th scope="col" role="columnheader">阵容</th>
        <th scope="col" role="columnheader">棋盘成员</th>
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
      {rows.map(row => <tr key={row.id} id={row.id} role="row">
        <th scope="row" role="rowheader" className="guide-stats-identity">
          <div className="guide-stats-title">
            {row.link}
            {row.style && <span className="guide-playstyle-tag">{row.style}</span>}
          </div>
          {row.note && <p>{row.note}</p>}
        </th>
        <td className="guide-stats-units" role="cell"><div className="guide-stats-portraits">{row.units}</div></td>
        {metrics.map(key => {
          const value = row[key];
          return <td key={key} className="guide-stats-metric" role="cell" data-active={key === metric ? "true" : undefined}>
            <span className="guide-stats-mobile-label">{guideStatsMetricLabels[key]}</span>
            <strong data-tier={key === "mean" ? row.tier : undefined}>
              {value === null || !Number.isFinite(value) ? "—" : key === "mean" ? formatRecommendationMean(value) : formats[key].format(value)}
            </strong>
            {key === "mean" && <small className="guide-stats-sample"><span>{tierLabels[row.tier]}</span><span>{gameFormat.format(row.games)} 场</span></small>}
          </td>;
        })}
      </tr>)}
    </tbody>
  </table>;
}
