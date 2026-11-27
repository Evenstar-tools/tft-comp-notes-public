import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";

const site = fileURLToPath(new URL("../", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const fast = ["guide-family-stats", "comp-trends"];
const daily = [...fast, "hero-stats", "item-wearers", "special-item-wearers",
  "guide-placement", "guide-carry-stats", "trait-stats"];
const profiles = { fast, daily, all: [...daily, "emblem-stats"] };
const buildModules = new Set([...fast, "guide-placement", "guide-carry-stats"]);
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
  if (!Object.hasOwn(profiles, profile)) throw new Error("未知自动刷新配置 " + profile);
  const allowed = new Set(profiles[profile].map(id => "site/data/" + id + ".json"));
  return status.split("\0").filter(Boolean).map(entry => {
    const path = entry.slice(3);
    if (!entry.startsWith(" M ") || !allowed.has(path)) {
      throw new Error("自动提交包含未授权或非修改文件 " + JSON.stringify(entry));
    }
    return path;
  });
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

function verify(profile) {
  const changed = changedDataFiles(git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"), profile);
  const files = changed.filter(path => {
    const committed = JSON.parse(git("show", "HEAD:" + path).replace(/^\uFEFF/, ""));
    return !isDeepStrictEqual(committed, readJson(new URL("../../" + path, import.meta.url)));
  });
  if (!files.length) return "本轮没有实质数据变更";
  verifyAlignment(files, JSON.parse(run(process.execPath, ["scripts/run-data-refresh.mjs", "--status", "--json"], site)));
  const baseline = readPublishedFamily();
  const family = readJson(dataUrl("guide-family-stats.json"));
  if (time(family.updatedAt) < time(baseline.updatedAt)) {
    throw new Error("候选体系样本早于已发布批次");
  }
  const trend = readJson(dataUrl("comp-trends.json"));
  const newest = trend.batches.reduce((latest, batch) => time(batch.capturedAt) > time(latest.capturedAt) ? batch : latest);
  if (family.model !== baseline.model || (files.includes("site/data/comp-trends.json") && newest.model !== baseline.model)) {
    throw new Error("自动提交不能切换体系模型");
  }
  console.log("已核对可发布文件 " + files.join("、"));
  return null;
}

function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    report: { type: "string" }, profile: { type: "string" },
  } });
  let reason;
  if (positionals.length === 1 && positionals[0] === "preflight" && values.report && !values.profile) {
    // The exact collector and the upstream probe can observe different cache ages.
    // The lower bound is the published batch, even after collection has updated the worktree.
    reason = preflightReason(readJson(dataUrl("current-patch.json")), readPublishedFamily(), readJson(values.report));
    if (!reason) console.log("上游版本、构建、模型和样本时间已对齐");
  } else if (positionals.length === 1 && positionals[0] === "verify" && values.profile && !values.report) {
    reason = verify(values.profile);
  } else {
    throw new Error("用法：preflight --report <报告文件> 或 verify --profile <fast|daily|all>");
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
