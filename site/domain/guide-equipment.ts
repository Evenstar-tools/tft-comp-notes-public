import type { Item } from "./types";
import { itemAliases } from "./roster-import.ts";

const itemShortNames = new Map(Object.entries(itemAliases).map(([alias, name]) => [name, alias]));

export function equipmentLabel(item: Item) {
  const shortName = itemShortNames.get(item.name);
  if (shortName) return shortName;
  const base = item.name.replace(/^光明版/, "");
  return item.category === "radiant" ? "光明" + (itemShortNames.get(base) ?? base) : item.name;
}

export type GearTarget = { owner: string; item: Item };
export type GearBag = Record<string, number>;

export function missingIngredients(recipe: string[], available: GearBag) {
  const left = { ...available };
  return recipe.filter(id => {
    if (!(left[id] > 0)) return true;
    left[id]--;
    return false;
  });
}

export function planCarousel(targets: GearTarget[], held: GearBag, completed: GearBag) {
  const done = { ...completed };
  const totals: GearBag = {};
  const pending = targets.filter(({ item }) => {
    if (!(done[item.id] > 0)) return true;
    done[item.id]--;
    return false;
  });
  const recipes = pending.map(target => {
    const parts = target.item.components ?? [];
    for (const id of parts) totals[id] = (totals[id] ?? 0) + 1;
    return { ...target, missing: missingIngredients(parts, held) };
  });
  const needs = Object.entries(totals)
    .map(([id, n]) => ({ id, count: n - (held[id] ?? 0) }))
    .filter(({ count }) => count > 0).sort((a, b) => b.count - a.count);
  const ready = recipes.filter(row => !row.missing.length);
  // Ties retain author order: the carry's first item before alternate uses of the same component.
  const choices = new Map<string, { id: string; goal: GearTarget; completes: boolean }>();
  for (const row of [...recipes].sort((a, b) => a.missing.length - b.missing.length)) {
    for (const id of row.missing) {
      if (!choices.has(id)) choices.set(id, { id, goal: row, completes: row.missing.length === 1 });
    }
  }
  return { needs, ready, picks: [...choices.values()].slice(0, 2), remaining: pending.length };
}

export type GuideBuild = { items: string[]; games: number; mean: number };

export function thirdItems(builds: GuideBuild[], first: string, second: string) {
  const pair = { [first]: 1, [second]: first === second ? 2 : 1 };
  return builds.flatMap(build => {
    const rest = missingIngredients(build.items, pair);
    return rest.length === 1 ? [{ id: rest[0], games: build.games, mean: build.mean }] : [];
  }).sort((a, b) => b.games - a.games);
}
