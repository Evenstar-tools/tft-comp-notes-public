import { readFile, writeFile } from "node:fs/promises";
import { fetchItemCohort } from "./special-item-cohort.mjs";
import { refreshCohort, verifyLookup } from "./refresh-cohort.mjs";

const json = async (file) => JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));
const api = "https://api-hc.metatft.com/tft-stat-api/item_detail";
const recordsFor = async (url) => {
  const result = await fetch(url, { signal: AbortSignal.timeout(16000), headers: { Accept: "application/json" } });
  if (!result.ok) throw new Error("HTTP " + result.status + " · " + url);
  return result.json();
};

const sourceIds = {
  "beach-pop": "DA_Oceansong19_Emblem",
  classical: "DA_Virtuosos19_Emblem",
  heartsteel: "DA_Heartsteel19_Emblem",
  hyperpop: "DA_GlitterBomb19_Emblem",
  illbeats: "DA_IllBeats19_Emblem",
  "ionic-spark": "DA_IonicSpark19_Emblem",
  jazz: "DA_Jazz19_Emblem",
  "k-da": "DA_KDA19_Emblem",
  pentakill: "DA_Pentakill19_Emblem",
  rock: "DA_DemonVision19_Emblem",
  "true-damage": "DA_TrueDamage19_Emblem",
  arcanist: "DA_Arcanist19_Emblem",
  bodyguard: "DA_Bodyguard19_Emblem",
  choreographer: "DA_Choreographer19_Emblem",
  frontman: "DA_Frontman19_Emblem",
  hitmaker: "DA_Hitmaker19_Emblem",
  juggernaut: "DA_Juggernaut19_Emblem",
  manager: "DA_Manager19_Emblem",
  prodigy: "TFT_Emblem_CHANGEME",
  renegade: "DA_Renegade19_Emblem",
  slayer: "DA_Mosher19_Emblem",
  swiftstriker: "DA_Swiftstriker19_Emblem",
};
const unitOverrides = {
  elise: "DA_Elise19",
  seraphine: "DA_Seraphine19_Indie",
  shyvana: "DA_Shyvana19",
  nidalee: "DA_Nidalee19",
  "akali-kda": "DA_AkaliKDA19",
  "akali-true-damage": "DA_Akali_TrueDamage19",
};
const minGames = 100;
const days = 3;
const clean = (name) => name.normalize("NFKC").toLowerCase().replace(/[\s\p{P}]/gu, "");
const rounded = (value) => Number(value.toFixed(6));

function statistics(places) {
  if (!Array.isArray(places) || places.length !== 8 || !places.every(n => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Invalid placement counts");
  const games = places.reduce((sum,count) => sum + count, 0);
  return games ? {
    games, mean: rounded(places.reduce((sum,count,i) => sum + count * (i + 1), 0) / games),
    winRate: rounded(places[0] / games),
  } : { games, mean: null, winRate: null };
}

const cohort = refreshCohort(await json("../data/current-patch.json"));
const [season, references, lookup] = await Promise.all([
  json("../data/season.json"), json("../data/trait-reference.json"), recordsFor(cohort.lookupUrl),
]);
verifyLookup(lookup, cohort);
if (!season.id.startsWith(cohort.edition + ".")) throw new Error("Season data does not match the active patch");
const catalog = Object.entries(references).filter(([,entry]) => entry.emblem);
const emblemIds = new Set(lookup.items.filter(item => item.associatedTraits?.length && item.name.endsWith(" Emblem")).map(item => item.apiName));
if (catalog.length !== emblemIds.size || catalog.some(([id]) => !emblemIds.has(sourceIds[id])) ||
    new Set(Object.values(sourceIds)).size !== emblemIds.size)
  throw new Error("Current emblem catalogue differs from the mapped source IDs");

const unitIds = new Map(season.units.map(unit => {
  const matches = lookup.units.filter(value => value.shopUnit && value.cost === unit.cost && clean(value.name) === clean(unit.nameEn));
  const sourceId = unitOverrides[unit.id] ?? (matches.length === 1 ? matches[0].apiName : "");
  if (!sourceId) throw new Error("Unmapped unit " + unit.id);
  return [sourceId, unit.id];
}));
if (unitIds.size !== season.units.length) throw new Error("Source unit has duplicate mappings");

async function collect(traitId) {
  const sourceId = sourceIds[traitId];
  const params = new URLSearchParams({
    ...cohort.filters, days: String(days), permit_filter_adjustment: "false", itemName: sourceId,
  });
  const { data: result, stats } = await fetchItemCohort(api + "?" + params, sourceId, cohort, days);
  if (!Array.isArray(result.units_overall)) throw new Error("Missing wearer baseline for " + traitId);
  const overall = new Map(result.units_overall.map(row => [row.unit, statistics(row.places)]));
  const holders = [];
  for (const row of result.units) {
    const stats = statistics(row.places);
    if (!stats.games) continue;
    const unitId = unitIds.get(row.unit);
    if (!unitId && stats.games >= minGames) throw new Error("Unmapped wearer " + row.unit + " · " + sourceId);
    if (!unitId) continue;
    const baseline = overall.get(row.unit);
    const delta = baseline && baseline.games >= stats.games && baseline.mean !== null
      ? rounded(stats.mean - baseline.mean) : null;
    holders.push({ unitId, ...stats, delta });
  }
  holders.sort((a,b) => a.mean - b.mean || b.winRate - a.winRate || b.games - a.games);
  console.log(traitId,stats.games,stats.mean,stats.winRate,holders[0]?.unitId);
  return [traitId, { sourceId, games: stats.games, mean: stats.mean ?? null, winRate: stats.winRate ?? null, holders }, result.updated];
}

const captured = [];
for (let start = 0; start < catalog.length; start += 4) {
  const batch = await Promise.allSettled(catalog.slice(start,start + 4).map(([id]) => collect(id)));
  for (const row of batch) {
    if (row.status === "rejected") throw row.reason;
    captured.push(row.value);
  }
}
if (captured.some(([, , timestamp]) => !Number.isFinite(timestamp) || timestamp <= 0))
  throw new Error("Invalid source refresh time");
const snapshot = {
  source: "MetaTFT", set: cohort.season, mode: cohort.queue, patch: cohort.version, days, minGames,
  updatedAt: new Date(Math.min(...captured.map(([, ,timestamp]) => timestamp))).toISOString(),
  emblems: Object.fromEntries(captured.map(([id,data]) => [id,data])),
};
await writeFile(new URL("../data/emblem-stats.json", import.meta.url), JSON.stringify(snapshot) + "\n", "utf8");

