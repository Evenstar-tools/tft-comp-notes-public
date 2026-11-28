import type { Team } from "./types";
import { boardQuerySignature } from "./owner-board-query.ts";
import { editionScope } from "./version-updates.ts";

export interface GuideFamilyStat {
  sectionId: string;
  teamId?: string;
  landingTeamId?: string;
  sharedTeamIds?: string[];
  boardSignatures?: Record<string, string>;
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

export type GuideFamilySmallSample = Omit<GuideFamilyStat, "mean" | "winRate" | "topFourRate"> & {
  mean: number | null;
  winRate: number | null;
  topFourRate: number | null;
};

export interface GuideFamilyBatch {
  seasonId: string;
  queue: string;
  patch: string;
  days: number;
  updatedAt?: string | null;
  totalFinishes?: number;
  build?: string;
  spansBuilds?: boolean;
  rows: GuideFamilyStat[];
  smallSamples?: GuideFamilySmallSample[];
}

export const placementCutoff = 4.5;
export const highWinRateCutoff = 0.15;
export type RecommendationTier = "recommended" | "secondary" | "review";
export const guideTierLabels = { recommended: "推荐", secondary: "次选", review: "待复核" } as const;

export function recommendationTier(
  stat?: Pick<GuideFamilySmallSample, "games" | "mean"> & { winRate?: number | null },
): RecommendationTier {
  if (!stat || !Number.isSafeInteger(stat.games) || stat.games < 100 ||
      stat.mean === null || !Number.isFinite(stat.mean) || stat.mean < 1 || stat.mean > 8) return "review";
  const highWinRate = stat.winRate !== undefined && stat.winRate !== null && Number.isFinite(stat.winRate) &&
    stat.winRate >= highWinRateCutoff && stat.winRate <= 1;
  return stat.mean <= placementCutoff || highWinRate ? "recommended" : "secondary";
}

export function guideDirectoryTier(stat: Parameters<typeof recommendationTier>[0], status?: string): RecommendationTier {
  return status === "review" ? "review" : recommendationTier(stat);
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
type FamilyBatchMetadata = Pick<GuideFamilyBatch, "seasonId" | "queue" | "patch" | "days" | "updatedAt" | "build" | "spansBuilds">;
type FamilyPatch = { seasonId?: string; build?: string; label: string; effectiveAt: string };
const day = 24 * 60 * 60 * 1000;
const recommendationGrace = day / 2;

function matchesEditionQueue(scope: string, queue: string | undefined) {
  const normalized = queue?.toUpperCase();
  return scope.endsWith("-pbe") ? normalized === "PBE" : ["RANKED", "RANKED_TFT", "1100"].includes(normalized ?? "");
}

function matchesFamilyScope(batch: FamilyBatchMetadata, seasonId: string, patch: FamilyPatch) {
  const scope = editionScope(seasonId);
  if (!scope || (patch.seasonId && editionScope(patch.seasonId) !== scope) ||
      batch.seasonId !== seasonId || !Number.isInteger(batch.days) || batch.days < 1) return false;
  return matchesEditionQueue(scope, batch.queue);
}

export function currentFamilyBatch(
  batch: FamilyBatchMetadata, seasonId: string, patch?: FamilyPatch,
): boolean {
  if (!patch || !matchesFamilyScope(batch, seasonId, patch) ||
      !(Date.parse(batch.updatedAt ?? "") >= Date.parse(patch.effectiveAt))) return false;
  // MetaTFT can name the same build differently from the site's Riot patch label.
  const version = /\b(\d+\.\d+)([a-z]?)\b/i;
  const source = batch.patch?.match(version), current = patch.label.match(version);
  return Boolean(source && current && source[1] === current[1] &&
    (batch.build && patch.build ? batch.build === patch.build :
      !source[2] || !current[2] || source[2].toLowerCase() === current[2].toLowerCase()));
}

export function currentRecommendationEvidence(
  batch: FamilyBatchMetadata, seasonId: string, patch?: FamilyPatch, reviewedRollingPatch?: string,
) {
  if (!patch || !currentFamilyBatch(batch, seasonId, patch)) return false;
  // A reviewed rolling cohort can keep the same source patch across a Riot hotfix.
  if (batch.spansBuilds) return !!patch.build && batch.build === patch.build && batch.patch === reviewedRollingPatch;
  return batch.build ? batch.build === patch.build :
    Date.parse(batch.updatedAt ?? "") - batch.days * day >= Date.parse(patch.effectiveAt);
}

export function previousRecommendationDeadline(
  batch: FamilyBatchMetadata, seasonId: string, patch: FamilyPatch | undefined, now: number,
) {
  if (!patch || !matchesFamilyScope(batch, seasonId, patch) || !batch.patch ||
      (patch.build && batch.build === patch.build)) return;
  const effectiveAt = Date.parse(patch.effectiveAt);
  const expiresAt = effectiveAt + recommendationGrace;
  if (Date.parse(batch.updatedAt ?? "") < effectiveAt && now >= effectiveAt && now < expiresAt) return expiresAt;
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
  sampleScope?: string;
};

export type HomeRecommendationRating = RecommendationStat |
  (Pick<RecommendationStat, "teamId" | "sectionId" | "name" | "carryId"> & { mean?: undefined; games?: undefined });

export type OwnerRecommendationOverride = "pin" | "include" | "exclude";

const homeRecommendationCutoff = 4.40;
const homeMaxVisible = 12;
const homeMaxPerGroup = 8;
const homeMaxHeroAugment = 2;

type HomeRecommendationSample = Pick<GuideFamilyStat, "games" | "mean">;

export function hasHomeRecommendationSample(rating: HomeRecommendationRating): rating is RecommendationStat;
export function hasHomeRecommendationSample(rating: Partial<HomeRecommendationSample>): rating is HomeRecommendationSample;
export function hasHomeRecommendationSample({ games, mean }: Partial<HomeRecommendationSample>) {
  return games !== undefined && mean !== undefined && recommendationTier({ games, mean }) !== "review";
}

export function homeRecommendationEligible(rating: Partial<HomeRecommendationSample>) {
  return hasHomeRecommendationSample(rating) && rating.mean <= homeRecommendationCutoff;
}

export type RecommendationStats = {
  seasonId: string;
  queue: string;
  patch: string;
  build: string;
  hours: number;
  updatedAt?: string | null;
  rows: (RecommendationStat & Pick<GuideFamilyStat, "topFourRate" | "winRate">)[];
};

export function canRankRecommendations(stats: RecommendationStats, seasonId: string, patch: {
  build: string;
  effectiveAt: string;
  metaTftPatch?: { patch: string; bPatch?: string };
}) {
  const scope = editionScope(seasonId);
  const expected = patch.metaTftPatch;
  const end = Date.parse(stats.updatedAt ?? "");
  const start = end - stats.hours * 3600000;
  return stats.seasonId === seasonId && stats.build === patch.build &&
    (!scope || matchesEditionQueue(scope, stats.queue)) &&
    (!expected || stats.patch === expected.patch + (expected.bPatch ?? "")) &&
    stats.hours > 0 && start >= Date.parse(patch.effectiveAt);
}

export function recommendationGroup(style: string, carryCosts: number[], rollLevel?: number): RecommendationGroup | undefined {
  if (/速[八8]|^(84|8级成型|8级稳血)$/.test(style)) return "fast8";
  if (/速[九9]|^(95|9级成型)$/.test(style)) return "fast9";
  if (carryCosts.some(cost => cost >= 1 && cost <= 3) &&
      (/慢[搜D]|赌/i.test(style) || (!style && rollLevel !== undefined && rollLevel >= 5 && rollLevel <= 7))) return "reroll";
}

type HomeRecommendationCandidate = {
  group: RecommendationGroup;
  familyId: string;
  rating: HomeRecommendationRating;
  override?: OwnerRecommendationOverride;
  pinOrder?: number;
  launchOrder?: number;
};

function compareHomeRoutes(a: HomeRecommendationCandidate, b: HomeRecommendationCandidate) {
  const aPinned = a.override === "pin", bPinned = b.override === "pin";
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  const pinDifference = aPinned ? (a.pinOrder ?? 0) - (b.pinOrder ?? 0) : 0;
  if (pinDifference) return pinDifference;

  const aSample = hasHomeRecommendationSample(a.rating) ? a.rating : undefined;
  const bSample = hasHomeRecommendationSample(b.rating) ? b.rating : undefined;
  if (aSample && !bSample) return -1;
  if (bSample && !aSample) return 1;
  const sampleDifference = aSample && bSample ? aSample.mean - bSample.mean || bSample.games - aSample.games : 0;
  return sampleDifference || ((a.launchOrder ?? homeMaxVisible) - (b.launchOrder ?? homeMaxVisible)) ||
    (a.familyId < b.familyId ? -1 : Number(a.familyId > b.familyId));
}

function homeSelectionPriority(route: HomeRecommendationCandidate) {
  if (route.override === "pin") return 0;
  return route.launchOrder !== undefined || (route.override === "include" && !hasHomeRecommendationSample(route.rating)) ? 1 : 2;
}

export function selectRecommendationRoutes<T extends HomeRecommendationCandidate>(candidates: T[]) {
  const bestByGuideGroup = new Map<string, T>();
  for (const candidate of candidates) {
    const { override, group, rating } = candidate;
    if (override === "exclude" || (!override && !homeRecommendationEligible(rating))) continue;

    const key = `${group}:${rating.sectionId}`;
    const current = bestByGuideGroup.get(key);
    const launchPriority = current && (candidate.launchOrder !== undefined || current.launchOrder !== undefined)
      ? homeSelectionPriority(candidate) - homeSelectionPriority(current) : 0;
    if (!current || (launchPriority || compareHomeRoutes(candidate, current)) < 0) bestByGuideGroup.set(key, candidate);
  }

  const ranked = [...bestByGuideGroup.values()].sort((a, b) =>
    homeSelectionPriority(a) - homeSelectionPriority(b) || compareHomeRoutes(a, b));
  const groups: Record<RecommendationGroup, T[]> = { reroll: [], fast8: [], fast9: [], heroAugment: [] };
  const families = new Set<string>();
  const boards = new Set<string>();
  let remaining = homeMaxVisible;
  for (const route of ranked) {
    if (remaining === 0) break;
    const selected = groups[route.group];
    const groupLimit = route.group === "heroAugment" ? homeMaxHeroAugment : homeMaxPerGroup;
    if (selected.length >= groupLimit || families.has(route.familyId) || boards.has(route.rating.teamId)) continue;

    selected.push(route);
    families.add(route.familyId);
    boards.add(route.rating.teamId);
    remaining--;
  }
  return recommendationGroups.flatMap(({ id }) => groups[id].sort(compareHomeRoutes));
}

export function familyBoardIds(stat: Pick<GuideFamilySmallSample, "teamId" | "landingTeamId" | "sharedTeamIds">, primaryTeamId?: string) {
  return [stat.landingTeamId, stat.teamId ?? primaryTeamId, ...(stat.sharedTeamIds ?? [])];
}

// Membership still matters when a native sample is too small or its batch is stale.
export function guideFamilyBoardIds(batch: GuideFamilyBatch, seasonId: string, sectionId: string, primaryTeamId?: string) {
  if (batch.seasonId !== seasonId) return new Set<string>();
  return new Set([...batch.rows, ...(batch.smallSamples ?? [])]
    .filter(stat => stat.sectionId === sectionId)
    .flatMap(stat => familyBoardIds(stat, primaryTeamId))
    .filter(id => id !== undefined));
}

export function familyRosterMatches(stat: Pick<GuideFamilyStat, "boardSignatures">, team: Team) {
  return !team.publishedRosterChanged || stat.boardSignatures?.[team.id] === boardQuerySignature(team.pieces);
}

export function guideFamilyRows(batch: GuideFamilyBatch, seasonId: string, sectionId: string, teams: Team[], { includeSmallSamples = false } = {}) {
  if (batch.seasonId !== seasonId || !batch.patch || !batch.updatedAt || batch.days < 1) return [];
  const rows: GuideFamilySmallSample[] = includeSmallSamples ? [...batch.rows, ...(batch.smallSamples ?? [])] : batch.rows;
  return rows.flatMap(stat => {
    const countOnly = includeSmallSamples && Number.isSafeInteger(stat.games) && stat.games > 0 && stat.games < 100;
    if (stat.sectionId !== sectionId || (!countOnly && recommendationTier(stat) === "review")) return [];
    const team = stat.teamId ? teams.find(t => t.id === stat.teamId) : teams[0];
    if (!team || !familyRosterMatches(stat, team)) return [];
    // The collector has not checked alternate board links for count-only samples.
    const ids = new Set(countOnly ? [team.id] : familyBoardIds(stat, team.id));
    const boards = [...ids].flatMap(id => teams.find(option => option.id === id && familyRosterMatches(stat, option)) ?? []);
    return [{ stat: stat as GuideFamilyStat, team, boards }];
  });
}
