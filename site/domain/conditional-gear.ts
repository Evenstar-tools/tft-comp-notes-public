import snapshot from "../data/guide-item-builds.json" with { type: "json" };
import { missingIngredients, type GuideBuild } from "./guide-equipment.ts";

export type ConditionalGearCohort = typeof snapshot.records[number];

export const conditionalGearSource = {
  source: "MetaTFT",
  patch: snapshot.patch,
  date: snapshot.date,
  windowDays: snapshot.windowDays,
  minGames: 100,
};

export const conditionalGearItemNames: Readonly<Record<string, string>> = snapshot.itemNames;
export const maxLockedGearItems = 2;

function includesLockedItems(build: Pick<GuideBuild, "items">, itemIds: readonly string[]) {
  return build.items.length === 3 && itemIds.every(id => build.items.includes(id));
}

export function conditionalGearCohorts(seasonId: string, itemIds: readonly string[]) {
  if (!seasonId.startsWith(snapshot.season)) return [];
  return snapshot.records.filter(cohort => cohort.builds.some(build => includesLockedItems(build, itemIds)));
}

export function remainingGearRows(builds: readonly (Omit<GuideBuild, "mean"> & { mean: number | null })[], itemIds: readonly string[]) {
  const held = Object.fromEntries(itemIds.map(id => [id, 1]));
  return builds.filter(build => includesLockedItems(build, itemIds)).map(build => ({
    items: missingIngredients(build.items, held),
    games: build.games,
    mean: build.mean,
  }));
}

export function conditionalGearRows(cohort: ConditionalGearCohort, itemIds: readonly string[]) {
  return remainingGearRows(cohort.builds, itemIds).sort((a, b) => b.games - a.games);
}
