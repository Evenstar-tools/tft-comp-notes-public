import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { changedDataFiles, preflightReason, verifyAlignment } from "../scripts/check-auto-refresh.mjs";

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
  assert.match(workflow, /cron: '0 1 \* \* \*'/);
  assert.match(workflow, /cron: '0 13 \* \* \*'/);
  assert.match(workflow, /'schedule:0 1 \* \* \*'\) profile=daily/);
  assert.match(workflow, /'schedule:0 13 \* \* \*'\) profile=fast/);
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
