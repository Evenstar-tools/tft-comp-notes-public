import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { changeSignals, makeReviewQueue, sourceProfile } from "./family-review.mjs";
import { crossCheck } from "./family-evidence.mjs";

// The public filters identify the hotfix. The stats response by itself only says "current".
const root = fileURLToPath(new URL("../", import.meta.url));
const sourceUrl = "https://www.metatft.com/pbe-comps";
const args = process.argv.slice(2);
const arg = (key) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const out = resolve(arg("--output") || resolve(root, "data/guide-family-stats.json"));
const reviewPath = resolve(arg("--review") || resolve(root, "outputs/family-review/review.json"));
const historyPath = resolve(arg("--history") || resolve(dirname(reviewPath), "family-history.json"));
const catalogUrl = "https://tft.example.com/api/guides/catalog";
const previousReviewPath = arg("--previous-review");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const temp = file + "." + process.pid + ".tmp";
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(temp, file);
}

async function capture() {
  const channel = arg("--browser") || (process.platform === "win32" ? "msedge" : "chromium");
  const browser = await chromium.launch({ channel });
  try {
    const page = await browser.newPage({ locale: "en-US" });
    const response = (path, filters) => page.waitForResponse((res) => {
      const url = new URL(res.url());
      return res.ok() && url.hostname === "api-hc.metatft.com" && url.pathname === "/tft-comps-api/" + path &&
        Object.entries(filters).every(([k, v]) => url.searchParams.get(k) === v);
    }, { timeout: 45000 });
    const [statsRes, modelRes] = await Promise.all([
      response("comps_stats", { queue:"PBE", patch:"current", days:"3" }),
      response("comps_data", { queue:"PBE" }),
      page.goto(sourceUrl, {waitUntil:"domcontentloaded", timeout:45000}),
    ]);
    const filter = page.locator(".FilterElement");
    await filter.filter({hasText:/^Last 3 Days$/}).first().waitFor({ timeout:30000 });
    const versionLabel = /^\d+\.\d+(?:[a-z]|\s+[A-Za-z]{3}-\d{1,2})?$/i;
    await filter.filter({hasText:versionLabel}).first().waitFor({ timeout:30000 });
    const labels = (await filter.allInnerTexts()).map(t => t.trim());
    const patch = labels.find(l => versionLabel.test(l));
    if (!patch || !labels.includes("PBE")) throw Error("未能从 PBE 榜核实补丁与队列：" + labels.join(" / "));
    return { patch, stats:await statsRes.json(), model:await modelRes.json(), statsUrl:statsRes.url() };
  } finally {
    await browser.close();
  }
}

function histogram(row) {
  if (!Array.isArray(row.places) || row.places.length !== 9) throw Error("名次桶应有八个名次及合计：" + row.cluster);
  const places = row.places.slice(0, 8);
  const games = places.reduce((a,b)=>a+b,0);
  if (places.some(n => !Number.isSafeInteger(n) || n < 0) || games !== row.count || games !== row.places[8]) {
    throw Error("名次桶与样本合计不符：" + row.cluster);
  }
  return { places, games, mean:games ? places.reduce((a,n,i)=>a+n*(i+1),0)/games : null,
    winRate:games ? places[0]/games : null, topFourRate:games ? places.slice(0,4).reduce((a,b)=>a+b,0)/games : null };
}

const bindings = await readJson(resolve(root,"data/guide-family-map.json"));
const season = await readJson(resolve(root,"data/season.json"));
const currentPatch = await readJson(resolve(root, "data/current-patch.json"));
const published = await readJson(resolve(root, "data/guide-family-stats.json"));
const prior = await readJson(out).catch(e=>{if(e.code==="ENOENT") return null; throw e});
const { patch, stats, model, statsUrl } = await capture();
if (stats.tft_set !== bindings.set || model.tft_set !== bindings.set ||
    [stats.queue_id,model.queue_id].some(q=>q?.toUpperCase()!==bindings.queue) ||
    stats.cluster_id !== model.cluster_id || model.results.data.cluster_id !== model.cluster_id ||
    !season.id.startsWith("s19-pbe-"+patch.match(/^\d+\.\d+/)[0]+".")) {
  throw Error("队列、赛季、补丁或模型不一致，保留原批次。");
}
const groups = model.results.data.cluster_details;
const history = await readJson(historyPath).catch(e=>{if(e.code==="ENOENT") return {}; throw e});
const catalog = arg("--catalog") ? await readJson(arg("--catalog")) : await fetchJson(catalogUrl);
if (catalog.seasonId !== season.id || !catalog.boards?.length) throw Error("缺少当前赛季公开攻略目录，保留上一批。");
const publicBoards = catalog.boards.filter(b => b.edition === season.id);
const publicBoardById = new Map(publicBoards.map(board => [board.teamId, board]));
if (!publicBoards.length) throw Error("当前攻略目录与站点版本不一致。");
async function fetchJson(url) {
  const res = await fetch(url, {signal:AbortSignal.timeout(30000)});
  if (!res.ok) throw Error(url+" "+res.status);
  return res.json();
}
const lookup = await fetchJson("https://data.metatft.com/lookups/"+bindings.set+"_pbe_en_us.json");
const localUnits = new Map(season.units.map(u=>[u.nameEn.toLowerCase().trim(),u.id]));
const forms = {DA_Nunu19:"nunu-willump",DA_AkaliKDA19:"akali-kda",DA_Akali_TrueDamage19:"akali-true-damage"};
const unitIds = new Map(lookup.units.filter(u=>u.apiName && (u.name || forms[u.apiName])).map(u=>[u.apiName,forms[u.apiName] ?? localUnits.get(u.name.toLowerCase().trim())]));
const evidence = arg("--evidence") ? await readJson(arg("--evidence")) : [];
const distributions = new Map();
const reviewed = new Set();
const matchedBoardIds = new Set();
const rows = [];
const review = [];
const smallSamples = [];
for (const row of stats.results.filter(r=>r.cluster!=="")) {
  const id=String(row.cluster);
  if(distributions.has(id)) throw Error("重复组号：" + id);
  distributions.set(id,histogram(row));
}
const total = stats.results.find(r=>r.cluster==="")?.places[0];
if (!total || [...distributions.values()].reduce((n,r)=>n+r.games,0)!==total) throw Error("分组样本量与榜单不符。");
const updatedAt = new Date(stats.updated).toISOString();
if(prior && Date.parse(updatedAt)<Date.parse(prior.updatedAt)) throw Error("来源批次早于当前快照。");
const modelChanged = bindings.model !== model.cluster_id;
const comparable = prior && prior.set===bindings.set && prior.queue===bindings.queue &&
  prior.patch===patch && prior.days===3 && prior.model===model.cluster_id;
for (const b of bindings.rows) {
  if (prior && !prior.rows.some(r=>r.clusterId===b.clusterId) && !(prior.smallSamples ?? []).some(r=>r.clusterId===b.clusterId)) review.push({id:b.clusterId,guide:b.name,reason:"新收录体系"});
  if (reviewed.has(b.clusterId)) throw Error("映射表重复纳入分组：" + b.clusterId);
  reviewed.add(b.clusterId);
  const group = groups[b.clusterId];
  const metric = distributions.get(b.clusterId);
  const roster = group?.units_string.split(",").map(v=>v.trim()).sort() || [];
  if (modelChanged || !group || !metric || JSON.stringify(roster)!==JSON.stringify([...b.representativeUnits].sort())) {
    review.push({id:b.clusterId,guide:b.name,reason:modelChanged?"模型更新，请重新配对":!group||!metric?"本批没有原分组":"代表棋盘有变",roster});
    continue;
  }
  if (metric.games < 100) {
    const {representativeUnits, ...info} = b;
    smallSamples.push({...info,...metric});
    review.push({id:b.clusterId,guide:b.name,reason:"不足 100 场，留在攻略检索",games:metric.games});
    continue;
  }
  const { representativeUnits, ...info } = b;
  const anchor = publicBoardById.get(info.teamId);
  if (!anchor || anchor.sectionId !== info.sectionId || anchor.special) {
    review.push({id:b.clusterId,guide:b.name,reason:"主盘已变或应独立检索"});
    continue;
  }
  const ids = [...new Set([info.landingTeamId, ...(info.sharedTeamIds ?? [])].filter(Boolean))];
  const compatible = ids.filter(id => {
    const board = publicBoardById.get(id);
    const carries = board?.roles.filter(role => role.label === "主C" || role.label === "主输出").flatMap(role => role.units) ?? [];
    return board?.sectionId === info.sectionId && !board.special && !board.emblems?.length && board.kind !== "过渡"
      && carries.some(id => info.carryIds.includes(id))
      && (!anchor.rollLevel || !board.rollLevel || anchor.rollLevel === board.rollLevel);
  });
  if (info.sharedTeamIds) info.sharedTeamIds = info.sharedTeamIds.filter(id => compatible.includes(id));
  if (info.landingTeamId && !compatible.includes(info.landingTeamId)) delete info.landingTeamId;
  if (compatible.length !== ids.length) review.push({id:b.clusterId,guide:b.name,reason:"变阵主 C、搜牌条件或目录已变",teamIds:ids.filter(id => !compatible.includes(id))});
  const teamIds = [...new Set([info.teamId, ...compatible])];
  if (teamIds.some(id => matchedBoardIds.has(id))) throw Error("同一棋盘绑定多个体系：" + teamIds.join(", "));
  for (const id of teamIds) matchedBoardIds.add(id);
  rows.push({...info,...metric});
  const prev=comparable && prior.rows.find(r=>r.clusterId===b.clusterId);
  if(prev && prev.games && prior.totalFinishes) {
    const change=metric.mean-prev.mean;
    const pickDelta=8*(metric.games/total-prev.games/prior.totalFinishes);
    if (Math.abs(change)>=0.25 || Math.abs(pickDelta)>=0.10) {
      review.push({id:b.clusterId,guide:b.name,reason:"同口径异动，复核公告与对局",before:{mean:prev.mean,games:prev.games},
        after:{mean:metric.mean,games:metric.games},meanChange:change,playersPerLobbyChange:pickDelta});
    }
  }
}
for (const [id,metric] of distributions) {
  if (id==="-1" || (!modelChanged && reviewed.has(id))) continue;
  const group=groups[id];
  review.push({id,reason:"尚未关联攻略",sourceKey:group?.name_string,roster:group?.units_string,...metric});
}
const allGroups = [...distributions].filter(([id])=>id!=="-1").map(([id,m])=>({
  id, sourceKey:groups[id]?.name_string, roster:groups[id]?.units_string, games:m.games, mean:m.mean,
  tempo:groups[id]?.levelling, equipmentRoles:[...new Set(sourceProfile(groups[id],unitIds).builds.map(b=>b.apiId+"/"+b.role))].sort(),
  playersPerLobby:8*m.games/total, winRate:m.winRate, topFourRate:m.topFourRate,
}));
const observation = {set:bindings.set,queue:bindings.queue,patch,days:3,updatedAt,model:model.cluster_id,allGroups};
if (history.latest && Date.parse(updatedAt) < Date.parse(history.latest.updatedAt)) throw Error("批次早于巡检记录。");
const sameBatch = history.latest?.updatedAt === updatedAt && history.latest?.patch === patch && history.latest?.model === model.cluster_id;
const previous = previousReviewPath ? await readJson(previousReviewPath) : sameBatch ? history.previous : history.latest;
const delta = changeSignals(previous,observation);
for (const entry of evidence) if (entry.set === observation.set && entry.queue === observation.queue && entry.patch === patch && entry.model === model.cluster_id && distributions.has(String(entry.id)) && !review.some(r=>r.id===String(entry.id))) review.push({id:String(entry.id),reason:"本轮人工核对"});
const queue = makeReviewQueue(observation,publicBoards,groups,unitIds,bindings.rows,delta.signals,review);
for (const entry of queue.normal) entry.verification = crossCheck(evidence,entry,observation);
await writeJson(reviewPath,{...observation,...delta,review,queue,catalogPublishedAt:catalog.publishedAt,
  catalogBoards:publicBoards.length,sourceUrl,statsUrl});
await writeJson(historyPath,{latest:observation,previous:previous ?? null});
if (modelChanged || !rows.length) throw Error("没有可沿用的体系映射。请查复核清单并校对新模型后重跑。");
rows.sort((a,b)=>a.mean-b.mean || b.games-a.games || a.clusterId.localeCompare(b.clusterId));
const patchStart = Date.parse(currentPatch.effectiveAt);
const inGrace = Date.parse(updatedAt) >= patchStart && Date.parse(updatedAt) < patchStart + 12 * 60 * 60 * 1000;
const previousBatch = inGrace && [published, published.previous].find(batch =>
  batch?.seasonId === season.id && batch.queue === bindings.queue && Date.parse(batch.updatedAt) < patchStart);
const { previous: _older, ...previousSnapshot } = previousBatch || {};
await writeJson(out,{seasonId:season.id,set:bindings.set,queue:bindings.queue,patch,days:3,updatedAt,model:model.cluster_id,
  source:"MetaTFT",sourceUrl,statsUrl,totalFinishes:total,rows,smallSamples,previous:previousBatch ? previousSnapshot : undefined});
console.log(`${patch}，${updatedAt}，${rows.length} 个体系已对应攻略，${total} 次选手结算。复核清单 ${review.length} 项。`);
