import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../", import.meta.url));
const archivedFiles = ["hero-stats.json", "item-wearers.json", "special-item-wearers.json"];

function run(cwd, ...args) {
  const result = spawnSync(process.execPath, ["scripts/run-data-refresh.mjs", ...args], {
    cwd, encoding: "utf8", timeout: 20000,
  });
  if (result.error) throw result.error;
  return result;
}

function fixture(t) {
  const cwd = mkdtempSync(join(site, ".data-refresh-test-"));
  t.after(() => rmSync(cwd, { recursive: true }));
  mkdirSync(join(cwd, "scripts"));
  mkdirSync(join(cwd, "public"));
  for (const name of ["run-data-refresh.mjs", "verify-data-integrity.py", "archive-stat-period.mjs"]) {
    cpSync(join(site, "scripts", name), join(cwd, "scripts", name));
  }
  for (const name of ["data", "public/stats-history"]) {
    // Keep the JS copy path for Windows workspaces with non-ASCII directory names.
    cpSync(join(site, name), join(cwd, name), { recursive: true, filter: () => true });
  }
  return cwd;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function snapshot(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true }).map(entry => {
    const file = join(entry.parentPath, entry.name);
    return entry.isDirectory() ? [file] : [file, statSync(file).mtimeMs, readFileSync(file)];
  }).sort(([a], [b]) => a.localeCompare(b));
}

test("the committed data passes the gate and status reports all 11 modules", () => {
  const verified = run(site, "--verify");
  assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  const summary = JSON.parse(verified.stdout);
  assert.equal(summary.ok, true);
  assert.ok(summary.historyBatches > 0 && summary.checkedDistributions > 0);

  const result = run(site, "--status", "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const state = JSON.parse(result.stdout);
  assert.deepEqual(state.currentPatch, summary.currentPatch);
  assert.deepEqual(state.modules.map(({ id }) => id).sort(), [
    "hero-stats", "item-wearers", "special-item-wearers", "emblem-stats", "trait-stats",
    "guide-family-stats", "guide-placement", "guide-carry-stats", "comp-trends",
    "patch-recommendations", "patch-recommendation-stats",
  ].sort());
  for (const module of state.modules) {
    assert.equal(module.file, `data/${module.id}.json`);
    assert.ok(module.records > 0 && module.sampledAt);
    assert.ok(["aligned", "lagging"].includes(module.alignment));
    assert.ok(module.script?.startsWith("scripts/") || module.id.startsWith("patch-recommendation"));
    if (module.updatedAtUtc8) assert.match(module.updatedAtUtc8, /\+08:00$/);
  }
});

test("the gate rejects a bad histogram and a missing history archive", t => {
  const cwd = fixture(t);
  const file = join(cwd, "data", "guide-family-stats.json");
  const original = readFileSync(file);
  const family = readJson(file);
  family.rows[0].places[0] += family.rows[0].games;
  writeFileSync(file, JSON.stringify(family));
  const badDistribution = run(cwd, "--verify");
  assert.equal(badDistribution.status, 1);
  const { errors } = JSON.parse(badDistribution.stdout);
  assert.ok(errors.some(error => /guide-family-stats.*games 不符/.test(error)));
  assert.ok(errors.some(error => /guide-family-stats.*mean 与名次桶/.test(error)));

  writeFileSync(file, original);
  const [batch] = readJson(join(cwd, "data", "stats-history.json"));
  rmSync(join(cwd, "public", "stats-history", batch.id, "equipment.json"));
  const missingArchive = run(cwd, "--verify");
  assert.equal(missingArchive.status, 1);
  assert.deepEqual(JSON.parse(missingArchive.stdout).errors,
    [`public/stats-history/${batch.id}/equipment.json：文件缺失`]);
});

test("the gate validates structured recommendations and accepts legacy notes", t => {
  const cwd = fixture(t);
  const file = join(cwd, "data", "patch-recommendations.json");
  const sections = readJson(join(cwd, "data", "public-preview.json")).sections.filter(section => section.team?.id);
  const entry = ({ id, team }, group, status = "recommended") =>
    ({ sectionId: id, teamId: team.id, status, note: "来牌顺再玩", group });
  const regular = sections.filter(section => section.category !== "英雄强化阵容").slice(0, 15)
    .map((section, index) => entry(section, ["reroll", "fast8", "fast9"][index % 3], index < 14 ? "recommended" : "avoid"));
  const heroes = sections.filter(section => section.category === "英雄强化阵容").slice(0, 2)
    .map(section => entry(section, "heroAugment"));
  const { seasonId, build, reviewedAt } = readJson(file);
  const batch = { seasonId, build, reviewedAt, entries: [...regular, ...heroes],
    displayOrder: [...regular.slice(0, 14), ...heroes].map(pick => pick.teamId) };
  writeFileSync(file, JSON.stringify(batch));
  assert.equal(run(cwd, "--verify").status, 0);

  const original = structuredClone(batch);
  regular[0].timing = ["来牌顺"];
  regular[0].upgrade = "八级稳血\n九级再补";
  heroes[0].group = "fast8";
  regular.at(-1).status = "conditional";
  batch.displayOrder.push(regular[0].teamId);
  writeFileSync(file, JSON.stringify(batch));
  const invalid = run(cwd, "--verify");
  assert.equal(invalid.status, 1);
  const { errors } = JSON.parse(invalid.stdout);
  for (const expected of [/\.timing/, /\.upgrade/, /\.group.*分类不匹配/, /常规推荐最多 14 套/, /\.displayOrder.*重复/]) {
    assert.ok(errors.some(error => expected.test(error)), expected);
  }

  for (const entry of original.entries) {
    delete entry.timing;
    delete entry.upgrade;
    delete entry.group;
  }
  writeFileSync(file, JSON.stringify(original));
  assert.equal(run(cwd, "--verify").status, 0);
});

test("daily dry-run lists every step in order and leaves the checkout unchanged", t => {
  const cwd = fixture(t);
  const baseline = snapshot(cwd);
  const result = run(cwd, "--profile", "daily", "--dry-run");
  assert.equal(result.status, 0, result.stderr);
  const steps = result.stdout.trim().split(/\r?\n/).slice(1);
  assert.deepEqual(steps.map(line => line.split(" · ")[0].replace(/^\d+\. /, "")), [
    "hero-stats", "item-wearers", "special-item-wearers", "guide-placement", "trait-stats",
    "guide-family-stats + comp-trends", "guide-carry-stats",
    "patch-recommendations", "patch-recommendation-stats", "data:verify",
  ]);
  assert.match(steps[0], /node scripts\/prepare-hero-stats\.mjs$/);
  assert.match(steps[3], /scripts\/refresh-guide-distributions\.py$/);
  assert.match(steps[5], /scripts\/refresh-guide-families\.mjs --catalog outputs\/family-review\/catalog\.json --trends data\/comp-trends\.json$/);
  assert.match(steps.at(-1), /scripts\/verify-data-integrity\.py$/);
  const ranked = run(cwd, "--archive", "--channel", "ranked", "--patch", "19.1", "--dry-run");
  assert.equal(ranked.status, 0, ranked.stderr);
  assert.match(ranked.stdout, /archive-stat-period\.mjs --channel ranked --patch 19\.1/);
  assert.deepEqual(snapshot(cwd), baseline);
});

test("the runner restores a collected file when the gate fails", t => {
  const cwd = fixture(t);
  const file = join(cwd, "data", "comp-trends.json");
  const original = readFileSync(file);
  writeFileSync(join(cwd, "scripts", "refresh-comp-trends.mjs"), [
    'import { writeFileSync } from "node:fs";',
    'writeFileSync("data/comp-trends.json", "{}");',
  ].join("\n"));
  const result = run(cwd, "--module", "comp-trends");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /comp-trends\.json.*series 缺失/);
  assert.deepEqual(readFileSync(file), original);
  assert.ok(!readdirSync(join(cwd, "data")).some(name => name.endsWith(".lock") || name.endsWith(".rollback")));
});

test("the archive writer recreates heroes and equipment archives from one batch", t => {
  const cwd = fixture(t);
  const latest = readJson(join(cwd, "data", "stats-history.json")).find(batch => batch.channel === "pbe");
  if (!latest) return t.skip("no committed PBE archive to replay");
  const directory = join(cwd, "public", "stats-history", latest.id);
  const heroes = readJson(join(directory, "heroes.json"));
  const equipment = readJson(join(directory, "equipment.json"));
  const current = readJson(join(cwd, "data", "current-patch.json"));
  if (current.seasonId !== `${latest.season}-pbe` || current.build !== latest.build) {
    return t.skip("active snapshots and the most recent PBE archive have different batch keys");
  }
  const expected = [heroes, equipment.standard, equipment.special];
  rmSync(join(directory, "heroes.json"));
  rmSync(join(directory, "equipment.json"));
  const historyFile = join(cwd, "data", "stats-history.json");
  const historyBefore = readJson(historyFile);
  writeFileSync(historyFile, JSON.stringify(historyBefore.filter(batch => batch.id !== latest.id), null, 2) + "\n");
  for (const [index, file] of archivedFiles.entries()) {
    writeFileSync(join(cwd, "data", file), JSON.stringify(expected[index]));
  }
  const result = spawnSync(process.execPath, ["scripts/archive-stat-period.mjs", "--channel", "pbe"], {
    cwd, encoding: "utf8", timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(readJson(join(directory, "heroes.json")), heroes);
  assert.deepEqual(readJson(join(directory, "equipment.json")), equipment);
  assert.ok(readJson(historyFile).some(batch => batch.id === latest.id));
  assert.equal(run(cwd, "--verify").status, 0);
});
