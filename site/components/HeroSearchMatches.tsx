import { traitMap } from "@/data";
import { traitLibraryLink } from "@/domain/library-navigation";
import type { Unit } from "@/domain/types";
import { unitDirectSearchNames, unitNicknames, unitTraitSearchNames } from "@/domain/unit-search.mjs";

export function HeroSearchMatches({ query, units }: { query: string; units: Unit[] }) {
  const needle = query.trim().toLowerCase();
  if (!needle || !units.length) return null;

  const includes = (name: string) => name.toLowerCase().includes(needle);
  const matchedName = (names: string[]) => names.find(name => name.toLowerCase() === needle) ?? names.find(includes);
  const aliases = units.flatMap(unit => {
    if (unitDirectSearchNames(unit).some(includes)) return [];
    const nickname = matchedName(unitNicknames(unit.id));
    const alias = nickname ?? matchedName(unit.aliases ?? []);
    return alias ? [{ unit, alias, label: nickname ? "外号" : "别名" }] : [];
  });
  const traits = [...new Set(units.flatMap(unit => unit.traits))]
    .flatMap(id => {
      const trait = traitMap.get(id);
      return trait && unitTraitSearchNames(trait).some(includes) ? [trait] : [];
    })
    .sort((first, second) => Number(second.name.toLowerCase() === needle) - Number(first.name.toLowerCase() === needle));

  const matches = [
    ...aliases.map(({ unit, alias, label }) => <span className="hero-search-match" key={unit.id}>
      <span className="sr-only">{label}匹配 </span>{alias} → <strong>{unit.name}</strong>
    </span>),
    ...traits.map(trait => <div className="hero-search-match" key={trait.id}>
      <a href={traitLibraryLink(trait.id)} aria-label={"查看" + trait.name + "羁绊"}>{trait.name}</a>
      {traits.length === 1 && trait.thresholds.map(tier => <a key={tier} href={traitLibraryLink(trait.id, tier)}
        aria-label={trait.name + " " + tier + (trait.countMode === "stars" ? "星" : "档") + "战绩"}>
        {tier}{trait.countMode === "stars" ? "星" : "档"}
      </a>)}
    </div>),
  ];
  if (!matches.length) return null;
  return <section className="hero-search-matches" aria-label="搜索命中原因">
    {matches.slice(0, 3)}
    {matches.length > 3 && <details>
      <summary>更多关联</summary>
      {matches.slice(3)}
    </details>}
  </section>;
}
