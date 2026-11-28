const rankedQueues = new Set(["RANKED", "RANKED_TFT", "1100"]);
const ranks = /^(?:IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND|MASTER|GRANDMASTER|CHALLENGER)$/;
const queueKey = value => String(value ?? "").toUpperCase();

export function refreshCohort(current) {
  const season = /^s([1-9]\d*)-(pbe|live)$/.exec(current.seasonId ?? "");
  const { patch, bPatch = season?.[2] === "live" ? "" : undefined } = current.metaTftPatch ?? {};
  if (!season || !/^\d+\.\d+$/.test(patch ?? "") || !/^[a-z]?$/.test(bPatch ?? "#")) {
    throw new Error("current-patch.json 缺少有效赛季或 MetaTFT 补丁映射");
  }
  const [, number, channel] = season;
  const pbe = channel === "pbe";
  const queue = pbe ? "PBE" : "RANKED";
  const queueMatches = value => pbe ? queueKey(value) === queue : rankedQueues.has(queueKey(value));
  if (current.queue !== undefined && !queueMatches(current.queue)) throw new Error("current-patch.json 的赛季与队列不一致");
  const tiers = current.tierFilter === undefined ? [] : Array.isArray(current.tierFilter)
    ? current.tierFilter : String(current.tierFilter).split(",");
  const normalized = tiers.map(value => String(value).trim().toUpperCase());
  if (current.tierFilter !== undefined && (pbe || !normalized.length || normalized.some(rank => !ranks.test(rank)))) {
    throw new Error("tierFilter 须为正式服有效段位列表");
  }
  const rank = [...new Set(normalized)].sort().join(",");
  const set = "TFTSet" + number;
  const apiQueue = pbe ? "PBE" : "1100";
  return {
    pbe, set, queue, queueMatches, apiQueue, patch, bPatch, version: patch + bPatch,
    season: "S" + number, edition: current.seasonId + "-" + patch,
    label: pbe ? "PBE" : "Ranked", rank,
    filters: { queue: apiQueue, patch, b_patch: bPatch, ...(rank && { rank }) },
    lookupUrl: `https://data.metatft.com/lookups/${set}_${pbe ? "pbe" : "latest"}_en_us.json`,
    compsUrl: `https://www.metatft.com/${pbe ? "pbe-comps" : "comps"}`,
  };
}

export function verifyLookup(lookup, cohort) {
  const metadata = lookup._metadata;
  if (metadata?.set !== cohort.set || (cohort.pbe && metadata.patch !== "pbe") ||
      /^rls-(\d+\.\d+)\./.exec(metadata.release ?? "")?.[1] !== cohort.patch) {
    throw new Error("MetaTFT lookup does not match the active season and patch");
  }
}

export function verifyItemWindow(data, cohort, itemId) {
  const version = data.unit_games?.[0]?.patch;
  if (data.filter_adjustment || !cohort.queueMatches(data.queue_id) || data.tft_set !== cohort.set ||
      data.unit_games?.length !== 1 || !Array.isArray(version) || version.length !== 2 ||
      version[0] !== cohort.patch || version[1] !== cohort.bPatch ||
      !Number.isFinite(data.updated) || data.updated <= 0) {
    throw new Error("Unexpected MetaTFT cohort for " + itemId);
  }
}

export function archiveBatchId(cohort, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("无效的归档数据日");
  const season = cohort.season.toLowerCase();
  return cohort.pbe ? `pbe-${season}-${date}-${cohort.version}` : `ranked-${season}-${cohort.version}`;
}
