import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { changedDataFiles, preflightReason, verifyAlignment, verifyCollectedModules, verifyFamilyContinuity } from "../scripts/check-auto-refresh.mjs";
import { automaticRefreshModules } from "../scripts/run-data-refresh.mjs";
import { checkUpstream, formatDotSummary, summarizeRefresh } from "../scripts/check-refresh-alerts.mjs";

const current = {
  seasonId: "s19-pbe",
  build: "6035832",
  metaTftPatch: { patch: "19.1", bPatch: "c" },
  effectiveAt: "2026-11-25T20:56:38Z",
};
const family = { set: "TFTSet19", queue: "PBE", model: 429, updatedAt: "2026-11-26T08:28:58Z" };
const upstream = {
  build: 6035832, patch: "19.1c", lookupPatch: "19.1", model: 429,
  sampledAt: Date.parse("2026-11-26T09:30:00Z"), warnings: [],
};

test("the scheduled fast profile refreshes the two snapshots allowed by the publisher", () => {
  const site = new URL("../", import.meta.url);
  const plan = execFileSync(process.execPath, ["scripts/run-data-refresh.mjs", "--profile", "fast", "--dry-run"],
    { cwd: fileURLToPath(site), encoding: "utf8" });
  assert.match(plan, /1\. guide-family-stats \+ comp-trends .*\r?\n2\. data:verify /);
  assert.doesNotMatch(plan, /hero-stats|guide-placement/);
});

test("scheduled and manual runs use the protected-PR refresh entry point", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/data-refresh.yml", import.meta.url), "utf8");
  const fastTimes = [1, 7, 13, 19].map(hour => `17 ${hour} * * *`);
  assert.deepEqual([...workflow.matchAll(/cron: '([^']+)'/g)].map(match => match[1]).sort(),
    [...fastTimes, "53 2 * * *"].sort());
  assert.match(workflow, /'schedule:53 2 \* \* \*'\) profile=daily/);
  assert.ok(workflow.includes(fastTimes.map(cron => `'schedule:${cron}'`).join("|") + ") profile=fast"));
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /run-conditional-refresh\.mjs --profile "\$PROFILE" --dry-run/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ secrets\.DATA_REFRESH_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /git push|scripts\/run-data-refresh\.mjs|scripts\/publish-auto-refresh\.mjs/);
});

test("S19 ranked preflight verifies season, patch, model and freshness without querying the PBE build", async () => {
  const live = { ...current, seasonId: "s19-live", queue: "RANKED", build: undefined,
    tierFilter: ["Master", "Diamond"], metaTftPatch: { patch: "19.1" } };
  const ranked = { ...family, queue: "RANKED" };
  const source = { tft_set: "TFTSet19", queue_id: 1100, cluster_id: family.model };
  const fetcher = async raw => {
    const url = new URL(raw);
    assert.equal(url.hostname, "api-hc.metatft.com");
    assert.equal(url.searchParams.get("queue"), "1100");
    assert.equal(url.searchParams.get("patch"), "current");
    if (url.pathname.endsWith("/comps_data")) return Response.json(source);
    assert.ok(url.pathname.endsWith("/comps_stats"));
    assert.equal(url.searchParams.get("rank"), "DIAMOND,MASTER");
    return Response.json({ ...source, resolved_patch: { patch: "19.1", b_patch_version: "" }, updated: upstream.sampledAt });
  };
  const probe = await checkUpstream(live, ranked, fetcher);
  assert.deepEqual(probe, { warnings: [], patch: "19.1", model: family.model,
    sampledAt: new Date(upstream.sampledAt).toISOString() });
  const check = overrides => preflightReason(live, ranked, { upstream: { ...probe, ...overrides } });
  assert.equal(check({}), null);
  assert.match(check({ patch: "19.1a" }), /正式服补丁待复核/);
  assert.match(check({ model: 430 }), /体系模型待复核/);
  assert.match(check({ sampledAt: "2026-11-26T07:00:00Z" }), /早于/);
  assert.match(check({ sampledAt: undefined }), /完整/);
  assert.match(preflightReason(live, family, { upstream: probe }), /队列/);
  const wrongSource = await checkUpstream(live, ranked, async () => Response.json({ ...source, tft_set: "TFTSet18" }));
  assert.match(preflightReason(live, ranked, { upstream: wrongSource }), /完整/);
});

test("scheduled refresh can proceed only with the confirmed patch, build, model and fresh sample", () => {
  const check = overrides => preflightReason(current, family, { upstream: { ...upstream, ...overrides } });
  assert.equal(check({}), null);
  assert.match(check({ build: 6037882 }), /构建待复核/);
  assert.match(check({ patch: "19.1d" }), /补丁或构建待复核/);
  assert.match(check({ model: 430 }), /体系模型待复核/);
  assert.match(check({ sampledAt: "2026-11-26T07:00:00Z" }), /早于/);
  assert.match(check({ patch: undefined }), /完整/);
  assert.match(check({ warnings: ["upstream unavailable"] }), /完整/);
  assert.match(preflightReason(current, { ...family, queue: "Ranked" }, { upstream }), /队列/);
});

test("the second preflight compares against the committed batch after collection", () => {
  const repo = mkdtempSync(join(tmpdir(), "tft-preflight-"));
  try {
    const site = join(repo, "site");
    const script = join(site, "scripts", "check-auto-refresh.mjs");
    const batch = join(site, "data", "guide-family-stats.json");
    const report = join(repo, "upstream.json");
    const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    const preflight = () => execFileSync(process.execPath, [script, "preflight", "--report", report], { encoding: "utf8" });
    mkdirSync(join(site, "scripts"), { recursive: true });
    mkdirSync(join(site, "data"));
    copyFileSync(new URL("../scripts/check-auto-refresh.mjs", import.meta.url), script);
    copyFileSync(new URL("../scripts/run-data-refresh.mjs", import.meta.url), join(site, "scripts", "run-data-refresh.mjs"));
    copyFileSync(new URL("../scripts/refresh-cohort.mjs", import.meta.url), join(site, "scripts", "refresh-cohort.mjs"));
    writeFileSync(join(site, "data", "current-patch.json"), JSON.stringify(current));
    writeFileSync(batch, JSON.stringify(family));
    git("init", "--quiet");
    git("add", "site/data");
    git("-c", "user.name=Data Refresh Test", "-c", "user.email=refresh@example.invalid", "commit", "--quiet", "-m", "published");
    writeFileSync(batch, JSON.stringify({ ...family, updatedAt: "2026-11-26T09:30:01Z" }));
    writeFileSync(report, JSON.stringify({ upstream }));
    assert.match(preflight(), /上游版本、构建、模型和样本时间已对齐/);

    writeFileSync(report, JSON.stringify({ upstream: { ...upstream, sampledAt: "2026-11-26T07:00:00Z" } }));
    assert.throws(preflight, error => error.status === 2 && /早于/.test(error.stdout));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the refresh path policy only accepts tracked edits to the selected stats", () => {
  assert.deepEqual(changedDataFiles(" M site/data/guide-family-stats.json\0", "fast"),
    ["site/data/guide-family-stats.json"]);
  assert.deepEqual(changedDataFiles("", "fast"), []);
  assert.throws(() => changedDataFiles(" M site/data/hero-stats.json\0", "fast"), /未授权/);
  assert.deepEqual(changedDataFiles(" M site/data/emblem-stats.json\0", "daily"), ["site/data/emblem-stats.json"]);
  assert.deepEqual(changedDataFiles(" M site/data/emblem-stats.json\0", "all"), ["site/data/emblem-stats.json"]);
  for (const change of [" M site/data/current-patch.json", " M site/data/patch-recommendations.json",
    " M .github/workflows/checks.yml", " D site/data/guide-family-stats.json", "?? site/data/comp-trends.json",
    "M  site/data/guide-family-stats.json", " T site/data/comp-trends.json"]) {
    assert.throws(() => changedDataFiles(change + "\0", "fast"), /未授权或非修改/);
  }
});

test("archive paths require a receipt for the exact batch and accept only allowed change types", () => {
  const archiveId = "pbe-s19-2026-11-27-19.1c";
  const dir = `site/public/stats-history/${archiveId}`;
  const valid = [" M site/data/stats-history.json", `?? ${dir}/heroes.json`, ` M ${dir}/equipment.json`];
  const status = entries => entries.map(entry => entry + "\0").join("");
  assert.deepEqual(changedDataFiles(status(valid), "daily", { archiveId }), valid.map(entry => entry.slice(3)));
  for (const entry of valid) assert.throws(() => changedDataFiles(status([entry]), "daily"), /未授权/);
  for (const entry of [
    "?? site/data/stats-history.json", "?? site/data/hero-stats.json", " M site/data/current-patch.json",
    `?? ${dir}/other.json`, `?? ${dir}/nested/heroes.json`, ` D ${dir}/heroes.json`, ` T ${dir}/heroes.json`,
    `A  ${dir}/heroes.json`, `?? ${dir}/../heroes.json`, "?? site/public/stats-history/ranked-s19-19.1/heroes.json",
  ]) assert.throws(() => changedDataFiles(status([entry]), "daily", { archiveId }), /未授权/);
  assert.throws(() => changedDataFiles("", "daily", { archiveId: "../other" }), /无效归档批次/);
});

test("the release guard verifies newly archived content and rejects edits to other history entries", t => {
  const repo = mkdtempSync(join(fileURLToPath(new URL("../", import.meta.url)), ".archive-policy-test-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const site = join(repo, "site");
  const archiveId = "pbe-s19-2026-11-27-19.1c";
  const directory = join(site, "public", "stats-history", archiveId);
  const guard = join(site, "scripts", "check-auto-refresh.mjs");
  const receipt = join(repo, ".git", "test-receipt.json");
  mkdirSync(join(site, "scripts"), { recursive: true });
  mkdirSync(join(site, "data"));
  const writeData = (id, value) => writeFileSync(join(site, "data", id + ".json"), JSON.stringify(value));
  for (const name of ["check-auto-refresh.mjs", "refresh-cohort.mjs"]) {
    copyFileSync(new URL("../scripts/" + name, import.meta.url), join(site, "scripts", name));
  }
  const modules = automaticRefreshModules("fast", { archive: true });
  const summary = { ok: true, currentPatch: { patch: "19.1c", build: current.build },
    modules: modules.map(id => ({ id, file: `data/${id}.json`, patch: "19.1c", build: current.build, alignment: "aligned" })) };
  writeFileSync(join(site, "scripts", "run-data-refresh.mjs"),
    `export const automaticRefreshModules = () => ${JSON.stringify(modules)};
if (process.argv.includes("--status")) console.log(${JSON.stringify(JSON.stringify(summary))});\n`);
  const heroes = { date: "2026-11-27", rows: { hero: { games: 100 } } };
  const equipment = { standard: { items: { standard: {} } }, special: { items: { special: {} } } };
  const prior = { id: "pbe-s19-2026-11-26-19.1c" };
  writeData("current-patch", current);
  writeData("hero-stats", heroes);
  writeData("item-wearers", equipment.standard);
  writeData("special-item-wearers", equipment.special);
  writeData("guide-family-stats", family);
  writeData("comp-trends", {});
  writeData("stats-history", [prior]);
  const git = (...args) => execFileSync("git", args, { cwd: repo });
  git("init", "--quiet");
  git("add", "site");
  git("-c", "user.name=Data Refresh Test", "-c", "user.email=refresh@example.invalid", "commit", "--quiet", "-m", "published");
  writeFileSync(receipt, JSON.stringify({ profile: "fast", modules, archiveId }));
  const entry = { id: archiveId, channel: "pbe", season: "s19", date: heroes.date,
    build: current.build, metaTft: current.metaTftPatch };
  writeData("stats-history", [entry, prior]);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "heroes.json"), JSON.stringify(heroes));
  writeFileSync(join(directory, "equipment.json"), JSON.stringify(equipment));
  const verify = () => execFileSync(process.execPath, [guard, "verify", "--profile", "fast", "--receipt", receipt],
    { encoding: "utf8", stdio: "pipe" });
  assert.match(verify(), /stats-history\.json.*heroes\.json|heroes\.json.*stats-history\.json/);
  writeData("stats-history", [entry, { ...prior, label: "unexpected history change" }]);
  assert.throws(verify, error => error.status === 1 && /其他历史改动/.test(error.stderr));
  writeData("stats-history", [entry, prior]);
  writeFileSync(join(directory, "equipment.json"), JSON.stringify({ ...equipment, special: {} }));
  assert.throws(verify, error => error.status === 1 && /归档文件与本轮采集快照不一致/.test(error.stderr));
});

test("an edited module must align to the active batch and preserve available build metadata", () => {
  const files = ["site/data/guide-family-stats.json"];
  const summary = entry => ({
    ok: true, currentPatch: { patch: "19.1c", build: "6035832" },
    modules: [{ id: "guide-family-stats", file: "data/guide-family-stats.json", patch: "19.1c",
      build: "6035832", alignment: "aligned", ...entry }],
  });
  assert.doesNotThrow(() => verifyAlignment(files, summary({})));
  assert.throws(() => verifyAlignment(files, summary({ build: null })), /未对齐/);
  assert.throws(() => verifyAlignment(files, summary({ build: "6037882" })), /未对齐/);
  assert.throws(() => verifyAlignment(files, summary({ alignment: "lagging" })), /未对齐/);
  assert.throws(() => verifyAlignment(files, { ...summary({}), ok: false }), /状态摘要/);
});

test("the all profile requires a receipt and a valid status for every selected collector even without a diff", () => {
  const modules = automaticRefreshModules("all");
  const summary = {
    ok: true,
    currentPatch: { patch: "19.1c", build: "6035832" },
    modules: modules.map(id => ({ id, file: `data/${id}.json`, patch: "19.1c", build: "6035832", alignment: "aligned" })),
  };
  const complete = { profile: "all", modules };
  assert.ok(modules.includes("emblem-stats"));
  assert.ok(!modules.includes("patch-recommendation-stats"));
  assert.doesNotThrow(() => verifyCollectedModules("all", complete, summary));
  assert.throws(() => verifyCollectedModules("all", undefined, summary), /采集回执/);
  assert.throws(() => verifyCollectedModules("all", { ...complete, profile: "daily" }, summary), /采集回执/);
  assert.throws(() => verifyCollectedModules("all", { ...complete, modules: modules.filter(id => id !== "emblem-stats") }, summary), /未完整.*emblem-stats/);
  assert.throws(() => verifyCollectedModules("all", { ...complete, modules: [...modules, modules[0]] }, summary), /重复或意外/);
  assert.throws(() => verifyCollectedModules("all", complete, {
    ...summary, modules: summary.modules.filter(module => module.id !== "emblem-stats"),
  }), /emblem-stats.*未对齐/);
});

test("auto-refresh continuity blocks dropped bindings, baseline losses, and incomplete trend batches", () => {
  const row = (clusterId, sectionId, teamId, extra = {}) => ({
    clusterId, sectionId, teamId, games: 250, mean: 4.15, ...extra,
  });
  const baseRows = [
    row("429002", "sample-block-0243", "t-viego"),
    row("429018", "sample-block-1110", "t-jinx"),
    row("429003", "sample-block-0051", "t-jhin"),
    row("429055", "sample-block-0235", "t-zeri"),
    row("429033", "sample-block-0064", "t-kennen", { heroAugment: true }),
  ];
  const baseline = { ...family, patch: "19.1c", rows: baseRows, smallSamples: [] };
  const candidate = { ...baseline, updatedAt: "2026-11-26T12:00:00Z" };
  const bindings = { model: 429, rows: baseRows.map(({ clusterId, sectionId, teamId }) => ({ clusterId, sectionId, teamId })) };
  const batchId = "429|19.1c|3|2026-11-26T12:00:00.000Z";
  const trend = {
    batches: [{ id: batchId, model: 429, capturedAt: candidate.updatedAt }],
    series: baseRows.filter(r => !r.heroAugment).map(r => ({
      id: `${r.sectionId}:${r.teamId}`,
      points: [{ batchId, clusterId: r.clusterId, games: r.games, mean: r.mean }],
    })),
  };

  assert.doesNotThrow(() => verifyFamilyContinuity(baseline, candidate, {
    bindings, trend, checkTrends: true, familyChanged: true,
  }));

  // Missing bound cluster (429002 dropped) -> hard fail
  const droppedViego = { ...candidate, rows: baseRows.slice(1) };
  assert.throws(() => verifyFamilyContinuity(baseline, droppedViego, { bindings }), /缺少已绑定分组.*429002/);
  assert.throws(() => verifyFamilyContinuity(baseline, droppedViego, {}), /较已发布基线丢失分组.*429002/);

  // Moving to smallSamples (<100 games) is allowed without tripping missing-binding breaker
  const smallZeri = {
    ...candidate,
    rows: baseRows.filter(r => r.clusterId !== "429055"),
    smallSamples: [{ ...baseRows[3], games: 40 }],
  };
  assert.doesNotThrow(() => verifyFamilyContinuity(baseline, smallZeri, { bindings }));

  // Trend batch missing one regular comp's point -> hard fail even if comp-trends.json was not staged (checkTrends: false, familyChanged: true)
  const incompleteTrend = { ...trend, series: trend.series.slice(1) };
  assert.throws(() => verifyFamilyContinuity(baseline, candidate, {
    bindings, trend: incompleteTrend, checkTrends: false, familyChanged: true,
  }), /缺少活跃体系采样点.*sample-block-0243:t-viego/);

  // Binding model mismatch must throw instead of silently degrading
  assert.throws(() => verifyFamilyContinuity(baseline, candidate, {
    bindings: { ...bindings, model: 430 },
  }), /候选体系模型与绑定映射表不一致/);

  // Cross-subpatch early refresh with <4 qualified rows (rest in smallSamples) must not false-trip
  const earlyNextPatch = {
    ...candidate,
    patch: "19.1d",
    rows: baseRows.slice(0, 2),
    smallSamples: baseRows.slice(2).map(r => ({ ...r, games: 20 })),
  };
  assert.doesNotThrow(() => verifyFamilyContinuity(baseline, earlyNextPatch, { bindings }));
});

test("refresh alert probe flags missing bound clusters and homepage recommendations without needing local review.json", () => {
  const familyStats = {
    set: "TFTSet19", queue: "PBE", patch: "19.1c", build: "6035832", model: 429,
    updatedAt: "2026-11-26T12:00:00Z",
    rows: [{ clusterId: "429018", sectionId: "sample-block-1110", name: "爵士金克丝", games: 8000, mean: 4.12 }],
    smallSamples: [],
  };
  const bindings = {
    model: 429,
    rows: [
      { clusterId: "429018", sectionId: "sample-block-1110", name: "爵士金克丝" },
      { clusterId: "429002", sectionId: "sample-block-0243", name: "六舞者佛耶戈" },
    ],
  };
  const recommendations = {
    seasonId: "s19-pbe",
    build: "6035832",
    entries: [
      { sectionId: "sample-block-1110", status: "recommended" },
      { sectionId: "sample-block-0243", status: "recommended" },
    ],
  };
  const report = summarizeRefresh({
    current,
    trends: { batches: [{ id: "b1", capturedAt: "2026-11-26T12:00:00Z", patch: "19.1c", build: "6035832", model: 429 }] },
    family: familyStats,
    bindings,
    recommendations,
  });
  assert.equal(report.needsAttention, true);
  assert.ok(report.alerts.some(alert => /已绑定体系缺失战绩.*429002 六舞者佛耶戈/.test(alert)));
  assert.ok(report.alerts.some(alert => /首页推荐阵容缺少有效体系战绩.*sample-block-0243/.test(alert)));
  assert.match(formatDotSummary(report), /^● 待核对/);
});
