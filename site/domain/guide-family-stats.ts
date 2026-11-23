import type { Team } from "./types";

export interface GuideFamilyStat {
  sectionId: string;
  teamId?: string;
  landingTeamId?: string;
  clusterId: string | number;
  name: string;
  sourceName: string;
  aliases?: string[];
  carryIds: string[];
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
  rows: GuideFamilyStat[];
}

export const recommendationGroups = [
  { id: "reroll", label: "赌狗（1–3 费）" },
  { id: "fast8", label: "84" },
  { id: "fast9", label: "95" },
] as const;

export type RecommendationGroup = typeof recommendationGroups[number]["id"];

export type RecommendationStat = Pick<GuideFamilyStat, "sectionId" | "name" | "games" | "mean" | "url"> & {
  teamId: string;
  opening?: string;
  carryId?: string;
  carryGames?: number;
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

export function selectRecommendationRoutes<T extends { group: RecommendationGroup; familyId: string; rating: RecommendationStat; conditional?: boolean }>(
  candidates: T[],
) {
  const ranked = candidates.filter(({ rating }) =>
    Number.isSafeInteger(rating.games) && rating.games >= 100 && rating.mean >= 1 && rating.mean <= 4.5
  ).sort((a, b) => a.rating.mean - b.rating.mean || b.rating.games - a.rating.games);
  return recommendationGroups.flatMap(({ id }) => {
    const families = new Set<string>();
    const carries = new Set<string>();
    const routes = ranked.filter(({ group, familyId, rating }) => {
      if (group !== id || families.has(familyId) || (rating.carryId && carries.has(rating.carryId))) return false;
      families.add(familyId);
      if (rating.carryId) carries.add(rating.carryId);
      return true;
    });
    const top = routes.slice(0, 4);
    // Reserve one optional slot for a less commonly held carry in the same sample.
    const [first, second] = top;
    const leadUsage = Math.min(first?.rating.carryGames ?? 0, second?.rating.carryGames ?? 0);
    const alternative = leadUsage > 0 && routes.slice(2).find(({ rating }) =>
      rating.carryGames !== undefined && rating.carryGames > 0 && rating.carryGames < leadUsage);
    if (alternative && !top.includes(alternative)) top[3] = alternative;
    return top.sort((a, b) => Number(!!a.conditional) - Number(!!b.conditional));
  });
}

export function guideFamilyRows(batch: GuideFamilyBatch, seasonId: string, sectionId: string, teams: Team[]) {
  if (batch.seasonId !== seasonId || !batch.patch || !batch.updatedAt || batch.days < 1) return [];
  return batch.rows.flatMap(stat => {
    if (stat.sectionId !== sectionId || !(Number.isSafeInteger(stat.games) && stat.games >= 100 && stat.mean >= 1 && stat.mean <= 8)) return [];
    const team = stat.teamId ? teams.find(t => t.id === stat.teamId) : teams[0];
    if (!team) return [];
    const landing = stat.landingTeamId && teams.find(option => option.id === stat.landingTeamId);
    const boards = landing && landing.id !== team.id ? [landing, team] : [team];
    return [{ stat, team, boards }];
  });
}
