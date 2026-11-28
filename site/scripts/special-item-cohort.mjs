import { setTimeout as delay } from "node:timers/promises";
import { verifyItemWindow } from "./refresh-cohort.mjs";

class ItemHistogramMismatch extends Error {}

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

export function itemCohort(data, itemId, cohort, days) {
  verifyItemWindow(data, cohort, itemId);

  // dates includes earlier hotfixes and days outside the requested wearer cohort.
  const totals = Array(8).fill(0);
  const boundary = Array(8).fill(0);
  const seenDays = new Set();
  for (const row of data.dates) {
    if (row.itemName !== itemId || row.patch[0] !== cohort.patch || row.patch[1] !== cohort.bPatch ||
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
    throw new ItemHistogramMismatch("Item and wearer placement histograms disagree for " + itemId);
  // The item and all individual wearers now share a single capture. Count every
  // wearer before mapping shop units or applying the best-wearer threshold.
  return { version: cohort.version, stats };
}

export async function fetchItemCohort(url, itemId, cohort, days, fetcher = fetch) {
  const alternate = new URL(url);
  alternate.search = new URLSearchParams([...alternate.searchParams].reverse()).toString();
  const decimal = new URL(url);
  decimal.searchParams.set("days", days.toFixed(1));
  const decimalAlternate = new URL(alternate);
  decimalAlternate.searchParams.set("days", days.toFixed(1));
  const candidates = [url, alternate.href, decimal.href, decimalAlternate.href];
  const backoff = [0, 750, 1_500, 4_500, 15_000, 35_000];
  for (let attempt = 0; ; attempt++) {
    const candidate = candidates[attempt % candidates.length];
    const response = await fetcher(candidate, { signal: AbortSignal.timeout(18000), cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status} · ${itemId}`);
    const data = await response.json();
    try {
      return { data, ...itemCohort(data, itemId, cohort, days) };
    } catch (error) {
      if (!(error instanceof ItemHistogramMismatch) || attempt === backoff.length) throw error;
      // Equivalent query spellings can bypass a stale upstream cache entry.
      // Both responses must pass the identical cohort and histogram checks.
      if (backoff[attempt] > 0) await delay(backoff[attempt]);
    }
  }
}
