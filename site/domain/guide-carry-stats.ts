import snapshot from "@/data/guide-carry-stats.json";

export interface CarrySample {
  sectionId: string;
  teamId: string;
  carryId: string;
  carryName: string;
  stars: number;
  slots: number;
  anchorIds: string[];
  scope: string;
  tankName: string;
  games: number;
  placementCounts: number[];
  kind: string;
  recentGames: number;
  completedGames: number;
  loadoutGames: number;
  withAugments: number;
  gearComparable: boolean;
  sameNine?: boolean;
  url: string;
}

export const carryMinGames = snapshot.minGames;
export const carryPeriod = `PBE ${snapshot.patch} · 近 ${snapshot.days} 天 · ${snapshot.updatedAt.slice(0, 10)} UTC`;

const byBoard = new Map<string, CarrySample[]>();
for (const sample of snapshot.rows as CarrySample[]) {
  const key = sample.sectionId + "/" + sample.teamId;
  const rows = byBoard.get(key) ?? [];
  rows.push(sample);
  byBoard.set(key, rows);
}

export function guideCarryRows(seasonId: string, sectionId: string, teamId: string, includeComparisons = false) {
  if (seasonId !== snapshot.seasonId || !seasonId.startsWith(`s19-pbe-${snapshot.patch}.`)) return [];
  const rows = byBoard.get(sectionId + "/" + teamId) ?? [];
  return includeComparisons ? rows : rows.filter(row => !row.sameNine);
}
