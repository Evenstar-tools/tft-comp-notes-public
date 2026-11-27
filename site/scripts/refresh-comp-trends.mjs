import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { heroAugmentSourceUnits } from "./family-review.mjs";

const root = new URL("../", import.meta.url);
const defaultFile = fileURLToPath(new URL("data/comp-trends.json", root));
const defaultSnapshot = fileURLToPath(new URL("data/guide-family-stats.json", root));
const minGames = 100;
const rate = value => Number.isFinite(value) && value >= 0 && value <= 1;
const https = value => typeof value === "string" && URL.canParse(value) && new URL(value).protocol === "https:";
const edition = value => typeof value === "string" ? value.match(/^(s\d+-(?:pbe|live))(?:-|$)/i)?.[1].toLowerCase() : undefined;

function iso(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function metrics(row) {
  if (!Number.isSafeInteger(row.games) || row.games < minGames ||
      !Number.isFinite(row.mean) || row.mean < 1 || row.mean > 8 ||
      !rate(row.topFourRate) || !rate(row.winRate) || row.winRate > row.topFourRate) return;
  return { mean: row.mean, topFourRate: row.topFourRate, winRate: row.winRate, games: row.games };
}

function reviewDiscoveries(review, batch, batchId, unitNames, archiveSnapshot) {
  const sourceQueue = review?.matchQueue ?? (typeof review?.queue === "string" ? review.queue :
    https(review?.statsUrl) ? new URL(review.statsUrl).searchParams.get("queue") : undefined);
  if (!review || sourceQueue?.toUpperCase() !== batch.queue.toUpperCase() ||
      review.model !== batch.model || review.set !== batch.set || review.patch !== batch.patch ||
      review.days !== batch.days || iso(review.updatedAt) !== iso(batch.updatedAt)) return [];
  const groups = new Map((review.allGroups ?? []).map(group => [String(group.id), group]));
  const signals = new Map((review.signals ?? []).map(signal => [String(signal.id), signal]));
  const bound = new Map(batch.rows.map(row => [String(row.clusterId), row]));
  const archived = new Map((archiveSnapshot?.rows ?? []).map(row => [String(row.clusterId), row]));
  return (review.queue?.normal ?? []).flatMap(entry => {
    const clusterId = String(entry.id);
    const group = groups.get(clusterId);
    const point = group && metrics(group);
    if (!point) return [];
    const signal = review.comparison === "同补丁同模型" && iso(review.comparedTo) ? signals.get(clusterId) : undefined;
    const changed = (signal?.before && signal.after ? signal.reasons ?? [] : [])
      .filter(reason => ["代表棋盘有变", "搜牌节奏有变", "代表配装分工有变"].includes(reason));
    const newGroup = !signal?.before && signal?.after && signal.reasons?.includes("新增分组");
    const unbound = !entry.binding && point.mean <= 4.5;
    if (!unbound && !newGroup && !changed.length) return [];
    const sourceCarries = [...new Set((entry.source?.builds ?? []).filter(build => build.role === "输出" && build.unitId)
      .map(build => build.unitId))];
    const known = bound.get(clusterId);
    const archivedName = archived.get(clusterId)?.name;
    const carryIds = sourceCarries.length ? sourceCarries : known?.carryIds ?? [];
    if (!carryIds.length && !entry.binding) return [];
    const names = carryIds.map(id => unitNames?.get(id) ?? id).join("、");
    const name = known?.name ?? entry.binding?.guide ?? archivedName ?? names;
    const reason = newGroup ? "同模型新增分组，打法待核" : changed.length ? changed.join("、") :
      archivedName ? "历史攻略关联待复核" : "尚未关联攻略，" + (entry.proposal ?? "待核对阵容");
    const verified = entry.verification?.secondSourceChecked && entry.verification?.secondBuildChecked;
    const kind = newGroup || unbound && !changed.length && !archivedName ? "new" : "change";
    const sectionId = known?.sectionId;
    const teamId = known?.teamId;
    return [{ id: batchId + ":" + clusterId, batchId, clusterId, kind, name, carryIds, ...point, reason,
      status: newGroup || unbound ? "待交叉核对" : verified ? "已交叉核对" : "待复核", sectionId, teamId }];
  });
}

export function appendCompTrendBatch(history, input, { review, patch, unitNames, archiveSnapshot } = {}) {
  const capturedAt = iso(input.updatedAt);
  const ranked = input.rankedScope === "international" && ["1100", "RANKED", "RANKED_TFT"].includes(input.queue);
  const scope = input.queue === "PBE" && edition(input.seasonId)?.endsWith("-pbe") ? "PBE" :
    ranked && edition(input.seasonId)?.endsWith("-live") ? "international" : undefined;
  if (!capturedAt || !scope || !edition(input.seasonId) || !input.set || !input.source ||
      !https(input.sourceUrl) || !Number.isSafeInteger(input.model) || !input.patch ||
      !Number.isSafeInteger(input.days) || input.days < 1 || !Array.isArray(input.rows)) {
    throw Error("趋势输入缺少已核验的赛季、来源、窗口或体系记录。");
  }
  if (history && (history.version !== 1 || edition(history.seasonId) !== edition(input.seasonId) ||
      history.set !== input.set || history.queue !== input.queue || history.scope !== scope ||
      history.source !== input.source)) throw Error("趋势批次的赛季、队列或来源已换，请使用独立输出文件。");
  const output = history ? structuredClone(history) : {
    version: 1, seasonId: input.seasonId, set: input.set, queue: input.queue, scope, source: input.source,
    sourceUrl: input.sourceUrl, batches: [], series: [], discoveries: [],
  };
  const id = [input.model, input.patch, input.days, capturedAt].join("|");
  const effectiveAt = iso(patch?.effectiveAt);
  const verifiedPatch = input.build && patch?.build === input.build && effectiveAt &&
    edition(patch.seasonId) === edition(input.seasonId) && effectiveAt <= capturedAt;
  const start = iso(input.windowStart), end = iso(input.windowEnd);
  const exact = start && end && start < end && end <= capturedAt;
  const total = input.totalFinishes;
  const batch = { id, capturedAt, patch: input.patch, build: input.build ?? null, model: input.model,
    windowDays: input.days, windowStart: exact ? start : null, windowEnd: exact ? end : null,
    totalFinishes: Number.isSafeInteger(total) && total > 0 ? total : null,
    statsUrl: https(input.statsUrl) ? input.statsUrl : undefined,
    effectiveAt: verifiedPatch ? effectiveAt : undefined,
    patchUrl: verifiedPatch && https(patch.sourceUrl) ? patch.sourceUrl : undefined,
  };
  const previous = output.batches.findIndex(entry => entry.id === id);
  if (previous < 0) output.batches.push(batch);
  else output.batches[previous] = { ...output.batches[previous], ...Object.fromEntries(
    Object.entries(batch).filter(([, value]) => value !== null && value !== undefined)) };
  output.batches.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
  const timeByBatch = new Map(output.batches.map(entry => [entry.id, entry.capturedAt]));
  const seriesById = new Map(output.series.map(entry => [entry.id, entry]));
  const touchedSeries = new Set();
  const heroClusters = new Set(input.rows.filter(row => row.heroAugment).map(row => String(row.clusterId)));
  if (review?.model === input.model && review?.set === input.set) {
    for (const group of review.allGroups ?? []) {
      if (heroAugmentSourceUnits(group.sourceKey).length) heroClusters.add(String(group.id));
    }
  }
  for (const row of input.rows) {
    if (heroClusters.has(String(row.clusterId))) continue;
    if (Number.isSafeInteger(row.games) && row.games >= 0 && row.games < minGames) continue;
    const point = metrics(row);
    if (!point || typeof row.sectionId !== "string" || !row.sectionId ||
        typeof row.name !== "string" || !row.name || !row.clusterId ||
        !Array.isArray(row.carryIds)) {
      throw Error("趋势输入包含字段缺失或指标异常的合格体系记录：" + (row.clusterId ?? row.name ?? "unknown"));
    }
    const seriesId = [row.sectionId, row.teamId || row.clusterId].join(":");
    if (touchedSeries.has(seriesId)) throw Error("同一批次中存在重复的阵容棋盘：" + seriesId);
    touchedSeries.add(seriesId);
    const entry = seriesById.get(seriesId);
    const top = entry?.points.at(-1);
    const newest = !top || timeByBatch.get(top.batchId) <= capturedAt;
    const series = entry ?? { id: seriesId, sectionId: row.sectionId, points: [] };
    if (newest) {
      // Keep editorial co-carries when the same board still represents the same source cluster.
      const retainedCarries = top?.clusterId === String(row.clusterId) ? entry.carryIds : [];
      const carryIds = [...new Set([...row.carryIds, ...retainedCarries])];
      Object.assign(series, { teamId: row.teamId, name: row.name, carryIds });
    }
    const record = { batchId: id, clusterId: String(row.clusterId), ...point };
    const existing = series.points.findIndex(value => value.batchId === id);
    if (existing < 0) series.points.push(record);
    else series.points[existing] = record;
    series.points.sort((a, b) => timeByBatch.get(a.batchId).localeCompare(timeByBatch.get(b.batchId)));
    seriesById.set(seriesId, series);
  }
  output.series = [...seriesById.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (review) {
    const discovered = reviewDiscoveries(review, input, id, unitNames, archiveSnapshot);
    if (discovered.length) {
      output.discoveries = [...output.discoveries.filter(entry => entry.batchId !== id), ...discovered];
      output.discoveries.sort((a, b) => timeByBatch.get(b.batchId).localeCompare(timeByBatch.get(a.batchId)) ||
        a.mean - b.mean || b.games - a.games || a.id.localeCompare(b.id));
    }
  }
  const modelBatches = new Set(output.batches.filter(batch => batch.model === input.model).map(batch => batch.id));
  output.discoveries = output.discoveries.filter(entry => !modelBatches.has(entry.batchId) || !heroClusters.has(String(entry.clusterId)));
  return output;
}

export function importCompTrendObservation(input, bindings, reference, archiveSnapshot) {
  if (!Array.isArray(input.allGroups) || input.model !== bindings.model || input.set !== bindings.set ||
      (typeof input.queue === "string" && input.queue !== bindings.queue)) throw Error("历史批次与体系绑定范围不一致。");
  const groupById = new Map(input.allGroups.map(group => [String(group.id), group]));
  const labels = new Map((archiveSnapshot?.rows ?? []).map(row => [String(row.clusterId), row.name]));
  return {
    seasonId: reference.seasonId, source: reference.source, sourceUrl: input.sourceUrl ?? reference.sourceUrl,
    set: input.set, queue: bindings.queue, patch: input.patch, days: input.days, model: input.model,
    updatedAt: input.updatedAt, statsUrl: input.statsUrl,
    totalFinishes: iso(input.updatedAt) === iso(archiveSnapshot?.updatedAt) ? archiveSnapshot?.totalFinishes : undefined,
    rows: bindings.rows.flatMap(entry => {
      const group = groupById.get(String(entry.clusterId));
      return group && !heroAugmentSourceUnits(group.sourceKey).length ? [{ ...entry, name: labels.get(String(entry.clusterId)) ?? entry.name,
        games: group.games, mean: group.mean, topFourRate: group.topFourRate, winRate: group.winRate }] : [];
    }),
  };
}

const readJson = async file => JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));

export async function saveCompTrendBatch(file, batch, options) {
  await mkdir(dirname(file), { recursive: true });
  const lock = file + ".lock";
  try {
    await writeFile(lock, "", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw Error("趋势记录正在更新，请等前一轮写入后重试。");
  }
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    const history = await readJson(file).catch(error => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    const updated = appendCompTrendBatch(history, batch, options);
    await writeFile(temp, JSON.stringify(updated, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    await rename(temp, file);
    return updated;
  } finally {
    await rm(temp, { force: true });
    await rm(lock, { force: true });
  }
}

async function cli() {
  const { values } = parseArgs({ options: {
    snapshot: { type: "string", default: defaultSnapshot }, output: { type: "string", default: defaultFile },
    review: { type: "string" }, patch: { type: "string" }, bindings: { type: "string" }, "archive-snapshot": { type: "string" },
    observation: { type: "string", multiple: true }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) {
    console.log("node scripts/refresh-comp-trends.mjs [--snapshot 文件] [--review 同批复核文件] [--patch 已核实构建文件] [--output 文件]");
    console.log("历史回填追加 --bindings 体系绑定文件 --observation 历史文件，--observation 可重复。--archive-snapshot 可提供同模型旧名称。");
    return;
  }
  if (values.observation?.length && !values.bindings) throw Error("历史回填需要指定 --bindings。");
  const snapshot = await readJson(values.snapshot);
  const patch = values.patch ? await readJson(values.patch) : undefined;
  const review = values.review ? await readJson(values.review) : undefined;
  const season = await readJson(new URL("data/season.json", root));
  const unitNames = new Map(season.units.map(unit => [unit.id, unit.name]));
  const bindings = values.bindings ? await readJson(values.bindings) : undefined;
  const archiveSnapshot = values["archive-snapshot"] ? await readJson(values["archive-snapshot"]) : undefined;
  if (archiveSnapshot && (!bindings || ["model", "set", "queue"].some(key => archiveSnapshot[key] !== bindings[key]))) {
    throw Error("归档发布快照与历史体系绑定范围不一致。");
  }
  for (const file of values.observation ?? []) {
    const observation = await readJson(file);
    for (const row of observation.latest ? [observation.previous, observation.latest].filter(Boolean) : [observation]) {
      const batch = importCompTrendObservation(row, bindings, snapshot, archiveSnapshot);
      await saveCompTrendBatch(resolve(values.output), batch, { review: row.queue?.normal ? row : undefined, unitNames, archiveSnapshot });
    }
  }
  const result = await saveCompTrendBatch(resolve(values.output), snapshot, { review, patch, unitNames });
  console.log("已记录 " + result.batches.length + " 个批次、" + result.series.length + " 条阵容序列、" + result.discoveries.length + " 条复核线索。");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch(error => { console.error(error.message); process.exitCode = 1; });
}
