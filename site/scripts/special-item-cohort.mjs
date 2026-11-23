export const rounded = value => Number(value.toFixed(6));

export function placements(places) {
  if (!Array.isArray(places) || places.length !== 8 || !places.every(n => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Invalid placement histogram");
  const games = places.reduce((sum, n) => sum + n, 0);
  if (!games) return { games };
  return {
    games,
    mean: rounded(places.reduce((sum, n, i) => sum + n * (i + 1), 0) / games),
    winRate: rounded(places[0] / games),
  };
}

export function itemPlacementDelta(worn, overall, minGames) {
  if (!overall || worn.some((count, index) => count > overall[index])) return undefined;
  const withItem = placements(worn);
  const withoutItem = placements(overall.map((count, index) => count - worn[index]));
  if (withItem.games < minGames || withoutItem.games < minGames) return undefined;
  return rounded(withItem.mean - withoutItem.mean);
}

export function itemCohort(data, itemId, patch, days) {
  const cohort = data.unit_games?.[0]?.patch;
  if (data.queue_id !== "pbe" || data.tft_set !== "TFTSet19" || data.unit_games?.length !== 1 ||
      !Array.isArray(cohort) || cohort.length !== 2 || cohort[0] !== patch || typeof cohort[1] !== "string" ||
      !Number.isFinite(data.updated) || data.updated <= 0)
    throw new Error("Unexpected PBE cohort for " + itemId);

  // dates includes earlier hotfixes and days outside the requested wearer cohort.
  const totals = Array(8).fill(0);
  const boundary = Array(8).fill(0);
  const seenDays = new Set();
  for (const row of data.dates) {
    if (row.itemName !== itemId || row.patch[0] !== patch || row.patch[1] !== cohort[1] ||
        !Number.isInteger(row.day) || row.day < 1 || row.day > days + 1) continue;
    if (seenDays.has(row.day)) throw new Error("Duplicate daily histogram for " + itemId);
    seenDays.add(row.day);
    placements(row.places);
    const counts = row.day === days + 1 ? boundary : totals;
    row.places.forEach((count, index) => { counts[index] += count; });
  }

  // These two source aggregates refresh independently. Reject divergent samples
  // even when their total matches but the placement distributions disagree.
  const holders = Array(8).fill(0);
  for (const row of data.units) {
    placements(row.places);
    row.places.forEach((count, index) => { holders[index] += count; });
  }
  const stats = placements(holders);
  const dailyGames = placements(totals).games;
  const difference = holders.reduce((sum, count, index) => sum + Math.abs(totals[index] - count), 0);
  const aligns = Boolean(stats.games) === Boolean(dailyGames) && difference <= Math.max(8, Math.max(stats.games, dailyGames) * 0.05);
  // Accept a trailing calendar bucket only when it reconciles every placement exactly.
  const boundaryAligns = holders.every((count, index) => count === totals[index] + boundary[index]);
  if (!aligns && !boundaryAligns)
    throw new Error("Item and wearer placement histograms disagree for " + itemId);
  // The item and all individual wearers now share a single capture. Count every
  // wearer before mapping shop units or applying the best-wearer threshold.
  return { version: cohort.join(""), stats };
}
