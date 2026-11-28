import { readFile, writeFile } from "node:fs/promises";
import { refreshCohort, verifyItemWindow, verifyLookup } from "./refresh-cohort.mjs";

const api = "https://api-hc.metatft.com/tft-stat-api/item_detail";
const days = 3;
const output = new URL("../data/hero-stats.json", import.meta.url);
const aliases = {
  "akali-kda": "DA_AkaliKDA19",
  "akali-true-damage": "DA_Akali_TrueDamage19",
  elise: "DA_Elise19",
  nidalee: "DA_Nidalee19",
  seraphine: "DA_Seraphine19_Indie",
  shyvana: "DA_Shyvana19",
};
const clean = name => name.normalize("NFKC").toLowerCase().replace(/[\s\p{P}]/gu, "");

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(18000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} · ${url}`);
  return response.json();
}

function histogramMap(result) {
  if (!result.units_overall?.length) throw new Error("Missing overall hero sample");
  const byUnit = new Map();
  for (const { unit, places } of result.units_overall) {
    if (byUnit.has(unit) || !Array.isArray(places) || places.length !== 8 ||
        !places.every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error(`Invalid placement histogram · ${unit}`);
    byUnit.set(unit, places);
  }
  return byUnit;
}

const current = await readFile(new URL("../data/current-patch.json", import.meta.url), "utf8").then(JSON.parse);
const cohort = refreshCohort(current);
const filters = { ...cohort.filters, days: String(days) };
const itemName = "TFT_Item_RapidFireCannon";
const query = new URLSearchParams({ ...filters, permit_filter_adjustment: "false", itemName });
const [season, lookup, result, saved] = await Promise.all([
  readFile(new URL("../data/season.json", import.meta.url), "utf8").then(JSON.parse),
  getJson(cohort.lookupUrl),
  getJson(`${api}?${query}`),
  readFile(output, "utf8").then(JSON.parse).catch(error => {
    if (error.code !== "ENOENT") throw error;
  }),
]);
verifyLookup(lookup, cohort);
if (!season.id.startsWith(cohort.edition + ".")) throw new Error("Season data does not match the active patch");
verifyItemWindow(result, cohort, itemName);
const overall = histogramMap(result);
const used = new Set();
const rows = {};
const sum = counts => counts.reduce((total, count) => total + count, 0);
const rounded = value => Number(value.toFixed(6));
for (const unit of season.units) {
  const candidates = lookup.units.filter(value => value.shopUnit && value.cost === unit.cost && clean(value.name) === clean(unit.nameEn));
  const sourceId = aliases[unit.id] ?? (candidates.length === 1 ? candidates[0].apiName : undefined);
  if (!sourceId || !lookup.units.some(row => row.shopUnit && row.cost === unit.cost && row.apiName === sourceId) || used.has(sourceId))
    throw new Error(`Unverified source form · ${unit.id}`);
  used.add(sourceId);
  const places = overall.get(sourceId);
  if (!places) continue;
  const games = sum(places);
  if (games) rows[unit.id] = {
    games,
    mean: rounded(places.reduce((total, count, index) => total + count * (index + 1), 0) / games),
    top4Rate: rounded(sum(places.slice(0, 4)) / games),
    winRate: rounded(places[0] / games),
  };
}
if (!Object.keys(rows).length) throw new Error("No matching hero samples");

const updated = new Date(result.updated);
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(updated);
const snapshot = {
  source: "MetaTFT", sourceUrl: `https://www.metatft.com/units?${new URLSearchParams({ set: cohort.set, ...filters })}`,
  version: `${cohort.season} ${cohort.label} ${cohort.version}`,
  days, minGames: 100, date, updatedAt: updated.toISOString(), rows,
};
if (saved?.sampleStatus !== "pending" && saved?.source === snapshot.source && saved.version === snapshot.version && saved.days === snapshot.days &&
    new URL(saved.sourceUrl).searchParams.get("rank") === (cohort.rank || null)) {
  if (saved.updatedAt > snapshot.updatedAt) throw new Error("The published source returned an older hero snapshot");
  if (saved.date < date) {
    snapshot.previous = {
      date: saved.date,
      rows: Object.fromEntries(Object.entries(saved.rows)
        .filter(([, row]) => row.games >= snapshot.minGames)
        .map(([id, { mean, games }]) => [id, { mean, games }])),
    };
  } else if (saved.previous) {
    snapshot.previous = saved.previous;
  }
}
await writeFile(output, JSON.stringify(snapshot) + "\n", "utf8");
console.log(snapshot.version, snapshot.date, `${Object.keys(rows).length}/${season.units.length} forms with samples`);
