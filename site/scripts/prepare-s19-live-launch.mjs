import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { editionScope } from "../domain/version-updates.ts";

const dataRoot = new URL("../data/", import.meta.url);
const openingGroups = new Set(["reroll", "fast8", "fast9", "heroAugment"]);
const officialSource = /^(?:[^.]+\.)*(?:leagueoflegends\.com|riotgames\.com)$|^lol\.qq\.com$/;
const siteExplorer = "https://www.metatft.com/explorer";
const boardId = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const cardOrGroup = new RegExp(
  '<section class="home-patch-group" aria-labelledby="home-patch-([a-zA-Z0-9]+)">|' +
    '<article id="guide-card-patch-([a-zA-Z0-9_-]+)-(' + boardId + ')" class="home-patch-card">',
  "g",
);

export function readOpeningRecommendations(html) {
  let group;
  const cards = [];
  for (const [, heading, sectionId, teamId] of html.matchAll(cardOrGroup)) {
    if (heading) {
      if (!openingGroups.has(heading)) throw new Error("本版推荐含无法识别的分组");
      group = heading;
    } else {
      if (!group) throw new Error("本版推荐缺少分组");
      cards.push({ sectionId, teamId, group });
    }
  }
  if (!cards.length || cards.length > 12 || new Set(cards.map(card => card.teamId)).size !== cards.length ||
      cards.filter(card => card.group === "heroAugment").length > 2 ||
      [...openingGroups].some(group => cards.filter(card => card.group === group).length > 8)) {
    throw new Error("无法从正式站读取完整的本版推荐名单");
  }
  return cards;
}

function checkLaunchInputs(previous, patch, season, now) {
  if (previous.seasonId !== "s19-pbe" || patch.seasonId !== "s19-live" ||
      !(patch.queue === undefined || ["1100", "RANKED", "RANKED_TFT"].includes(String(patch.queue).toUpperCase())) ||
      patch.metaTftPatch?.patch !== "19.1" || (patch.metaTftPatch.bPatch ?? "") !== "" ||
      !/^[1-9]\d*$/.test(patch.build) || patch.build === previous.build ||
      !/^\d{4}-\d{2}-\d{2}T/.test(patch.effectiveAt) ||
      !(Date.parse(patch.effectiveAt) > Date.parse(previous.effectiveAt)) || !(Date.parse(patch.effectiveAt) <= now) ||
      !/^[a-z0-9-]+$/.test(patch.updateId ?? "")) throw new Error("请提供已经生效的 S19 正式服首版构建和实装时间");
  const source = new URL(patch.sourceUrl);
  if (source.protocol !== "https:" || !officialSource.test(source.hostname))
    throw new Error("sourceUrl 须指向本次实装的 Riot 或国服公告");
  if (!new RegExp("^s19-live-19\\.1\\.\\d+\\." + patch.build + "$").test(season.id) ||
      ![season.units, season.traits, season.items].every(rows => Array.isArray(rows) && rows.length)) {
    throw new Error("请提供与实装构建匹配且已复核的正式服赛季资料");
  }
}

function launchPlacement(previous, build) {
  function rankedQuery(source) {
    const url = new URL(source);
    if (url.origin + url.pathname !== siteExplorer ||
        url.searchParams.get("set") !== "TFTSet19" ||
        !["comps", "units"].includes(url.searchParams.get("tab"))) {
      throw new Error("终盘采集定义不是 S19 MetaTFT Explorer 查询");
    }
    for (const [key, value] of [["queue", "1100"], ["patch", "19.1"], ["b_patch", ""], ["days", "3"]]) {
      url.searchParams.set(key, value);
    }
    url.searchParams.delete("rank");
    return url.href;
  }

  const records = previous.records.filter(record => !record.sourcePeriod && !record.boardObservation &&
    !record.referencesAugment && !record.conditions?.augmentId && !record.windowHours).map(record => {
    const { conditions, roster, population, sampleScope, sampleNote } = record;
    return { conditions, roster, population, sampleScope, sampleNote, games: 0, url: rankedQuery(record.url) };
  });
  return {
    sampleStatus: "pending", edition: "s19-live-19.1", queue: "RANKED", patch: "Ranked 19.1", build,
    window: "近三天", minGames: previous.minGames, greenThrough: previous.greenThrough, redFrom: previous.redFrom,
    records, renataNasusReference: { url: rankedQuery(previous.renataNasusReference.url) },
    boardComparisons: [], formationComparisons: [],
  };
}

function launchPublication(previous, season, itemIds) {
  const units = new Set(season.units.map(unit => unit.id));
  const sections = previous.sections.map(section => {
    if (section.gameData && editionScope(section.gameData.id) !== "s19-pbe") return section;
    const boards = section.teams ?? (section.team ? [section.team] : []);
    for (const board of boards) {
      for (const piece of board.pieces.flatMap(piece => piece.alternate ? [piece, piece.alternate] : [piece])) {
        if (!units.has(piece.unitId) || piece.items.some(id => !itemIds.has(id)))
          throw new Error(`棋盘 ${section.id}/${board.id} 使用了正式服资料中不存在的棋子或装备`);
      }
    }
    const next = { ...section };
    delete next.gameData;
    return next;
  });
  return { ...previous, season, sections };
}

export function buildS19LaunchChanges(previous, inputs, now = Date.now()) {
  const { patch, season, homeHtml, itemIds } = inputs;
  checkLaunchInputs(previous.patch, patch, season, now);
  const publication = launchPublication(previous.publication, season, itemIds);
  const sections = new Map(publication.sections.map(section => [section.id, section]));
  const decisions = new Map(previous.recommendations.entries.map(entry => [entry.teamId, entry]));
  const entries = readOpeningRecommendations(homeHtml).map(card => {
    const section = sections.get(card.sectionId);
    const board = new Set(section?.teams?.map(team => team.id) ?? (section?.team ? [section.team.id] : []));
    if (!section || !board.has(card.teamId)) throw new Error(`先把推荐棋盘 ${card.sectionId}/${card.teamId} 同步到仓库`);
    const old = decisions.get(card.teamId);
    const summary = section.blocks.find(block => block.id === section.summaryBlockId)?.text;
    const note = [old?.note, summary].find(value => value?.trim() && !/PBE|均名|平均名次|实测|下调|上调|热补|\d[\d,]*\s*场/i.test(value));
    return { ...card, status: old?.status === "conditional" ? "conditional" : "recommended",
      override: "include", launchEntry: true, note: note || "开局与过渡见攻略" };
  });
  const { build, effectiveAt } = patch;
  const current = { ...patch, label: "19.1", metaTftPatch: { patch: "19.1", bPatch: "" }, launchTransition: true };
  const pending = { sampleStatus: "pending", seasonId: season.id, set: "TFTSet19", queue: "RANKED", patch: "19.1", build };
  const wearers = { ...pending, source: "MetaTFT", version: "S19 Ranked 19.1", window: "最近 3 天", minGames: 100, items: {} };
  return {
    "season.json": season,
    "public-preview.json": publication,
    "current-patch.json": current,
    "patch-recommendations.json": { seasonId: current.seasonId, build, reviewedAt: effectiveAt, entries },
    "patch-recommendation-stats.json": { ...pending, hours: 2, rows: [] },
    "guide-family-map.json": { ...pending, model: null, rows: [] },
    "guide-family-stats.json": { ...pending, days: 3, source: "MetaTFT", sourceUrl: "https://www.metatft.com/comps",
      model: null, totalFinishes: 0, rows: [], smallSamples: [] },
    "guide-placement.json": launchPlacement(previous.placement, build),
    "guide-carry-stats.json": { ...pending, window: "近三天", days: 3, minGames: 100, rows: [] },
    "hero-stats.json": { ...pending, source: "MetaTFT", version: "S19 Ranked 19.1", days: 3, minGames: 100, rows: {} },
    "item-wearers.json": wearers,
    "special-item-wearers.json": wearers,
    "emblem-stats.json": { ...pending, set: "S19", mode: "RANKED", source: "MetaTFT", days: 3, minGames: 100, emblems: {} },
    "trait-stats.json": { ...pending, season: 19, sourcePatch: "19.1", days: 3, sources: {}, scopes: {}, rows: {} },
    "comp-trends.json": { ...pending, version: 1, scope: "international", source: "MetaTFT",
      sourceUrl: "https://www.metatft.com/comps", batches: [], series: [], discoveries: [], families: [] },
  };
}

async function main() {
  const { values } = parseArgs({ options: { patch: { type: "string" }, season: { type: "string" },
    "home-html": { type: "string" }, apply: { type: "boolean" } } });
  if (!values.patch || !values.season) throw new Error("用法：node scripts/prepare-s19-live-launch.mjs --patch <已实装配置.json> --season <正式服赛季资料.json> [--apply]");
  const read = async (name, root = dataRoot) => JSON.parse((await readFile(root ? new URL(name, root) : name, "utf8")).replace(/^\uFEFF/, ""));
  const readHome = async () => {
    if (values["home-html"]) return readFile(values["home-html"], "utf8");
    const response = await fetch("https://tftnotes.com/?rum_ignore=1", { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!response.ok) throw new Error(`正式站首页返回 HTTP ${response.status}`);
    return response.text();
  };
  const [patch, season, homeHtml, publication, current, recommendations, placement, special, traits] = await Promise.all([
    read(values.patch, null), read(values.season, null), readHome(), read("public-preview.json"), read("current-patch.json"),
    read("patch-recommendations.json"), read("guide-placement.json"), read("special-equipment.json"), read("trait-reference.json"),
  ]);
  const itemIds = new Set([...season.items, ...special.items].map(item => item.id));
  for (const [id, trait] of Object.entries(traits)) if (trait.emblem) itemIds.add("emblem-" + id);
  const changes = buildS19LaunchChanges({ patch: current, publication, recommendations, placement },
    { patch, season, homeHtml, itemIds });
  if (values.apply) {
    const files = Object.keys(changes).map(name => ({ name, url: new URL(name, dataRoot) }));
    const originals = await Promise.all(files.map(({ url }) => readFile(url)));
    let index = 0;
    try {
      for (const { name, url } of files) {
        index++;
        await writeFile(url, JSON.stringify(changes[name], null, 2) + "\n", "utf8");
      }
    } catch (error) {
      await Promise.all(files.slice(0, index).map(({ url }, position) => writeFile(url, originals[position])));
      throw error;
    }
  }
  console.log(JSON.stringify({ applied: Boolean(values.apply), build: patch.build,
    recommendations: changes["patch-recommendations.json"].entries.map(({ sectionId, teamId, group }) => ({ sectionId, teamId, group })) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
