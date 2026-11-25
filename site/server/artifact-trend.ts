import { itemMap, season, unitMap } from "@/data";
import currentPatch from "@/data/current-patch.json";
import { specialItemWearers } from "@/data/special-item-wearers";
import { currentWearerSnapshot } from "@/domain/gear-wearer";
import { rankedWearers } from "@/domain/site-search";
import { isOfficialEdition, sameEdition } from "@/domain/version-updates";

export function currentArtifactRanking(edition: string) {
  const snapshot = specialItemWearers;
  if (!sameEdition(edition, season.id) || !sameEdition(edition, currentPatch.seasonId) ||
      !currentWearerSnapshot(snapshot, currentPatch) ||
      (isOfficialEdition(edition) && (snapshot.rankedScope !== "international" || !["RANKED", "RANKED_TFT", "1100"].includes(snapshot.queue?.toUpperCase() ?? "")))) return;

  const minGames = snapshot.minGames;
  const rows = Object.entries(snapshot.items).flatMap(([id, sample]) => {
    const item = itemMap.get(id);
    const { totalGames, winRate } = sample;
    if (item?.category !== "artifact" || totalGames === undefined || !Number.isSafeInteger(totalGames) ||
        totalGames < minGames || winRate === undefined || !Number.isFinite(winRate) || winRate < 0 || winRate > 1) return [];
    return [{ item, games: totalGames, winRate, sample }];
  }).sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.item.id.localeCompare(b.item.id))
    .slice(0, 6).map(({ sample, ...entry }) => {
      const eligible = sample.rows.filter(row => unitMap.has(row.unitId));
      const holders = rankedWearers(eligible, minGames).slice(0, 2);
      const order = eligible.some(row => row.games >= minGames && typeof row.mean === "number") ? "mean" : "games";
      return { ...entry, order, holders: holders.flatMap(({ unitId, ...stats }) => {
        const unit = unitMap.get(unitId);
        return unit ? [{ unit, ...stats }] : [];
      }) };
    });
  return { rows, minGames, source: [snapshot.source, snapshot.version, snapshot.window].join(" · ") };
}
