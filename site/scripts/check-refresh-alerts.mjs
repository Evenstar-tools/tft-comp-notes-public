import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { heroAugmentSourceUnits } from "./family-review.mjs";

const site = new URL("../", import.meta.url);
const repo = fileURLToPath(new URL("../../", import.meta.url));
const time = value => Date.parse(value) || 0;
const queueName = value => typeof value === "string" ? value.toUpperCase() : "";
const patchVersion = value => /^(?:PBE\s+)?(\d+)\.(\d+)([a-z]?)(?:\s|$)/i.exec(value ?? "");
const currentVersion = current => (current.metaTftPatch?.patch ?? "") + (current.metaTftPatch?.bPatch ?? "");
const int = value => typeof value === "number" || /^\d+$/.test(value ?? "") ? Number(value) : NaN;

function newerPatch(value, baseline) {
  const newer = patchVersion(value), older = patchVersion(baseline);
  if (!newer || !older) return false;
  return (Number(newer[1]) - Number(older[1]) || Number(newer[2]) - Number(older[2]) ||
    newer[3].toLowerCase().localeCompare(older[3].toLowerCase())) > 0;
}

function freshest(batches) {
  return batches.reduce((latest, entry) => time(entry.capturedAt) > time(latest?.capturedAt) ? entry : latest, undefined);
}

function strongUncollected({ family, trends, batch, review }) {
  const clues = new Map();
  const bound = new Map();
  function markBound(model, id) {
    if (id !== undefined) bound.set(`${model}:${id}`, true);
  }
  for (const row of [...(family.rows ?? []), ...(family.smallSamples ?? [])]) markBound(family.model, row.clusterId);
  if (batch) for (const series of trends.series ?? []) {
    for (const point of series.points ?? []) if (point.batchId === batch.id) markBound(batch.model, point.clusterId);
  }
  function add(entry, model, fallbackId) {
    const id = entry.clusterId ?? fallbackId;
    const key = `${model}:${id}`;
    if (id === undefined || bound.has(key) || clues.has(key) || entry.binding || entry.sectionId || entry.teamId ||
        !Number.isSafeInteger(entry.games) || entry.games < 100 || !Number.isFinite(entry.mean) || entry.mean < 1 || entry.mean > 4.40 ||
        heroAugmentSourceUnits(entry.sourceKey).length) return;
    clues.set(key, {
      id: String(id), name: entry.name || entry.guide || entry.sourceKey || `体系 ${id}`,
      reason: entry.reason || entry.proposal || "尚未关联攻略", mean: entry.mean, games: entry.games,
    });
  }
  if (batch) for (const entry of trends.discoveries ?? []) {
    if (entry.batchId === batch.id && (entry.kind === "new" || /^待/.test(entry.status ?? ""))) {
      add(entry, batch.model, entry.id);
    }
  }
  const groups = new Map((review?.allGroups ?? []).map(group => [String(group.id), group]));
  for (const entry of review?.queue?.normal ?? []) {
    add({ ...groups.get(String(entry.id)), ...entry }, review.model, entry.id);
  }
  for (const entry of review?.review ?? []) {
    if (/尚未关联攻略|模型更新，请重新配对/.test(entry.reason ?? "")) {
      add({ ...groups.get(String(entry.id)), ...entry }, review.model, entry.id);
    }
  }
  return [...clues.values()].sort((a, b) => a.mean - b.mean || b.games - a.games || a.id.localeCompare(b.id));
}

export function summarizeRefresh({ current, trends, family, bindings, recommendations, review, upstream, modules = [], profile, refreshOutcome }) {
  const batch = freshest(trends.batches ?? []);
  const latestSample = [family.updatedAt, batch?.capturedAt].filter(value => time(value))
    .sort((a, b) => time(b) - time(a))[0] ?? null;
  const observationDays = new Set((trends.batches ?? []).filter(entry => time(entry.capturedAt))
    .map(entry => new Date(entry.capturedAt).toISOString().slice(0, 10))).size;
  const currentPatch = currentVersion(current);
  const latestTime = Math.max(time(latestSample), time(current.effectiveAt));
  const usableReview = review?.set === family.set && queueName(review?.matchQueue ?? review?.queue) === queueName(family.queue) &&
    time(review?.updatedAt) > 0 && time(review.updatedAt) >= latestTime &&
    (review.patch === currentPatch || newerPatch(review.patch, currentPatch)) ? review : undefined;
  const relevantBatch = batch && time(batch.capturedAt) >= time(current.effectiveAt) &&
    (batch.patch === currentPatch || newerPatch(batch.patch, currentPatch)) ? batch : undefined;
  const clues = strongUncollected({ family, trends, batch: relevantBatch, review: usableReview });

  const patch = [upstream?.patch, usableReview?.patch, batch?.patch, family.patch].find(value => newerPatch(value, currentPatch));
  const builds = [upstream?.build, batch?.build, family.build].map(int).filter(Number.isSafeInteger);
  const build = builds.length ? Math.max(...builds) : undefined;
  const knownModel = int(family.model ?? batch?.model);
  const model = [upstream?.model, usableReview?.model, batch?.model]
    .map(int).find(value => Number.isSafeInteger(value) && Number.isSafeInteger(knownModel) && value > knownModel);
  const alerts = [];
  if (patch) alerts.push(`检测到较新的小版本 ${patch}（当前 ${currentPatch}）`);
  if (Number.isSafeInteger(build) && build > int(current.build)) {
    alerts.push(`检测到较新的构建 ${build}（当前 ${current.build}），需核对实装和样本`);
  }
  if (model !== undefined) alerts.push(`检测到较新的体系模型 ${model}（当前 ${knownModel}），需复核绑定`);
  if (bindings && Array.isArray(bindings.rows)) {
    const mapModel = int(bindings.model);
    if (Number.isSafeInteger(mapModel) && Number.isSafeInteger(knownModel) && mapModel !== knownModel) {
      alerts.push(`体系映射模型 ${mapModel} 与当前战绩模型 ${knownModel} 不一致`);
    } else {
      const present = new Set([...(family.rows ?? []), ...(family.smallSamples ?? [])]
        .filter(row => row?.clusterId !== undefined && row?.clusterId !== null)
        .map(row => String(row.clusterId)));
      const missing = bindings.rows.filter(row => !present.has(String(row.clusterId)));
      if (missing.length) {
        const preview = missing.slice(0, 5).map(row => `${row.clusterId} ${row.name || row.sectionId}`).join("、");
        alerts.push(`有 ${missing.length} 条已绑定体系缺失战绩（${preview}）`);
      }
    }
  }
  if (recommendations && Array.isArray(recommendations.entries) &&
      recommendations.seasonId === current.seasonId && String(recommendations.build) === String(current.build)) {
    const boundSections = bindings && Array.isArray(bindings.rows)
      ? new Set(bindings.rows.map(row => row.sectionId))
      : null;
    const activeFamilySections = new Set((family.rows ?? []).map(row => row.sectionId));
    const missingRecommended = [...new Set(recommendations.entries
      .filter(entry => entry.status === "recommended" && !entry.override &&
        (!boundSections || boundSections.has(entry.sectionId)) &&
        !activeFamilySections.has(entry.sectionId))
      .map(entry => entry.sectionId))];
    if (missingRecommended.length) {
      alerts.push(`有 ${missingRecommended.length} 条首页推荐阵容缺少有效体系战绩（${missingRecommended.join("、")}）`);
    }
  }
  if (usableReview?.review?.length) {
    const broken = usableReview.review.filter(entry => /本批没有原分组|主盘已变|^代表棋盘有变$/.test(entry.reason ?? ""));
    if (broken.length) {
      const preview = broken.slice(0, 5).map(entry => `${entry.id} ${entry.guide || ""}`.trim()).join("、");
      alerts.push(`本批有 ${broken.length} 条已绑定体系未通过代表盘校验（${preview}）`);
    }
  }
  if (clues.length) alerts.push(`有 ${clues.length} 条未收录强阵待复核（至少 100 场，均名 ≤ 4.40）`);
  if (refreshOutcome === "failure") alerts.push("本轮采集失败，查看工作流日志和复核清单");

  const warnings = [...(upstream?.warnings ?? [])];
  if (review && !usableReview) warnings.push("复核清单较旧或与当前批次范围不一致");
  const upstreamStatus = !upstream ? "未检查" : [
    upstream.patch && "补丁 " + upstream.patch, upstream.build && "构建 " + upstream.build,
    upstream.model && "模型 " + upstream.model,
  ].filter(Boolean).join(" · ") || "本次未取得可比数据";
  const upstreamEvidence = upstream ? {
    patch: upstream.patch ?? null, build: upstream.build ?? null, model: upstream.model ?? null,
    lookupPatch: upstream.lookupPatch ?? null, sampledAt: upstream.sampledAt ?? null, warnings: [...(upstream.warnings ?? [])],
  } : null;
  return { needsAttention: alerts.length > 0, alerts, warnings, modules, profile, refreshOutcome, upstream: upstreamEvidence,
    latestSample, pendingSample: time(usableReview?.updatedAt) > time(latestSample) ? usableReview.updatedAt : undefined,
    observationDays, currentPatch, currentBuild: current.build, upstreamStatus, clues };
}

const markdown = value => String(value).replace(/\s+/g, " ").replaceAll("@", "＠").replace(/[\\`*_{}\[\]<>]/g, "\\$&");

export function refreshSummaryMarkdown(report) {
  const status = { success: "采集完成", failure: "采集失败", "dry-run": "仅预览", skipped: "采集未启动" }[report.refreshOutcome];
  const lines = ["## 数据刷新巡检", "",
    `- 本轮配置：${markdown(report.profile ?? "本地巡检")}${status ? " · " + status : ""}`,
    `- 更新模块：${report.modules.map(markdown).join("、") || "无 site/data 变更"}`,
    `- 最新样本：${markdown(report.latestSample ?? "暂无")}`,
    ...(report.pendingSample ? [`- 待复核样本：${markdown(report.pendingSample)}`] : []),
    `- 阵容趋势：${report.observationDays} 个 UTC 观测日`,
    `- 当前版本：${markdown(report.currentPatch)} · 构建 ${markdown(report.currentBuild ?? "未知")}`,
    `- 上游巡检：${markdown(report.upstreamStatus)}`,
    `- 判定：${report.needsAttention ? "有事项待核对" : "本次无待核对事项"}`,
  ];
  if (report.alerts.length) lines.push("", "### 待核对", ...report.alerts.map(alert => "- " + markdown(alert)));
  if (report.warnings.length) lines.push("", "### 巡检提示", ...report.warnings.map(warning => "- " + markdown(warning)));
  if (report.clues.length) {
    lines.push("", "### 阵容线索");
    for (const clue of report.clues.slice(0, 10)) {
      lines.push(`- ${markdown(clue.name)} · 均名 ${clue.mean.toFixed(2)} · ${clue.games} 场 · ${markdown(clue.reason)}`);
    }
    if (report.clues.length > 10) lines.push(`- 另有 ${report.clues.length - 10} 条，见巡检 JSON`);
  }
  return lines.join("\n") + "\n";
}

export async function checkUpstream(family, fetcher = fetch) {
  const queue = queueName(family.queue);
  if (queue !== "PBE" || !/^TFTSet\d+$/.test(family.set ?? "")) {
    return { warnings: ["当前赛季或队列未配置上游 PBE 巡检"] };
  }
  const api = "https://api-hc.metatft.com/tft-comps-api/";
  const scoped = data => data.tft_set === family.set && queueName(data.queue_id) === queue;
  const endpoints = [
    ["lookup", `https://data.metatft.com/lookups/${family.set}_pbe_en_us.json`, data => {
      const metadata = data._metadata;
      const match = /^rls-(\d+\.\d+)\.\d+\.(\d+)\./i.exec(metadata?.release ?? "");
      if (metadata?.set !== family.set || queueName(metadata.patch) !== queue || !match) return;
      return { build: int(match[2]), lookupPatch: match[1] };
    }],
    ["comps_data", api + "comps_data?queue=PBE&patch=current", data =>
      scoped(data) && Number.isSafeInteger(int(data.cluster_id)) ? { model: int(data.cluster_id) } : undefined],
    ["comps_stats", api + "comps_stats?queue=PBE&patch=current&days=3&permit_filter_adjustment=true", data => {
      const resolved = data.resolved_patch;
      if (!scoped(data) || !/^\d+\.\d+$/.test(resolved?.patch ?? "") || !/^[a-z]?$/.test(resolved?.b_patch_version ?? "")) return;
      const sampledAt = new Date(Number.isFinite(data.updated) ? data.updated : NaN);
      return {
        patch: resolved.patch + (resolved.b_patch_version ?? ""),
        sampledAt: Number.isFinite(sampledAt.valueOf()) ? sampledAt.toISOString() : null,
      };
    }],
  ];
  const results = await Promise.allSettled(endpoints.map(async ([source, url, extract]) => {
    const response = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`${source} 返回 HTTP ${response.status}`);
    const observation = extract(await response.json());
    if (!observation) throw new Error(`${source} 的数据结构或赛季队列未对齐`);
    return observation;
  }));
  const observations = { warnings: [] };
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") Object.assign(observations, result.value);
    else observations.warnings.push(`上游 ${endpoints[index][0]} 本次未取得可比数据（${result.reason?.message ?? "请求失败"}）`);
  }
  if (observations.patch && !observations.sampledAt) observations.warnings.push("上游 comps_stats 缺少可核对的采样时间");
  return observations;
}

const defaultRepoSlug = "Evenstar-tools/tft-comp-notes-public";
const inspectionIssueTitle = "[数据巡检] 待核对新补丁或新阵容线索";

function resolveGithubToken(useCliFallback) {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (envToken) return envToken.trim();
  if (!useCliFallback) return "";
  const probe = spawnSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 3000 });
  return probe.status === 0 ? probe.stdout.trim() : "";
}

export async function checkGithubAlerts(repoSlug = defaultRepoSlug, fetcher = fetch) {
  const alerts = [];
  const warnings = [];
  const headers = { Accept: "application/vnd.github+json" };
  const token = resolveGithubToken(fetcher === fetch);
  if (token) headers.Authorization = "Bearer " + token;
  try {
    const res = await fetcher(`https://api.github.com/repos/${repoSlug}/issues?state=open&per_page=30`, {
      headers, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      warnings.push(`GitHub 巡检 Issue 未核实（HTTP ${res.status}）`);
    } else {
      const issues = await res.json();
      if (!Array.isArray(issues)) throw new Error("返回结构异常");
      const open = issues.find(item => !item.pull_request && item.title === inspectionIssueTitle);
      if (open) alerts.push(`GitHub 存在未关闭巡检 Issue #${open.number}（${open.html_url}）`);
    }
  } catch (error) {
    warnings.push(`GitHub 巡检 Issue 暂未取得（${error?.message ?? "网络异常"}）`);
  }
  try {
    const res = await fetcher(`https://api.github.com/repos/${repoSlug}/actions/workflows/data-refresh.yml/runs?branch=main&status=completed&per_page=1`, {
      headers, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      warnings.push(`GitHub Actions 运行状态未核实（HTTP ${res.status}）`);
    } else {
      const data = await res.json();
      if (!Array.isArray(data?.workflow_runs)) throw new Error("返回结构异常");
      const latest = data.workflow_runs[0];
      if (!latest) warnings.push("GitHub Actions 暂无已完成的自动数据刷新记录");
      if (latest && latest.status === "completed" && latest.conclusion && latest.conclusion !== "success") {
        alerts.push(`最近一次自动数据刷新工作流异常（${latest.conclusion} · ${latest.html_url}）`);
      }
    }
  } catch (error) {
    warnings.push(`GitHub Actions 运行状态暂未取得（${error?.message ?? "网络异常"}）`);
  }
  return { alerts, warnings };
}

export function formatDotSummary(report) {
  const findings = [...report.alerts, ...report.warnings];
  if (findings.length) {
    return `● 待核对（${findings.length} 项）｜${findings.join("；")}\n`;
  }
  return `○ 正常 · 无待核对事项（当前 ${report.currentPatch} · 构建 ${report.currentBuild ?? "未知"}）\n`;
}

function changedModules() {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--", "site/data/"], { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) return [];
  return [...new Set(result.stdout.split("\0").flatMap(entry => {
    const match = /^site\/data\/(.+)\.json$/.exec(entry.slice(3));
    return match ? [match[1]] : [];
  }))].sort();
}

async function main() {
  const { values } = parseArgs({ options: {
    "summary-out": { type: "string" }, "json-out": { type: "string" },
    "check-upstream": { type: "boolean" }, "check-github": { type: "boolean" },
    dot: { type: "boolean" }, repo: { type: "string" },
    profile: { type: "string" }, "refresh-outcome": { type: "string" },
  } });
  const readJson = async path => JSON.parse(await readFile(new URL(path, site), "utf8"));
  const optionalJson = path => readJson(path).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
  const [current, trends, family, bindings, recommendations, review] = await Promise.all([
    readJson("data/current-patch.json"), readJson("data/comp-trends.json"), readJson("data/guide-family-stats.json"),
    optionalJson("data/guide-family-map.json"), optionalJson("data/patch-recommendations.json"),
    optionalJson("outputs/family-review/review.json"),
  ]);
  const [upstream, github] = await Promise.all([
    values["check-upstream"] ? checkUpstream(family) : undefined,
    values["check-github"] ? checkGithubAlerts(values.repo || defaultRepoSlug) : undefined,
  ]);
  const report = summarizeRefresh({ current, trends, family, bindings, recommendations, review, upstream,
    modules: changedModules(), profile: values.profile, refreshOutcome: values["refresh-outcome"] });
  if (github) {
    report.alerts.push(...github.alerts);
    report.warnings.push(...github.warnings);
    report.needsAttention = report.alerts.length > 0;
  }
  const summary = refreshSummaryMarkdown(report);
  for (const [target, content] of [[values["summary-out"], summary], [values["json-out"], JSON.stringify(report, null, 2) + "\n"]]) {
    if (!target) continue;
    const file = resolve(target);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
  if (!values["summary-out"]) {
    process.stdout.write(values.dot ? formatDotSummary(report) : summary);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
