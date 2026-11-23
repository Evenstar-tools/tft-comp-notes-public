import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { itemCohort, itemPlacementDelta, placements, rounded } from "./special-item-cohort.mjs";

const dataUrl = name => new URL("../data/" + name + ".json", import.meta.url);
const { values: { evidence, out } } = parseArgs({ options: { evidence: { type: "string" }, out: { type: "string" } } });
if (evidence) await mkdir(evidence, { recursive: true });
const read = name => readFile(dataUrl(name), "utf8").then(JSON.parse);
const [previous, reference, source] = await Promise.all(
  ["item-wearers", "item-reference", "conditional-gear-unit-ids"].map(read),
);
const ids = Object.keys(previous.items);
const unitIds = new Map(Object.entries(source.units).map(([id, apiName]) => [apiName, id]));
const sourceIds = ids.map(id => reference.items[id]?.pbeId);
if (sourceIds.some(id => !id) || new Set(sourceIds).size !== ids.length) {
  throw new Error("Expected a unique source ID for every ordinary equipment row");
}
const days = 3;
const minGames = previous.minGames;
const endpoint = "https://api-hc.metatft.com/tft-stat-api/item_detail";

async function collect(id, itemName) {
  const query = new URLSearchParams({
    itemName, queue: "PBE", patch: "current", days: String(days), permit_filter_adjustment: "false",
  });
  const url = endpoint + "?" + query;
  const response = await fetch(url, { signal: AbortSignal.timeout(18_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} · ${itemName}`);
  const result = await response.json();
  const { version, stats: { games: totalGames, mean, winRate } } = itemCohort(result, itemName, source.patch, days);
  const overall = new Map(result.units_overall.map(row => [row.unit, { games: placements(row.places).games, places: row.places }]));
  const rows = result.units.flatMap(row => {
    const stats = placements(row.places);
    const unitId = unitIds.get(row.unit);
    if (!unitId && stats.games >= minGames) throw new Error("Unmapped wearer " + row.unit + " · " + itemName);
    if (!unitId || !stats.games) return [];
    const baseline = overall.get(row.unit);
    const placementDelta = itemPlacementDelta(row.places, baseline?.places, minGames);
    return [{
      unitId, ...stats,
      ...(baseline && baseline.games >= stats.games && { rate: rounded(stats.games / baseline.games) }),
      ...(placementDelta !== undefined && { placementDelta }),
    }];
  }).sort((a, b) => b.games - a.games || a.unitId.localeCompare(b.unitId));
  if (new Set(rows.map(row => row.unitId)).size !== rows.length) throw new Error("Duplicate wearer for " + itemName);
  if (evidence) await writeFile(join(evidence, `ordinary-${id}.json`), JSON.stringify({ url, result }) + "\n", "utf8");
  return { id, version, updated: result.updated, data: { url: previous.items[id].url, totalGames, mean, winRate, rows } };
}

const collected = [];
for (let i = 0; i < ids.length; i += 4) {
  const batch = await Promise.allSettled(ids.slice(i, i + 4).map((id, j) => collect(id, sourceIds[i + j])));
  collected.push(...batch);
}
const failures = collected.filter(row => row.status === "rejected");
if (failures.length) throw new AggregateError(failures.map(row => row.reason), "Ordinary equipment refresh incomplete");
const rows = collected.map(row => row.value);
if (new Set(rows.map(row => row.version)).size !== 1) throw new Error("Mixed PBE hotfixes in this refresh");
const updated = new Date(Math.min(...rows.map(row => row.updated)));
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(updated);
if (previous.updatedAt ? updated.toISOString() < previous.updatedAt : date < previous.date) throw new Error("Older ordinary equipment snapshot");
const snapshot = {
  source: "MetaTFT", version: "S19 PBE " + rows[0].version, window: "最近 3 天", date,
  updatedAt: updated.toISOString(), minGames, items: Object.fromEntries(rows.map(row => [row.id, row.data])),
};
await writeFile(out ?? dataUrl("item-wearers"), JSON.stringify(snapshot, null, 2) + "\n", "utf8");
console.log(snapshot.version, snapshot.updatedAt, rows.length, "items,", rows.filter(row => row.data.totalGames).length, "with samples");
