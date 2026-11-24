import raw from "./season.json";
import traitReference from "./trait-reference.json";
import specialEquipment from "./special-equipment.json";
import { emblemItemId } from "@/domain/links";
import { preferredSeasonTraitNames } from "@/domain/trait-names.mjs";
import type { Item, Season, Unit } from "@/domain/types";

const emblemRecipes: Record<string, { components: string[] }> = specialEquipment.recipes;
const emblems: Item[] = Object.entries(traitReference).flatMap(([traitId, reference]) => {
  if (!("emblem" in reference) || !reference.emblem) return [];
  const id = emblemItemId(traitId);
  return [{
    ...reference.emblem,
    id,
    category: "emblem",
    traitId,
    description: "携带者获得相应羁绊。",
    components: emblemRecipes[id]?.components,
  }];
});
const gameTraitNames: Record<string, { gameName?: string; summary: string }> = traitReference;
const traits = preferredSeasonTraitNames((raw as Season).traits.map(trait => {
  const ref = gameTraitNames[trait.id];
  if (!ref) return trait;
  return { ...trait, gameName: ref.gameName, description: ref.summary };
}));
export const traitMap = new Map(traits.map(trait => [trait.id, trait]));

function withUnlockTraitNames(unit: Unit): Unit {
  const unlock = unit.unlock;
  if (!unlock?.traitIds?.length) return unit;
  const related = unlock.traitIds.map(id => traitMap.get(id));
  const text = unlock.text.replace(/「([^」]+)」/g, (quoted, name: string) => {
    const trait = related.find(trait => trait?.aliases?.includes(name));
    return trait ? `「${trait.name}」` : quoted;
  });
  return text === unlock.text ? unit : { ...unit, unlock: { ...unlock, text } };
}

export const season: Season = {
  ...(raw as Season),
  traits,
  units: (raw as Season).units.map(withUnlockTraitNames),
  items: [...raw.items, ...emblems, ...specialEquipment.items],
};
export const unitMap = new Map(season.units.map((unit) => [unit.id, unit]));
export const itemMap = new Map(season.items.map((item) => [item.id, item]));

/** 列表卡片用的小图（scripts/make-card-thumbs.mjs 生成），没有原画时退回头像。 */
export function cardImage(unit: Unit) {
  return unit.splashImage
    ? unit.splashImage.replace(/-splash\.jpg$/, "-card.webp")
    : unit.image;
}

/** “阿卡丽 · K/DA” → 主名“阿卡丽”、形态“K/DA”。 */
export function unitLabel(unit: Unit) {
  const [base, form] = unit.name.split(" · ");
  return { base, form };
}
