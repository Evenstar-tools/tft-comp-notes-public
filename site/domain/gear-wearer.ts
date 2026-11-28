import { guideSearchKey } from "./guide-search.ts";
import { searchNameRank } from "./site-search.ts";
import type { Item, Unit } from "./types";
import { unitSearchNames } from "./unit-search.mjs";

export type GearWearerSample = { games: number; mean?: number | null; winRate?: number | null };
export const gearSortOrders = {
  mean: ["mean", "mean-desc"],
  wins: ["wins", "wins-asc"],
  games: ["games", "games-asc"],
} as const;
export type GearSortMetric = keyof typeof gearSortOrders;
export type GearOrder = (typeof gearSortOrders)[GearSortMetric][number];

export function parseGearOrder(order: unknown): GearOrder {
  if (order === "winRate") return "wins";
  for (const [first, reverse] of Object.values(gearSortOrders)) {
    if (order === first) return first;
    if (order === reverse) return reverse;
  }
  return "mean";
}

export function gearSortAscending(order: GearOrder) {
  return order === "mean" || order === "games-asc" || order === "wins-asc";
}

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

export function compareGearSamples(a: Partial<GearWearerSample>, b: Partial<GearWearerSample>, order: GearOrder) {
  const metric = order === "games" || order === "games-asc" ? "games"
    : order === "wins" || order === "wins-asc" ? "winRate" : "mean";
  const aValue = a[metric], bValue = b[metric];
  if (aValue == null || bValue == null) {
    if (aValue != null) return -1;
    if (bValue != null) return 1;
  } else if (aValue !== bValue) {
    return gearSortAscending(order) ? aValue - bValue : bValue - aValue;
  }
  return (b.games ?? 0) - (a.games ?? 0);
}

export function compareGearWearerSamples(a: GearWearerSample, b: GearWearerSample, order: GearOrder, minGames: number) {
  return compareGearSamples(gearWearerStats(a, minGames), gearWearerStats(b, minGames), order);
}
