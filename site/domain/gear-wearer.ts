import { guideSearchKey } from "./guide-search.ts";
import { searchNameRank } from "./site-search.ts";
import type { Item, Unit } from "./types";
import { unitSearchNames } from "./unit-search.mjs";

export type GearWearerSample = { games: number; mean?: number | null; winRate?: number | null };
export type GearOrder = "mean" | "games" | "wins";

export function currentWearerSnapshot(snapshot: { version: string; updatedAt?: string }, patch: {
  seasonId: string; effectiveAt: string; metaTftPatch?: { patch: string; bPatch?: string };
}) {
  const source = patch.metaTftPatch;
  if (!source) return false;
  const [season, mode] = patch.seasonId.toUpperCase().split("-");
  return snapshot.version === `${season} ${mode} ${source.patch}${source.bPatch ?? ""}` &&
    Date.parse(snapshot.updatedAt ?? "") >= Date.parse(patch.effectiveAt);
}

export function gearSampleMinimum(category: Item["category"], pbe: boolean, minGames: number) {
  return pbe && (category === "radiant" || category === "emblem" || category === "artifact") ? 1 : minGames;
}

export function gearWearerMatches(units: Unit[], query: string) {
  const term = guideSearchKey(query);
  if (!term) return [];
  return units.map(unit => ({ unit, rank: searchNameRank(term, unitSearchNames(unit)) }))
    .filter(match => match.rank > 0)
    .sort((a, b) => b.rank - a.rank);
}

export function gearWearerStats(sample: GearWearerSample, minGames: number): GearWearerSample {
  const { games, mean, winRate } = sample;
  return games >= minGames ? { games, mean, winRate } : { games };
}

export function compareGearWearerSamples(a: GearWearerSample, b: GearWearerSample, order: GearOrder, minGames: number) {
  const byGames = b.games - a.games;
  if (order === "games") return byGames;
  const aStats = gearWearerStats(a, minGames);
  const bStats = gearWearerStats(b, minGames);
  if (order === "wins") return (bStats.winRate ?? -Infinity) - (aStats.winRate ?? -Infinity) || byGames;
  return (aStats.mean ?? Infinity) - (bStats.mean ?? Infinity) || byGames;
}
