import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { tierPerformance, type TraitBoardLink, type CrossTier, type TraitCrosscheck, type TraitScope } from "@/domain/trait-performance";
import type { Trait } from "@/domain/types";

const pct = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("zh-CN");
const toneLabels = { strong: "表现较好", middle: "表现居中", weak: "表现较弱", sparse: "小样本" };

function meanTone(mean: number, games: number) {
  if (games < 100) return "sparse";
  if (mean <= 3.6) return "strong";
  return mean >= 4.6 ? "weak" : "middle";
}

function TierSample({ title, stat, labels, source }: {
  title: string; stat?: ReturnType<typeof tierPerformance>; labels?: string[]; source?: string;
}) {
  const mean = stat?.mean.toFixed(2);
  return <section className="tier-sample" aria-label={title}>
    <div className="tier-sample-heading">
      <strong>{title}</strong>
      {stat && <span className="tier-mean" data-tone={meanTone(Number(mean), stat.games)}><span className="sr-only">均名 </span>{mean}</span>}
    </div>
    {stat
      ? <p className="tier-sample-metrics">{number.format(stat.games)} 场 <span>前四 {pct.format(stat.top4)}</span><span>登顶 {pct.format(stat.win)}</span></p>
      : <p className="tier-sample-metrics">暂无该档样本</p>}
    {!!labels?.length && <p className="tier-scope-note">{labels.join(" · ")}</p>}
    {stat && source && <a href={source} target="_blank" rel="noreferrer" aria-label={title + "的 MetaTFT 查询"}>原查询 ↗</a>}
  </section>;
}

function TierGuideLinks({ boards, currentBoard, foldKey }: {
  boards: TraitBoardLink[]; currentBoard?: string; foldKey: string;
}) {
  const groups = new Map<string, TraitBoardLink[]>();
  for (const board of boards) {
    const guide = groups.get(board.sectionId) ?? [];
    if (board.url === currentBoard) guide.unshift(board);
    else guide.push(board);
    groups.set(board.sectionId, guide);
  }
  const guides = [...groups.values()];
  if (currentBoard) guides.sort((first, second) =>
    Number(second[0].url === currentBoard) - Number(first[0].url === currentBoard));
  function renderGuide([first, ...other]: TraitBoardLink[]) {
    return <li className="tier-guide" key={first.sectionId}>
      <a className="tier-guide-primary" href={first.url}>{first.title}
        {first.board !== first.title && <small>{first.board}</small>}
      </a>
      {other.length > 0 && <details className="tier-guide-variants" data-trait-fold={foldKey + ":" + first.sectionId}>
        <summary>另有 {other.length} 张棋盘</summary>
        <ul>{other.map(board => <li key={board.url}><a href={board.url}>{board.board}</a></li>)}</ul>
      </details>}
    </li>;
  }
  return <div className="tier-notes">
    <span>相关阵容</span>
    <ul>{guides.slice(0, 2).map(renderGuide)}</ul>
    {guides.length > 2 && <details className="tier-more-guides" data-trait-fold={foldKey}>
      <summary>其他 {guides.length - 2} 篇攻略</summary>
      <ul>{guides.slice(2).map(renderGuide)}</ul>
    </details>}
  </div>;
}

export function TierResults({ trait, effects, overall, picked, onPick, links, comparison }: {
  effects: readonly { min: number; description: string }[];
  trait: Trait; overall?: Record<string, number[]>; picked?: number; onPick: (tier?: number) => void;
  links?: Record<string, TraitBoardLink[]>;
  comparison?: { scopeOn: boolean; board?: TraitScope; overallSource?: string; currentBoard: string };
}) {
  const panelId = useId();
  const tierName = (n: number) => n + (trait.countMode === "stars" ? "星" : "");
  const effectByTier = new Map(effects.map(effect => [effect.min, effect.description]));
  const tiers = [...new Set([...trait.thresholds, ...effectByTier.keys()])].sort((a, b) => a - b);
  const single = tiers.length === 1 && !effectByTier.get(tiers[0]);
  return <div className="trait-performance" data-single={single || undefined} role="group" aria-label={trait.name + "各档位战绩"}>
    {!single && tiers.length > 0 && <div className="trait-tier-head" aria-hidden>
      <span>档位</span><span>均名</span>{effects.length > 0 && <span>效果</span>}
    </div>}
    {tiers.map(tier => {
      const effect = effectByTier.get(tier);
      const hasThreshold = trait.thresholds.includes(tier);
      const overallStat = tierPerformance(overall?.[tier]);
      const boardStat = tierPerformance(comparison?.board?.rows[trait.id]?.[tier]);
      const stat = comparison?.scopeOn ? boardStat : overallStat;
      const mean = stat?.mean.toFixed(2);
      const tone = stat ? meanTone(Number(mean), stat.games) : undefined;
      const label = tierName(tier) + " · " + (stat && tone
        ? `均名 ${mean} · ${toneLabels[tone]} · ${number.format(stat.games)} 场`
        : "暂无样本");
      const open = picked === tier;
      const guides = open ? links?.[tier] ?? [] : [];
      const detailsId = panelId + "-" + tier;
      return <div className="trait-tier-row" key={tier}>
        {hasThreshold ? <button className="trait-tier-stat" type="button" aria-expanded={open} aria-controls={detailsId}
          aria-label={trait.name + " " + label} title={label}
          onClick={() => onPick(open ? undefined : tier)}>
          {single ? <span className="trait-stat-caption">均名</span> : <b>{tierName(tier)}</b>}
          <span className="tier-mean" data-tone={tone}>{mean ?? "—"}</span>
          {stat && <small>{number.format(stat.games)} 场</small>}
          <ChevronDown size={12} aria-hidden />
        </button> : <b className="trait-tier-label">{tierName(tier)}</b>}
        {effect && <p className="trait-tier-effect">{effect}</p>}
        <div className="tier-result" id={detailsId} hidden={!open} role="region" aria-label={trait.name + tierName(tier) + "详情"}>
          {open && <>
            {comparison ?
              <div className="tier-sample-pair">
                <TierSample title="当前棋盘" stat={boardStat} labels={comparison.board?.labels} source={comparison.board?.url} />
                <TierSample title="全部棋盘" stat={overallStat} labels={["同补丁 · 不限人口"]} source={comparison.overallSource} />
              </div>
            : stat
              ? <p className="tier-rates"><span>前四 <b>{pct.format(stat.top4)}</b></span><span>登顶 <b>{pct.format(stat.win)}</b></span></p>
              : <p>暂无该档样本</p>}
            {guides.length > 0 && <TierGuideLinks boards={guides} currentBoard={comparison?.currentBoard} foldKey={trait.id + ":" + tier} />}
          </>}
        </div>
      </div>;
    })}
  </div>;
}

export function SourceComparison({ data, filter, onFilter }: { data: TraitCrosscheck; filter: string; onFilter: (name: string) => void }) {
  const available = [...new Set(data.rows.map(r => r.name))];
  const example = available.includes("迅捷射手") ? "迅捷射手" : available[0];
  const chosen = available.includes(filter) ? filter : example;
  const rows: CrossTier[] = data.rows.filter(r => r.name === chosen);
  const noxuScope = "NoxuTFT 场数为约数，时间窗和段位范围可能不同。";
  return <details className="trait-crosscheck" data-trait-fold="source-comparison">
    <summary>历史数据 · S{data.set} 正式服排位</summary>
    <p>MetaTFT {data.patch} 近三天；<span title={noxuScope}>NoxuTFT 口径略有差异。<span className="sr-only">{noxuScope}</span></span></p>
    <label>羁绊 <select value={chosen} onChange={e => onFilter(e.target.value)}>{available.map(n => <option key={n}>{n}</option>)}</select></label>
    <table><thead><tr><th>档位</th><th>MetaTFT 均名／场数</th><th>NoxuTFT 均名／场数</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.tier}><th>{r.tier}</th><td>{r.metaMean.toFixed(2)} · {number.format(r.metaGames)}</td><td>{r.noxuMean.toFixed(2)} · {r.noxuGames}</td></tr>)}</tbody></table>
    <p>{data.on.slice(0, 10)} 采集　<a href={data.metaUrl} target="_blank" rel="noreferrer">MetaTFT ↗</a>　<a href={data.url + "#" + rows[0]?.id} target="_blank" rel="noreferrer">NoxuTFT ↗</a></p>
  </details>;
}
