import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { automaticRefreshModules } from "./run-data-refresh.mjs";
import { archiveBatchId, refreshCohort } from "./refresh-cohort.mjs";

const site = fileURLToPath(new URL("../", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const buildModules = new Set(["guide-family-stats", "comp-trends", "guide-placement", "guide-carry-stats"]);
const familyPath = "site/data/guide-family-stats.json";
const manifestPath = "site/data/stats-history.json";
const archivePath = id => `site/public/stats-history/${id}/`;

const readJson = file => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const numeric = value => (typeof value === "number" || typeof value === "string") && /^\d+$/.test(String(value));
const time = value => typeof value === "number" ? value : Date.parse(value);

export function preflightReason(current, family, { upstream } = {}) {
  let cohort;
  try {
    cohort = refreshCohort(current);
  } catch (error) {
    return error.message;
  }
  const effective = time(current.effectiveAt);
  if ((cohort.pbe && (!numeric(current.build) || family.queue !== cohort.queue)) ||
      !Number.isFinite(effective) || !cohort.queueMatches(family.queue) || family.set !== cohort.set ||
      !Number.isSafeInteger(family.model)) {
    return "本地版本或赛季、队列、体系模型口径有缺项";
  }
  if (!upstream || !Array.isArray(upstream.warnings) || upstream.warnings.length ||
      !/^\d+\.\d+[a-z]?$/.test(upstream.patch ?? "") ||
      (cohort.pbe && (!/^\d+\.\d+$/.test(upstream.lookupPatch ?? "") || !numeric(upstream.build))) ||
      !Number.isSafeInteger(upstream.model) || !Number.isFinite(time(upstream.sampledAt))) {
    return "尚未取得完整的上游补丁、构建、体系模型和采样时间";
  }
  if (cohort.pbe && (upstream.patch !== cohort.version || upstream.lookupPatch !== cohort.patch ||
      String(upstream.build) !== String(current.build))) {
    return "上游补丁或构建待复核（" + upstream.patch + " / " + upstream.build +
      "，站内 " + cohort.version + " / " + current.build + "）";
  }
  if (upstream.patch !== cohort.version) return "上游正式服补丁待复核（" + upstream.patch + "，站内 " + cohort.version + "）";
  if (upstream.model !== family.model) {
    return "上游体系模型待复核（" + upstream.model + "，站内 " + family.model + "）";
  }
  if (time(upstream.sampledAt) < Math.max(effective, time(family.updatedAt) || 0)) {
    return "上游样本早于当前实装时间或已发布体系样本";
  }
  return null;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 45_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || command + " 执行失败");
  return result.stdout;
}

const git = (...args) => run("git", args, repo);
const dataUrl = file => new URL("../data/" + file, import.meta.url);
const repoUrl = path => new URL("../../" + path, import.meta.url);
const committedJson = (path, ref = "HEAD") => JSON.parse(git("show", ref + ":" + path).replace(/^\uFEFF/, ""));

export function readPublishedFamily(ref = "HEAD") {
  return committedJson(familyPath, ref);
}

export function changedDataFiles(status, profile, { archiveId } = {}) {
  const archive = archiveId !== undefined;
  if (archive && (typeof archiveId !== "string" ||
      !/^(?:pbe-s[1-9]\d*-\d{4}-\d{2}-\d{2}-\d+\.\d+[a-z]?(?:-\d+)?|ranked-s[1-9]\d*-\d+\.\d+[a-z]?)$/.test(archiveId))) {
    throw new Error("采集回执含无效归档批次");
  }
  const allowed = new Set(automaticRefreshModules(profile, { archive }).map(id => "site/data/" + id + ".json"));
  if (archive) allowed.add(manifestPath);
  const exports = archive ? new Set(["heroes.json", "equipment.json"].map(name => archivePath(archiveId) + name)) : new Set();
  return status.split("\0").filter(Boolean).map(entry => {
    const path = entry.slice(3);
    const type = entry.slice(0, 3);
    if (!(type === " M " && allowed.has(path)) && !((type === " M " || type === "?? ") && exports.has(path))) {
      throw new Error("自动提交包含未授权或非修改文件 " + JSON.stringify(entry));
    }
    return path;
  });
}

export function verifyCollectedModules(profile, receipt, summary) {
  const expected = automaticRefreshModules(profile, { archive: receipt?.archiveId !== undefined });
  const completed = receipt?.modules;
  if (receipt?.profile !== profile || !Array.isArray(completed)) throw new Error("采集回执与本轮配置不符");
  const missing = expected.filter(id => !completed.includes(id));
  if (missing.length || completed.length !== expected.length) {
    throw new Error("采集模块未完整通过：" + (missing.length ? missing.join("、") : "回执含重复或意外模块"));
  }
  verifyAlignment(expected.map(id => `site/data/${id}.json`), summary);
}

export function verifyAlignment(files, summary) {
  if (summary.ok !== true || !Array.isArray(summary.modules) || !numeric(summary.currentPatch?.build)) {
    throw new Error("数据门禁未返回有效状态摘要");
  }
  for (const path of files) {
    const entry = summary.modules.find(module => "site/" + module.file === path);
    if (entry?.alignment !== "aligned" || entry.patch !== summary.currentPatch.patch ||
        (buildModules.has(entry.id) && entry.build !== summary.currentPatch.build)) {
      throw new Error(path + " 未对齐当前数据批次");
    }
  }
}

export function verifyFamilyContinuity(baseline, candidate, { bindings, trend, checkTrends = false, familyChanged = false } = {}) {
  if (time(candidate.updatedAt) < time(baseline.updatedAt)) {
    throw new Error("候选体系样本早于已发布批次");
  }
  if (candidate.model !== baseline.model) {
    throw new Error("自动提交不能切换体系模型");
  }
  const presentIds = new Set([...(candidate.rows ?? []), ...(candidate.smallSamples ?? [])]
    .filter(row => row?.clusterId !== undefined && row?.clusterId !== null)
    .map(row => String(row.clusterId)));
  if (bindings && bindings.model !== candidate.model) {
    throw new Error("候选体系模型与绑定映射表不一致");
  }
  const boundIds = bindings && Array.isArray(bindings.rows)
    ? new Set(bindings.rows.map(row => String(row.clusterId)))
    : null;
  if (boundIds) {
    const missingBound = [...boundIds].filter(id => !presentIds.has(id));
    if (missingBound.length) {
      throw new Error("候选体系战绩缺少已绑定分组：" + missingBound.join("、"));
    }
  }
  if (baseline.patch === candidate.patch) {
    const baselineIds = [...(baseline.rows ?? []), ...(baseline.smallSamples ?? [])]
      .filter(row => row?.clusterId !== undefined && row?.clusterId !== null)
      .map(row => String(row.clusterId))
      .filter(id => !boundIds || boundIds.has(id));
    const dropped = baselineIds.filter(id => !presentIds.has(id));
    if (dropped.length) {
      throw new Error("候选体系战绩较已发布基线丢失分组：" + dropped.join("、"));
    }
    if ((baseline.rows?.length ?? 0) >= 4 && (candidate.rows?.length ?? 0) < 4) {
      throw new Error("候选合格体系数量异常骤降");
    }
  }
  if ((checkTrends || familyChanged) && trend) {
    if (!Array.isArray(trend.batches) || !trend.batches.length) {
      throw new Error("候选趋势文件缺少批次记录");
    }
    const newest = trend.batches.reduce((latest, batch) => time(batch.capturedAt) > time(latest.capturedAt) ? batch : latest);
    if (newest.model !== baseline.model) {
      throw new Error("自动提交不能切换体系模型");
    }
    if (familyChanged && time(newest.capturedAt) !== time(candidate.updatedAt)) {
      throw new Error("候选趋势最新批次与体系战绩采样时间不一致");
    }
    const recordedSeries = new Set((trend.series ?? [])
      .filter(series => (series.points ?? []).some(point => point.batchId === newest.id))
      .map(series => series.id));
    const missingSeries = (candidate.rows ?? [])
      .filter(row => !row.heroAugment && Number.isSafeInteger(row.games) && row.games >= 100)
      .map(row => [row.sectionId, row.teamId || row.clusterId].join(":"))
      .filter(id => !recordedSeries.has(id));
    if (missingSeries.length) {
      throw new Error("候选趋势批次缺少活跃体系采样点：" + missingSeries.join("、"));
    }
  }
}

function verifyArchive(archiveId) {
  const current = readJson(dataUrl("current-patch.json"));
  const cohort = refreshCohort(current);
  const heroes = readJson(dataUrl("hero-stats.json"));
  const base = committedJson(manifestPath);
  if (archiveId !== archiveBatchId(cohort, heroes.date, base)) throw new Error("归档回执与当前采集批次不符");
  const history = readJson(repoUrl(manifestPath));
  const entry = history.find(row => row.id === archiveId);
  if (!entry || entry.date !== heroes.date || entry.channel !== (cohort.pbe ? "pbe" : "ranked") ||
      entry.season !== cohort.season.toLowerCase() || (cohort.pbe &&
      (entry.build !== String(current.build) || entry.metaTft?.patch !== cohort.patch || entry.metaTft?.bPatch !== cohort.bPatch)) ||
      !isDeepStrictEqual(history.filter(row => row.id !== archiveId), base.filter(row => row.id !== archiveId))) {
    throw new Error("归档清单与本轮批次不符或包含其他历史改动");
  }
  const directory = archivePath(archiveId);
  const [heroFile, gearFile] = ["heroes.json", "equipment.json"].map(name => repoUrl(directory + name));
  if (![heroFile, gearFile].every(file => lstatSync(file).isFile()) || !isDeepStrictEqual(readJson(heroFile), heroes) ||
      !isDeepStrictEqual(readJson(gearFile), { standard: readJson(dataUrl("item-wearers.json")),
        special: readJson(dataUrl("special-item-wearers.json")) })) {
    throw new Error("归档文件与本轮采集快照不一致");
  }
}

export function verifyRefreshChanges(profile, receiptPath) {
  const receipt = readJson(receiptPath);
  const status = git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames");
  const changed = changedDataFiles(status, profile, { archiveId: receipt?.archiveId });
  const summary = JSON.parse(run(process.execPath, ["scripts/run-data-refresh.mjs", "--status", "--json"], site));
  verifyCollectedModules(profile, receipt, summary);
  if (receipt.archiveId !== undefined) verifyArchive(receipt.archiveId);
  const added = new Set(status.split("\0").filter(entry => entry.startsWith("?? ")).map(entry => entry.slice(3)));
  const files = changed.filter(path => added.has(path) || !isDeepStrictEqual(committedJson(path), readJson(repoUrl(path))));
  if (!files.length) return [];
  const baseline = readPublishedFamily();
  const family = readJson(dataUrl("guide-family-stats.json"));
  const mapFile = dataUrl("guide-family-map.json");
  const bindings = existsSync(mapFile) ? readJson(mapFile) : undefined;
  const trend = readJson(dataUrl("comp-trends.json"));
  verifyFamilyContinuity(baseline, family, {
    bindings,
    trend,
    checkTrends: files.includes("site/data/comp-trends.json"),
    familyChanged: files.includes("site/data/guide-family-stats.json"),
  });
  console.log("已核对可发布文件 " + files.join("、"));
  return files.map(path => ({ path, change: added.has(path) ? "A" : "M" }));
}

function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    report: { type: "string" }, profile: { type: "string" }, receipt: { type: "string" },
  } });
  let reason;
  if (positionals.length === 1 && positionals[0] === "preflight" && values.report && !values.profile && !values.receipt) {
    // The exact collector and the upstream probe can observe different cache ages.
    // The lower bound is the published batch, even after collection has updated the worktree.
    const current = readJson(dataUrl("current-patch.json"));
    reason = preflightReason(current, readPublishedFamily(), readJson(values.report));
    if (!reason) console.log(refreshCohort(current).pbe ? "上游版本、构建、模型和样本时间已对齐" : "上游正式服版本、模型和样本时间已对齐");
  } else if (positionals.length === 1 && positionals[0] === "verify" && values.profile && values.receipt && !values.report) {
    if (!verifyRefreshChanges(values.profile, values.receipt).length) {
      reason = "所选模块已采集并核验，本轮没有实质数据变更";
    }
  } else {
    throw new Error("用法：preflight --report <报告文件> 或 verify --profile <fast|daily|all> --receipt <采集回执>");
  }
  if (reason) {
    console.log("跳过自动发布 · " + reason);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
