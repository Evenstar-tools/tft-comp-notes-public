import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { changedDataFiles, preflightReason, verifyAlignment, verifyFamilyContinuity } from "../scripts/check-auto-refresh.mjs";
import { formatDotSummary, summarizeRefresh } from "../scripts/check-refresh-alerts.mjs";

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
  assert.match(workflow, /cron: '53 2 \* \* \*'/);
  assert.match(workflow, /cron: '17 13 \* \* \*'/);
  assert.match(workflow, /'schedule:53 2 \* \* \*'\) profile=daily/);
  assert.match(workflow, /'schedule:17 13 \* \* \*'\) profile=fast/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /run-conditional-refresh\.mjs --profile "\$PROFILE" --dry-run/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ secrets\.DATA_REFRESH_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /git push|scripts\/run-data-refresh\.mjs|scripts\/publish-auto-refresh\.mjs/);
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
  assert.throws(() => changedDataFiles(" M site/data/emblem-stats.json\0", "daily"), /未授权/);
  assert.deepEqual(changedDataFiles(" M site/data/emblem-stats.json\0", "all"), ["site/data/emblem-stats.json"]);
  for (const change of [" M site/data/current-patch.json", " M site/data/patch-recommendations.json",
    " M .github/workflows/checks.yml", " D site/data/guide-family-stats.json", "?? site/data/comp-trends.json",
    "M  site/data/guide-family-stats.json", " T site/data/comp-trends.json"]) {
    assert.throws(() => changedDataFiles(change + "\0", "fast"), /未授权或非修改/);
  }
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

  // Trend batch missing one regular comp's point -> hard fail
  const incompleteTrend = { ...trend, series: trend.series.slice(1) };
  assert.throws(() => verifyFamilyContinuity(baseline, candidate, {
    bindings, trend: incompleteTrend, checkTrends: true, familyChanged: true,
  }), /缺少活跃体系采样点.*sample-block-0243:t-viego/);
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
