import assert from "node:assert/strict";
import test from "node:test";
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
