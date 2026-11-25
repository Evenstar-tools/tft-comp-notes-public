import type { Team } from "./types";
import { editionScope } from "./version-updates.ts";

export interface GuideFamilyStat {
  sectionId: string;
  teamId?: string;
  landingTeamId?: string;
  sharedTeamIds?: string[];
  clusterId: string | number;
  name: string;
  sourceName: string;
  aliases?: string[];
  carryIds: string[];
  heroAugment?: boolean;
  games: number;
  mean: number;
  winRate: number;
  topFourRate: number;
  url: string;
}

export interface GuideFamilyBatch {
  seasonId: string;
  queue: string;
  patch: string;
  days: number;
  updatedAt: string;
  totalFinishes?: number;
  build?: string;
  rows: GuideFamilyStat[];
}

const placementCutoff = 4.5;
export type RecommendationTier = "recommended" | "secondary" | "review";

export function recommendationTier(stat?: Pick<GuideFamilyStat, "games" | "mean">): RecommendationTier {
  if (!stat || !Number.isSafeInteger(stat.games) || stat.games < 100 ||
      !Number.isFinite(stat.mean) || stat.mean < 1 || stat.mean > 8) return "review";
  return stat.mean <= placementCutoff ? "recommended" : "secondary";
}

export function formatRecommendationMean(mean: number): string {
  const usual = mean.toFixed(2);
  if (mean <= placementCutoff || Number(usual) !== placementCutoff) return usual;
  // A secondary route must not look like an exact 4.50 after rounding.
  for (let digits = 3; digits < 16; digits++) {
    const precise = mean.toFixed(digits);
    if (Number(precise) > placementCutoff) return precise;
  }
  return String(mean);
}

export type GuideFamilySnapshot = GuideFamilyBatch & { sourceUrl: string };
type FamilyBatchMetadata = Pick<GuideFamilyBatch, "seasonId" | "queue" | "patch" | "days" | "updatedAt" | "build">;
type FamilyPatch = { seasonId?: string; build?: string; label: string; effectiveAt: string };
const day = 24 * 60 * 60 * 1000;
const recommendationGrace = day / 2;

function matchesFamilyScope(batch: FamilyBatchMetadata, seasonId: string, patch: FamilyPatch) {
  const scope = editionScope(seasonId);
  if (!scope || (patch.seasonId && editionScope(patch.seasonId) !== scope) ||
      batch.seasonId !== seasonId || !Number.isInteger(batch.days) || batch.days < 1) return false;
  const queue = batch.queue?.toUpperCase();
  return scope.endsWith("-pbe") ? queue === "PBE" : ["RANKED", "RANKED_TFT", "1100"].includes(queue);
}

export function currentFamilyBatch(
  batch: FamilyBatchMetadata, seasonId: string, patch?: FamilyPatch,
): boolean {
  if (!patch || !matchesFamilyScope(batch, seasonId, patch) ||
      !(Date.parse(batch.updatedAt) >= Date.parse(patch.effectiveAt))) return false;
  // MetaTFT can name the same build differently from the site's Riot patch label.
  const version = /\b(\d+\.\d+)([a-z]?)\b/i;
  const source = batch.patch?.match(version), current = patch.label.match(version);
  return Boolean(source && current && source[1] === current[1] &&
    (batch.build && patch.build ? batch.build === patch.build :
      !source[2] || !current[2] || source[2].toLowerCase() === current[2].toLowerCase()));
}

export function currentRecommendationEvidence(batch: FamilyBatchMetadata, seasonId: string, patch?: FamilyPatch) {
  if (!patch || !currentFamilyBatch(batch, seasonId, patch)) return false;
  return batch.build ? batch.build === patch.build :
    Date.parse(batch.updatedAt) - batch.days * day >= Date.parse(patch.effectiveAt);
}

export function previousRecommendationDeadline(
  batch: FamilyBatchMetadata, seasonId: string, patch: FamilyPatch | undefined, now: number,
) {
  if (!patch || !matchesFamilyScope(batch, seasonId, patch) || !batch.patch ||
      (patch.build && batch.build === patch.build)) return;
  const effectiveAt = Date.parse(patch.effectiveAt);
  const expiresAt = effectiveAt + recommendationGrace;
  if (Date.parse(batch.updatedAt) < effectiveAt && now >= effectiveAt && now < expiresAt) return expiresAt;
}

export type GuideFamilyMetric = "pickRate" | "mean" | "topFourRate" | "winRate";
export type GuideFamilyDirection = "asc" | "desc";

export function familyPickRate(games: number, totalFinishes?: number | null): number | null {
  if (totalFinishes == null || !Number.isSafeInteger(totalFinishes) || totalFinishes <= 0 ||
      !Number.isSafeInteger(games) || games < 0 || games > totalFinishes) return null;
  return games / totalFinishes;
}

export function familyMetricValue(row: GuideFamilyStat, metric: GuideFamilyMetric, totalFinishes?: number): number | null {
  if (metric === "pickRate") return familyPickRate(row.games, totalFinishes);

  const value = row[metric];
  const [minimum, maximum] = metric === "mean" ? [1, 8] : [0, 1];
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

export function compareGuideFamilyPerformance(
  a: GuideFamilyStat, b: GuideFamilyStat, metric: GuideFamilyMetric,
  direction: GuideFamilyDirection, totalFinishes?: number,
): number {
  const left = familyMetricValue(a, metric, totalFinishes);
  const right = familyMetricValue(b, metric, totalFinishes);
  if (left === null && right !== null) return 1;
  if (right === null && left !== null) return -1;
  if (left !== null && right !== null && left !== right) return direction === "asc" ? left - right : right - left;
  return b.games - a.games || String(a.clusterId).localeCompare(String(b.clusterId));
}

export const recommendationGroups = [
  { id: "reroll", label: "赌狗（1–3 费）" },
  { id: "fast8", label: "84" },
  { id: "fast9", label: "95" },
  { id: "heroAugment", label: "英雄强化" },
] as const;

export type RecommendationGroup = typeof recommendationGroups[number]["id"];

export type RecommendationStat = Pick<GuideFamilyStat, "sectionId" | "name" | "games" | "mean" | "url"> & {
  teamId: string;
  carryId?: string;
  topFourRate?: number;
  winRate?: number;
};

export type RecommendationStats = {
  seasonId: string;
  queue: string;
  patch: string;
  build: string;
  hours: number;
  updatedAt: string;
  rows: RecommendationStat[];
};

export function canRankRecommendations(stats: RecommendationStats, seasonId: string, patch: { build: string; effectiveAt: string }) {
  const end = Date.parse(stats.updatedAt);
  const start = end - stats.hours * 3600000;
  return stats.seasonId === seasonId && stats.build === patch.build &&
    stats.hours > 0 && start >= Date.parse(patch.effectiveAt);
}

export function recommendationGroup(style: string, carryCosts: number[], rollLevel?: number): RecommendationGroup | undefined {
  if (/速[八8]|^(84|8级成型|8级稳血)$/.test(style)) return "fast8";
  if (/速[九9]|^(95|9级成型)$/.test(style)) return "fast9";
  if (carryCosts.some(cost => cost >= 1 && cost <= 3) &&
      (/慢[搜D]|赌/i.test(style) || (!style && rollLevel !== undefined && rollLevel >= 5 && rollLevel <= 7))) return "reroll";
}

export function selectRecommendationRoutes<T extends {
  group: RecommendationGroup; familyId: string; rating: RecommendationStat; conditional?: boolean; preferred?: boolean;
}>(
  candidates: T[],
  { maxRegular = 12, maxHeroAugment = 2, displayOrder = [] }: {
    maxRegular?: number; maxHeroAugment?: number; displayOrder?: string[];
  } = {},
) {
  const positions = new Map(displayOrder.map((id, index) => [id, index]));
  const position = ({ rating }: T) => positions.get(rating.teamId) ?? positions.size;
  const ranked = candidates.filter(({ rating }) => recommendationTier(rating) === "recommended")
    .sort((a, b) => position(a) - position(b) || Number(!!b.preferred) - Number(!!a.preferred) ||
      a.rating.mean - b.rating.mean || b.rating.games - a.rating.games);
  const families = new Set<string>();
  const boards = new Set<string>();
  const slots = { regular: maxRegular, heroAugment: maxHeroAugment };
  const selected = ranked.filter(({ group, familyId, rating }) => {
    const pool = group === "heroAugment" ? "heroAugment" : "regular";
    if (slots[pool] <= 0 || families.has(familyId) || boards.has(rating.teamId)) return false;
    slots[pool]--;
    families.add(familyId);
    boards.add(rating.teamId);
    return true;
  });
  return recommendationGroups.flatMap(({ id }) => selected.filter(route => route.group === id)
    .sort((a, b) => position(a) - position(b) || Number(!!a.conditional) - Number(!!b.conditional)));
}

export function guideFamilyRows(batch: GuideFamilyBatch, seasonId: string, sectionId: string, teams: Team[]) {
  if (batch.seasonId !== seasonId || !batch.patch || !batch.updatedAt || batch.days < 1) return [];
  return batch.rows.flatMap(stat => {
    if (stat.sectionId !== sectionId || recommendationTier(stat) === "review") return [];
    const team = stat.teamId ? teams.find(t => t.id === stat.teamId) : teams[0];
    if (!team) return [];
    const ids = new Set([stat.landingTeamId, team.id, ...(stat.sharedTeamIds ?? [])]);
    const boards = [...ids].flatMap(id => teams.find(option => option.id === id) ?? []);
    return [{ stat, team, boards }];
  });
}
