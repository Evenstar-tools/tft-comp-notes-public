import { ArrowUpRight } from "lucide-react";
import { gearHref, itemName } from "@/domain/gear-library";
import { currentArtifactRanking } from "@/server/artifact-trend";
import { ItemIcon } from "./ItemIcon";
import "./artifact-trend-ranking.css";

const number = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wins = { query: "", order: "wins", excluded: "", wearer: "" } as const;

export function ArtifactTrendRanking({ edition }: { edition: string }) {
  const model = currentArtifactRanking(edition);

  return <section id="artifact-trends" className="artifact-trend-ranking" aria-labelledby="artifact-trend-title">
    <header className="artifact-trend-header">
      <div>
        <h2 id="artifact-trend-title">神器登顶率</h2>
        {model && <p>{model.source} · ≥{model.minGames} 场</p>}
      </div>
      <a href={gearHref("special", wins)}>查看装备榜 <ArrowUpRight size={14} aria-hidden="true" /></a>
    </header>
    {model?.rows.length ? <ol className="artifact-trend-list" role="list">
      {model.rows.map(({ item, games, winRate, order, holders }, index) => {
        const name = itemName(item);
        const orderDescription = order === "mean" ? `满 ${model.minGames} 场，按均名排序` : "均名样本不足，按场数排序";
        return <li className="artifact-trend-entry" key={item.id}>
          <a className="artifact-trend-item" href={gearHref("special", wins, { item: item.id })} aria-label={name + "战绩"}>
            <span className="artifact-trend-rank" aria-hidden="true">{index + 1}</span>
            <ItemIcon item={item} size={34} />
            <strong>{name}</strong>
          </a>
          <div className="artifact-trend-score">
            <strong>{percent.format(winRate)}</strong>
            <small>{number.format(games)} 场</small>
          </div>
          <div className="artifact-trend-holders">
            <span className="artifact-trend-holder-order" data-best={order === "mean" || undefined} title={orderDescription}>
              {order === "mean" ? "最佳" : "常用"}<span className="sr-only"> · {orderDescription}</span>
            </span>
            {holders.length ? <ul className="artifact-trend-wearers">
              {holders.map(({ unit, games: count, mean }) => <li key={unit.id}>
                <a href={gearHref("special", wins, { item: item.id, unit: unit.id })}
                  aria-label={unit.name + "的" + name + "战绩"}>
                  <img src={unit.image} width={25} height={25} alt="" loading="lazy" decoding="async" />
                  <span><b>{unit.name}</b>
                    <small>{mean !== undefined && <>{mean.toFixed(2)} · </>}{number.format(count)} 场</small>
                  </span>
                </a>
              </li>)}
            </ul> : <small className="artifact-trend-status">暂无使用者数据</small>}
          </div>
        </li>;
      })}
    </ol> : <p className="artifact-trend-status">{model ? "这一批暂无达到样本门槛的神器。" : "当前版本暂无可用神器战绩。"}</p>}
  </section>;
}
