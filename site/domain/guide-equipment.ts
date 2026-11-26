import type { Item } from "./types";
import { itemAliases } from "./roster-import.ts";

const itemShortNames = new Map(Object.entries(itemAliases).map(([alias, name]) => [name, alias]));

export function equipmentLabel(item: Item) {
  const shortName = itemShortNames.get(item.name);
  if (shortName) return shortName;
  const base = item.name.replace(/^光明版/, "");
  return item.category === "radiant" ? "光明" + (itemShortNames.get(base) ?? base) : item.name;
}

type GearBag = Record<string, number>;

export function missingIngredients(recipe: string[], available: GearBag) {
  const left = { ...available };
  return recipe.filter(id => {
    if (!(left[id] > 0)) return true;
    left[id]--;
    return false;
  });
}

export type GuideBuild = { items: string[]; games: number; mean: number };

export function thirdItems(builds: GuideBuild[], first: string, second: string) {
  const pair = { [first]: 1, [second]: first === second ? 2 : 1 };
  return builds.flatMap(build => {
    const rest = missingIngredients(build.items, pair);
    return rest.length === 1 ? [{ id: rest[0], games: build.games, mean: build.mean }] : [];
  }).sort((a, b) => b.games - a.games);
}
