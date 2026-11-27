import { ChevronRight } from "lucide-react";
import type { SiteSearchHit } from "@/domain/site-search";
import { TraitBadge } from "./Glyphs";
import "./hero-augment-search-card.css";

function Sample({ label, games, mean }: { label: string; games: number; mean?: number }) {
  return <span className="hero-augment-search-sample">{label} · {games.toLocaleString("zh-CN")} 场
    {mean !== undefined && <strong>均名 {mean.toFixed(2)}</strong>}
  </span>;
}

export function HeroAugmentSearchCard({ hit }: { hit: SiteSearchHit }) {
  const augment = hit.heroAugment;
  if (!augment) return null;
  const { board, boardNote, loadouts, conditions, evidence, reference } = augment;
  return <article className="hero-augment-search-card" aria-label={hit.name}>
    <a href={hit.href} className="site-lookup-result hero-augment-search-title" data-search-result data-search-result-type="guide">
      {hit.image && <img src={hit.image} alt="" width={36} height={36} decoding="async" />}
      <span className="site-lookup-label"><strong>{hit.name}</strong>
        <small>{[augment.hero, augment.role, augment.round, augment.rarity].join(" · ")}</small>
      </span>
      <ChevronRight size={16} className="site-lookup-arrow" aria-hidden="true" />
    </a>
    {augment.effect && <p className="hero-augment-search-note">{augment.effect}</p>}
    {board && <section className="hero-augment-search-section" aria-label="阵容组成">
      <h3>{board.name} <small>{board.population} 人口</small></h3>
      {!!board.traits.length && <ul className="hero-augment-search-traits" aria-label="已激活羁绊">
        {board.traits.map(trait => <li key={trait.id}><TraitBadge trait={trait} size={14} tone="active" /> {trait.level} {trait.name}</li>)}
      </ul>}
      <ul className="hero-augment-search-roster">
        {board.units.map(unit => <li key={unit.id} className={`cost-${unit.cost}`} data-carry={unit.carry || undefined}>
          <img src={unit.image} alt="" width={35} height={35} decoding="async" />
          <span>{unit.name}{unit.carry && <span className="sr-only">，主 C</span>}</span>
        </li>)}
      </ul>
    </section>}
    {boardNote && <p className="hero-augment-search-note">{boardNote}</p>}
    {!!loadouts.length && <section className="hero-augment-search-section" aria-label="配装">
      <h3>配装</h3>
      <ul className="hero-augment-search-loadouts">
        {loadouts.map(({ label, items, note, evidence: sample }) => <li key={items.map(item => item.id).join("/")}>
          <div className="hero-augment-search-loadout">
            <strong>{label}</strong>
            <ul className="hero-augment-search-items">
              {items.map((item, index) => <li key={`${item.id}:${index}`}><a href={item.href} data-search-result data-search-result-type="item">
                {item.image && <img src={item.image} width={23} height={23} alt="" decoding="async" />}{item.name}
              </a></li>)}
            </ul>
            {sample && <Sample {...sample} />}
          </div>
          {note && <p className="hero-augment-search-note">{note}</p>}
        </li>)}
      </ul>
    </section>}
    <details className="hero-augment-search-conditions" open={augment.openConditions || undefined}>
      <summary>检索条件 {evidence && <Sample {...evidence} />}</summary>
      <ul aria-label="样本筛选条件">{conditions.map(condition => <li key={condition}>{condition}</li>)}</ul>
      <div className="hero-augment-search-sources">
        {evidence && <a href={evidence.href}>{evidence.source}</a>}
        {reference && <a href={reference.href}>{reference.label}</a>}
        {hit.href !== augment.profileHref && <a href={augment.profileHref} data-search-result data-search-result-type="unit">强化资料</a>}
      </div>
    </details>
  </article>;
}
