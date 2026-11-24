import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { EOL } from "node:os";
import { itemCohort, placements, rounded } from "./special-item-cohort.mjs";

const lookupUrl = "https://data.metatft.com/lookups/TFTSet19_pbe_en_us.json";
const api = "https://api-hc.metatft.com/tft-stat-api/item_detail";
const days = 3;
const minGames = 100;
const itemTags = ["Artifact", "Support", "Radiant"].map(name => "Item.Equippable.Item." + name);
const unitOverrides = {
  elise: "DA_Elise19",
  seraphine: "DA_Seraphine19_Indie",
  shyvana: "DA_Shyvana19",
  nidalee: "DA_Nidalee19",
  "akali-kda": "DA_AkaliKDA19",
  "akali-true-damage": "DA_Akali_TrueDamage19",
};
const clean = name => name.normalize("NFKC").toLowerCase().replace(/[\s\p{P}]/gu, "");

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(18000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("HTTP " + response.status + " · " + url);
  return response.json();
}

const [season, catalog, lookup, current] = await Promise.all([
  readFile(new URL("../data/season.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../data/special-equipment.json", import.meta.url), "utf8").then(JSON.parse),
  getJson(lookupUrl),
  readFile(new URL("../data/current-patch.json", import.meta.url), "utf8").then(JSON.parse),
]);
const patch = lookup._metadata?.release?.match(/^rls-(\d+\.\d+)\./)?.[1];
const cohort = current.metaTftPatch;
if (!patch || current.seasonId !== "s19-pbe" || cohort?.patch !== patch || !cohort.bPatch ||
    lookup._metadata.set !== "TFTSet19" || lookup._metadata.patch !== "pbe")
  throw new Error("Expected an S19 PBE lookup");
const sourceIds = lookup.items
  .filter(row => row.tags.some(tag => itemTags.includes(tag)) && !row.tags.includes("Item.Equippable.Consumable"))
  .map(row => row.apiName);
const liveIds = new Set(sourceIds);
if (!sourceIds.length || liveIds.size !== sourceIds.length || catalog.items.length !== liveIds.size ||
    catalog.items.some(item => !liveIds.has(item.id)))
  throw new Error("Refresh the special equipment catalogue before collecting stats");

const unitIds = new Map(season.units.map(unit => {
  const candidates = lookup.units.filter(row => row.shopUnit && row.cost === unit.cost && clean(row.name) === clean(unit.nameEn));
  const sourceId = unitOverrides[unit.id] ?? (candidates.length === 1 ? candidates[0].apiName : undefined);
  if (!sourceId) throw new Error("Unmapped unit " + unit.id);
  return [sourceId, unit.id];
}));
if (unitIds.size !== season.units.length) throw new Error("Duplicate unit mappings");

async function collect(itemId) {
  const params = new URLSearchParams({
    itemName: itemId, queue: "PBE", patch, b_patch: cohort.bPatch, days: String(days), permit_filter_adjustment: "false",
  });
  const data = await getJson(api + "?" + params);
  const { version, stats: { games: totalGames, mean, winRate } } = itemCohort(data, itemId, patch, days);
  if (version !== patch + cohort.bPatch) throw new Error("Unexpected PBE hotfix for " + itemId);
  const overall = new Map(data.units_overall.map(row => [row.unit, placements(row.places).games]));
  const rows = data.units.flatMap(row => {
    const stats = placements(row.places);
    const unitId = unitIds.get(row.unit);
    if (!unitId && stats.games >= minGames) throw new Error("Unmapped wearer " + row.unit + " · " + itemId);
    if (!unitId || !stats.games) return [];
    const appearances = overall.get(row.unit);
    return [{ unitId, ...stats, ...(appearances >= stats.games ? { rate: rounded(stats.games / appearances) } : {}) }];
  }).sort((a, b) => b.games - a.games || a.unitId.localeCompare(b.unitId));
  if (new Set(rows.map(row => row.unitId)).size !== rows.length) throw new Error("Duplicate wearer for " + itemId);
  return { itemId, version, updated: data.updated, data: {
    url: "https://www.metatft.com/items/" + encodeURIComponent(itemId) + "?set=TFTSet19", totalGames, mean, winRate, rows,
  } };
}

const collected = [];
for (let i = 0; i < sourceIds.length; i += 4) {
  const batch = await Promise.all(sourceIds.slice(i, i + 4).map(collect));
  collected.push(...batch);
  for (const { itemId, data } of batch)
    console.log(itemId, data.totalGames, data.mean ?? "—", data.rows.length);
}

const updatedAt = new Date(Math.min(...collected.map(row => row.updated)));
const versions = new Set(collected.map(row => row.version));
if (versions.size !== 1) throw new Error("Mixed PBE hotfixes in this refresh");
if (!collected.some(row => row.data.totalGames > 0)) throw new Error("No PBE equipment samples in this refresh");
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(updatedAt);
const snapshot = {
  source: "MetaTFT", version: "S19 PBE " + collected[0].version, window: "最近 3 天", date,
  updatedAt: updatedAt.toISOString(), minGames,
  items: Object.fromEntries(collected.map(row => [row.itemId, row.data])),
};
const target = new URL("../data/special-item-wearers.json", import.meta.url);
const staging = new URL("./special-item-wearers." + process.pid + ".tmp", target);
try {
  await writeFile(staging, JSON.stringify(snapshot) + EOL, "utf8");
  await rename(staging, target);
} finally {
  await rm(staging, { force: true });
}
