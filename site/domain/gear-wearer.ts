import { guideSearchKey } from "./guide-search.ts";
import { searchNameRank } from "./site-search.ts";
import type { Item, Unit } from "./types";
import { unitSearchNames } from "./unit-search.mjs";

export type GearWearerSample = { games: number; mean?: number | null; winRate?: number | null };
export type GearOrder = "mean" | "games" | "wins";

type GearPatch = {
  seasonId: string; effectiveAt: string; metaTftPatch?: { patch: string; bPatch?: string };
};

export function currentWearerSnapshot(snapshot: { version: string; updatedAt?: string | null }, patch: GearPatch) {
  const source = patch.metaTftPatch;
  if (!source) return false;
  const [season, mode] = patch.seasonId.toUpperCase().split("-");
  const [snapshotSeason, queue, version, ...rest] = snapshot.version.split(" ");
  return !rest.length && snapshotSeason === season &&
    (queue === mode || mode === "LIVE" && queue?.toUpperCase() === "RANKED") &&
    version === source.patch + (source.bPatch ?? "") &&
    Date.parse(snapshot.updatedAt ?? "") >= Date.parse(patch.effectiveAt);
}

export function currentEmblemSnapshot(snapshot: { set: string; mode: string; patch: string; updatedAt?: string | null }, patch: GearPatch) {
  return currentWearerSnapshot({
    version: [snapshot.set, snapshot.mode, snapshot.patch].join(" "),
    updatedAt: snapshot.updatedAt,
  }, patch);
}

function gearDisplayMinimum(category: Item["category"]) {
  if (category === "emblem") return 50;
  if (category === "artifact" || category === "radiant") return 100;
}

export function gearSampleMinimum(category: Item["category"], minGames: number) {
  return gearDisplayMinimum(category) ?? minGames;
}

export function visibleGearSample(category: Item["category"], games = 0) {
  return games >= (gearDisplayMinimum(category) ?? 0);
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
