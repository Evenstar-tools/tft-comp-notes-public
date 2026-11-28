import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { automaticRefreshModules } from "./run-data-refresh.mjs";

const site = fileURLToPath(new URL("../", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const buildModules = new Set(["guide-family-stats", "comp-trends", "guide-placement", "guide-carry-stats"]);
const familyPath = "site/data/guide-family-stats.json";

const readJson = file => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const numeric = value => (typeof value === "number" || typeof value === "string") && /^\d+$/.test(String(value));
const time = value => typeof value === "number" ? value : Date.parse(value);

export function preflightReason(current, family, { upstream } = {}) {
  const season = /^s(\d+)-pbe$/.exec(current.seasonId ?? "");
  const { patch, bPatch } = current.metaTftPatch ?? {};
  const effective = time(current.effectiveAt);
  if (!season || !/^\d+\.\d+$/.test(patch ?? "") || !/^[a-z]?$/.test(bPatch ?? "#") ||
      !numeric(current.build) || !Number.isFinite(effective) || family.queue !== "PBE" ||
      family.set !== "TFTSet" + season[1] || !Number.isSafeInteger(family.model)) {
    return "本地版本或赛季、队列、体系模型口径有缺项";
  }
  if (!upstream || !Array.isArray(upstream.warnings) || upstream.warnings.length ||
      !/^\d+\.\d+[a-z]?$/.test(upstream.patch ?? "") ||
      !/^\d+\.\d+$/.test(upstream.lookupPatch ?? "") || !numeric(upstream.build) ||
      !Number.isSafeInteger(upstream.model) || !Number.isFinite(time(upstream.sampledAt))) {
    return "尚未取得完整的上游补丁、构建、体系模型和采样时间";
  }
  if (upstream.patch !== patch + bPatch || upstream.lookupPatch !== patch || String(upstream.build) !== String(current.build)) {
    return "上游补丁或构建待复核（" + upstream.patch + " / " + upstream.build +
      "，站内 " + patch + bPatch + " / " + current.build + "）";
  }
  if (upstream.model !== family.model) {
    return "上游体系模型待复核（" + upstream.model + "，站内 " + family.model + "）";
  }
  if (time(upstream.sampledAt) < Math.max(effective, time(family.updatedAt) || 0)) {
    return "上游样本早于当前实装时间或已发布体系样本";
  }
  return null;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || command + " 执行失败");
  return result.stdout;
}

const git = (...args) => run("git", args, repo);
const dataUrl = file => new URL("../data/" + file, import.meta.url);

export function readPublishedFamily(ref = "HEAD") {
  return JSON.parse(git("show", ref + ":" + familyPath).replace(/^\uFEFF/, ""));
}

export function changedDataFiles(status, profile) {
  const allowed = new Set(automaticRefreshModules(profile).map(id => "site/data/" + id + ".json"));
  return status.split("\0").filter(Boolean).map(entry => {
    const path = entry.slice(3);
    if (!entry.startsWith(" M ") || !allowed.has(path)) {
      throw new Error("自动提交包含未授权或非修改文件 " + JSON.stringify(entry));
    }
    return path;
  });
}

export function verifyCollectedModules(profile, receipt, summary) {
  const expected = automaticRefreshModules(profile);
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

function verify(profile, receiptPath) {
  const receipt = readJson(receiptPath);
  const summary = JSON.parse(run(process.execPath, ["scripts/run-data-refresh.mjs", "--status", "--json"], site));
  verifyCollectedModules(profile, receipt, summary);
  const changed = changedDataFiles(git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"), profile);
  const files = changed.filter(path => {
    const committed = JSON.parse(git("show", "HEAD:" + path).replace(/^\uFEFF/, ""));
    return !isDeepStrictEqual(committed, readJson(new URL("../../" + path, import.meta.url)));
  });
  if (!files.length) return "所选模块已采集并核验，本轮没有实质数据变更";
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
  return null;
}

function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    report: { type: "string" }, profile: { type: "string" }, receipt: { type: "string" },
  } });
  let reason;
  if (positionals.length === 1 && positionals[0] === "preflight" && values.report && !values.profile && !values.receipt) {
    // The exact collector and the upstream probe can observe different cache ages.
    // The lower bound is the published batch, even after collection has updated the worktree.
    reason = preflightReason(readJson(dataUrl("current-patch.json")), readPublishedFamily(), readJson(values.report));
    if (!reason) console.log("上游版本、构建、模型和样本时间已对齐");
  } else if (positionals.length === 1 && positionals[0] === "verify" && values.profile && values.receipt && !values.report) {
    reason = verify(values.profile, values.receipt);
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
