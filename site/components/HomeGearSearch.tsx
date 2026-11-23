import type { BoardHit, SearchGearDetail, SiteSearchHit } from "@/domain/site-search";
import type { Item, Season } from "@/domain/types";
import "./home-gear-search.css";

export type HomeGearHit = SiteSearchHit & { gear: SearchGearDetail };

export function isHomeGear(hit: SiteSearchHit): hit is HomeGearHit {
  return hit.gear?.type === "artifact" || hit.gear?.type === "emblem";
}

export function HomeGearSearch({ hit, season, examples, filtered, refreshing, onToggleExclusion }: {
  hit: HomeGearHit;
  season: Season;
  examples: BoardHit[];
  filtered: boolean;
  refreshing?: boolean;
  onToggleExclusion: (value: "rakan" | "none") => void;
}) {
  const { gear } = hit;
  const item: Item | undefined = season.items.find(entry => entry.id === hit.id);
  const trait = item?.traitId && season.traits.find(entry => entry.id === item.traitId);
  const detail = trait ? `获得 ${trait.gameName ?? trait.name} 羁绊` : hit.detail;
  return <section className="home-gear-search" aria-label={hit.name + "查询结果"} aria-busy={refreshing || undefined}>
    <header className="home-gear-header">
      {hit.image && <img src={hit.image} alt="" width={34} height={34} />}
      <h2>{hit.name}</h2>
      {detail && <small>{detail}</small>}
      <a href={hit.href}>查看{gear.type === "emblem" ? "纹章" : "神器"}详情</a>
    </header>
    <div className="home-gear-columns">
      <section aria-label="实战携带者">
        <header className="home-gear-subheading">
          <h3>实战携带者</h3>
          {gear.type === "emblem" && <button type="button" disabled={refreshing} aria-pressed={gear.exclude === "rakan"}
            onClick={() => onToggleExclusion(gear.exclude === "rakan" ? "none" : "rakan")}>剔除洛</button>}
        </header>
        {gear.holders.length ? <ul className="home-gear-wearers">
          {gear.holders.map(holder => <li key={holder.id}><a href={holder.href}>
            {holder.image && <img src={holder.image} alt="" width={34} height={34} loading="lazy" />}
            <strong>{holder.name}</strong>
            <span className="home-gear-measure">
              {typeof holder.mean === "number" && <b aria-label={`均名 ${holder.mean.toFixed(2)}`}>{holder.mean.toFixed(2)}</b>}
              <small>{holder.games.toLocaleString("zh-CN")} 场</small>
            </span>
          </a></li>)}
        </ul> : <p className="home-gear-empty">暂无携带者战绩</p>}
        {gear.snapshot && <a className="home-gear-source" href={gear.snapshot.href}>{gear.snapshot.label}</a>}
      </section>
      <section aria-label="可走阵容">
        <header className="home-gear-subheading"><h3>可走阵容</h3><small>棋盘实戴该装备</small></header>
        {examples.length ? <div className="home-gear-boards">
          {examples.map(example => <article key={example.id} id={"guide-card-gear-" + example.id}>
            <a href={example.href} data-home-board={example.id}>
              {example.image && <img src={example.image} alt="" width={40} height={40} loading="lazy" />}
              <span className="home-gear-board-label"><strong>{example.name}</strong>
                {example.detail && <small>{example.detail}</small>}
              </span>
              <span className="home-gear-view-board">看棋盘</span>
            </a>
          </article>)}
        </div> : <p className="home-gear-empty">{filtered ? "当前筛选没有实戴棋盘" : "暂无实戴棋盘"}</p>}
      </section>
    </div>
  </section>;
}
