import carryData from "@/data/guide-carry-stats.json";
import currentPatch from "@/data/current-patch.json";
import { isOfficialEdition, sameEdition } from "./version-updates";

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

const snapshot: typeof carryData & { updatedAt?: string } = carryData;
const metaTftPatch: { patch: string; bPatch?: string } = currentPatch.metaTftPatch;

export const carryMinGames = snapshot.minGames;
const editionPatch = /^(\d+\.\d+)[a-z]?$/i.exec(snapshot.patch)?.[1];
const carryDate = snapshot.updatedAt ? ` · ${snapshot.updatedAt.slice(0, 10)} UTC` : "";
export const carryPeriod = `${isOfficialEdition(snapshot.seasonId) ? "正式服" : "PBE"} ${snapshot.patch} · ${snapshot.window ?? `近 ${snapshot.days} 天`}${carryDate}`;

const byBoard = new Map<string, CarrySample[]>();
for (const sample of snapshot.rows as CarrySample[]) {
  const key = sample.sectionId + "/" + sample.teamId;
  const rows = byBoard.get(key) ?? [];
  rows.push(sample);
  byBoard.set(key, rows);
}

export function guideCarryRows(seasonId: string, sectionId: string, teamId: string, includeComparisons = false) {
  if (seasonId !== snapshot.seasonId || !editionPatch) return [];
  if (isOfficialEdition(seasonId)) {
    if (!sameEdition(seasonId, currentPatch.seasonId) ||
        !["RANKED", "RANKED_TFT", "1100"].includes(String(snapshot.queue).toUpperCase()) ||
        snapshot.build !== currentPatch.build ||
        snapshot.patch !== metaTftPatch.patch + (metaTftPatch.bPatch ?? "") ||
        !(snapshot.updatedAt && Date.parse(snapshot.updatedAt) >= Date.parse(currentPatch.effectiveAt))) return [];
  } else if (!seasonId.startsWith(`s19-pbe-${editionPatch}.`)) return [];
  const rows = byBoard.get(sectionId + "/" + teamId) ?? [];
  return includeComparisons ? rows : rows.filter(row => !row.sameNine);
}
