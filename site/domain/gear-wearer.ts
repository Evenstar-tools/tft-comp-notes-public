import { guideSearchKey } from "./guide-search.ts";
import { searchNameRank } from "./site-search.ts";
import type { Unit } from "./types";
import { unitSearchNames } from "./unit-search.mjs";

export type GearWearerSample = { games: number; mean?: number | null; winRate?: number | null };
export type GearOrder = "mean" | "games" | "wins";

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
