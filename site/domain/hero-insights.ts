import type { Item, Unit } from "./types";

export type HeroResult = { games: number; mean: number; top4Rate: number; winRate: number };
export type HeroItemSample = { itemId: string; games: number; mean?: number; rate?: number; placementDelta?: number };
export type HeroItemSource = { source: string; version: string; window: string; date: string; minGames: number };

export function rankHeroes(
  units: Pick<Unit, "id" | "cost">[], results: Record<string, HeroResult>, minGames: number,
) {
  const groups = new Map<number, { id: string; mean: number }[]>();
  for (const { id, cost } of units) {
    const row = results[id];
    if (!row || row.games < minGames) continue;
    const group = groups.get(cost) ?? [];
    group.push({ id, mean: row.mean });
    groups.set(cost, group);
  }
  const ranks = new Map<string, { place: number; total: number }>();
  for (const group of groups.values()) {
    group.sort((left, right) => left.mean - right.mean);
    let place = 1;
    group.forEach((row, index) => {
      if (index > 0 && row.mean !== group[index - 1].mean) place = index + 1;
      ranks.set(row.id, { place, total: group.length });
    });
  }
  return ranks;
}

export function heroCostRankTone(rank?: { place: number; total: number }): "strong" | "weak" | undefined {
  if (!rank || !Number.isSafeInteger(rank.place) || !Number.isSafeInteger(rank.total) || rank.total < 3) return undefined;
  const cutoff = Math.max(1, Math.round(rank.total / 3));
  if (rank.place <= cutoff) return "strong";
  if (rank.place > rank.total - cutoff) return "weak";
  return undefined;
}

export function commonHeroItems(
  items: ReadonlyMap<string, Item>,
  samples: Record<string, { rows: { unitId: string; games: number; mean?: number | null; rate?: number | null; placementDelta?: number }[] }>,
  minGames: number,
) {
  const byHero: Record<string, HeroItemSample[]> = {};
  for (const [itemId, sample] of Object.entries(samples)) {
    if (items.get(itemId)?.category !== "completed") continue;
    for (const { unitId, games, mean, rate, placementDelta } of sample.rows) {
      if (games >= minGames) (byHero[unitId] ??= []).push({
        itemId,
        games,
        ...(typeof mean === "number" && { mean }),
        ...(typeof rate === "number" && { rate }),
        ...(placementDelta !== undefined && { placementDelta }),
      });
    }
  }
  for (const unitId of Object.keys(byHero)) {
    byHero[unitId] = byHero[unitId].sort((left, right) => right.games - left.games || left.itemId.localeCompare(right.itemId)).slice(0, 6);
  }
  return byHero;
}
