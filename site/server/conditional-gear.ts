import source from "@/data/conditional-gear-unit-ids.json";
import references from "@/data/item-reference.json";
import season from "@/data/season.json";
import { conditionalGearSource, maxLockedGearItems, remainingGearRows } from "@/domain/conditional-gear";

const upstream = "https://api-hc.metatft.com/tft-explorer-api/unit_builds/";
const explorer = "https://www.metatft.com/explorer";
const windowDays = 3;
const minGames = conditionalGearSource.minGames;
const limit = 600;
const maximumBytes = 512 * 1024;
const cacheMilliseconds = 5 * 60 * 1000;
const cacheEntries = 40;

export const conditionalGearAvailable = season.id.startsWith(`s19-pbe-${source.patch}.`);

const sourceUnits: Readonly<Record<string, string>> = source.units;
const referenceItems: Readonly<Record<string, { pbeId?: string }>> = references.items;
const gameItems = new Map<string, string>();
for (const item of season.items) {
  const sourceId = referenceItems[item.id]?.pbeId;
  // The extra items from Thief's Gloves are rolled, so its three slots
  // do not offer the player two further item decisions.
  if (sourceId && item.category === "completed" && item.id !== "TFT_Item_ThiefsGloves") {
    gameItems.set(sourceId, item.id);
  }
}
const sourceItems = new Map([...gameItems].map(([sourceId, itemId]) => [itemId, sourceId]));

type GearQuery = { unitApi: string; stars: "1" | "2" | "3"; lockedItems: string[] };
type GearBuild = { items: [string, string, string]; games: number; mean: number | null };
type Cohort = { builds: GearBuild[]; asOf: string };
const cache = new Map<string, Cohort & { expires: number }>();

export function readGearQuery(params: URLSearchParams): GearQuery | undefined {
  const lockedItems = params.getAll("item");
  if (params.getAll("unit").length !== 1 || params.getAll("stars").length !== 1 ||
      params.size !== 2 + lockedItems.length || lockedItems.length > maxLockedGearItems ||
      new Set(lockedItems).size !== lockedItems.length) return;
  const unit = params.get("unit") ?? "";
  const stars = params.get("stars");
  if (!Object.hasOwn(sourceUnits, unit) || lockedItems.some(id => !sourceItems.has(id))
      || (stars !== "1" && stars !== "2" && stars !== "3")) return;
  return { unitApi: sourceUnits[unit], stars, lockedItems };
}

async function readBuildPayload(response: Response): Promise<unknown> {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maximumBytes) {
    throw new Error("MetaTFT build response unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new Error("MetaTFT build response too large");
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

function buildRows(payload: unknown, unitApi: string): GearBuild[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length > limit) throw new Error("Invalid MetaTFT build table");
  const seen = new Set<string>();
  const builds: GearBuild[] = [];
  for (const row of data) {
    const key = row?.unit_builds;
    const counts = row?.placement_count;
    if (typeof key !== "string" || key.length > 420 || !Array.isArray(counts) || counts.length !== 8
        || counts.some(count => !Number.isSafeInteger(count) || count < 0 || count > 10_000_000)) {
      throw new Error("Invalid MetaTFT build row");
    }
    const [holder, gear, extra] = key.split("&");
    if (holder !== unitApi || gear === undefined || extra !== undefined) {
      throw new Error("Wrong MetaTFT item holder");
    }
    const ids = gear.split("|").map(id => gameItems.get(id));
    const [first, second, third] = ids.sort();
    if (ids.length !== 3 || !first || !second || !third) continue;
    const items: [string, string, string] = [first, second, third];
    const signature = items.join("|");
    if (seen.has(signature)) throw new Error("Duplicate MetaTFT build row");
    seen.add(signature);
    const games = counts.reduce((sum, count) => sum + count, 0);
    if (!games) continue;
    const mean = games >= minGames ? counts.reduce((sum, count, index) => sum + count * (index + 1), 0) / games : null;
    builds.push({ items, games, mean });
  }
  return builds.sort((a, b) => b.games - a.games);
}

async function loadCohort(unitApi: string, stars: GearQuery["stars"]): Promise<Cohort> {
  const key = `${unitApi}/${stars}`;
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expires > now) return existing;
  cache.delete(key);
  const filter = new URLSearchParams({
    queue: "PBE", patch: source.patch, days: String(windowDays), compact: "true", formatnoarray: "true",
    duplicate_unit_count: "0",
    unit_tier_numitems_unique: `${unitApi}-1_${stars}_3`,
    item_holder_unit: `${unitApi}-1`,
  });
  const response = await fetch(`${upstream}${encodeURIComponent(unitApi)}?${filter}`, {
    headers: { Accept: "application/json", Referer: "https://www.metatft.com/" },
    redirect: "manual",
    signal: AbortSignal.timeout(8_000),
  });
  const builds = buildRows(await readBuildPayload(response), unitApi);
  if (cache.size >= cacheEntries) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const asOf = new Date().toISOString();
  const entry = { builds, asOf, expires: Date.now() + cacheMilliseconds };
  cache.set(key, entry);
  return entry;
}

export async function conditionalGearBuilds({ unitApi, stars, lockedItems }: GearQuery) {
  const { builds, asOf } = await loadCohort(unitApi, stars);
  const rows = lockedItems.length
    ? remainingGearRows(builds, lockedItems)
    : builds.filter(build => build.games >= minGames).slice(0, 3);
  const sourceQuery = new URLSearchParams({
    tab: "builds", set: source.set, queue: "PBE", patch: source.patch, days: String(windowDays),
    unit: `${unitApi}-1_${stars}_3`, item_holder_unit: `${unitApi}-1`, duplicate_unit_count: "0",
  });
  return { rows, patch: `PBE ${source.patch}`, windowDays, minGames, asOf, sourceUrl: `${explorer}?${sourceQuery}`, limit };
}
