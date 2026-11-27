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
  for (const entry of state.modules) {
    assert.equal(entry.file, `data/${entry.id}.json`);
    assert.ok(entry.records > 0 && entry.sampledAt);
    assert.ok(["aligned", "lagging"].includes(entry.alignment));
    assert.ok(entry.script?.startsWith("scripts/") || entry.id.startsWith("patch-recommendation"));
    if (entry.updatedAtUtc8) assert.match(entry.updatedAtUtc8, /\+08:00$/);
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

test("the gate validates active recommendation overrides and accepts ordinary advice beyond the homepage capacity", t => {
  const cwd = fixture(t);
  const file = join(cwd, "data", "patch-recommendations.json");
  const sections = readJson(join(cwd, "data", "public-preview.json")).sections.filter(section => section.team?.id);
  const entry = (section, group) => ({
    sectionId: section.id, teamId: section.primaryTeamId ?? section.team.id, status: "recommended", note: "来牌顺再玩", group,
  });
  const regular = sections.filter(section => section.category !== "英雄强化阵容").slice(0, 16)
    .map((section, index) => entry(section, ["reroll", "fast8", "fast9"][index % 3]));
  const heroes = sections.filter(section => section.category === "英雄强化阵容").slice(0, 3)
    .map(section => entry(section, "heroAugment"));
  const { seasonId, build, reviewedAt, reviewedRollingPatch } = readJson(file);
  const batch = { seasonId, build, reviewedAt, reviewedRollingPatch, entries: [...regular, ...heroes] };
  writeFileSync(file, JSON.stringify(batch));
  assert.equal(run(cwd, "--verify").status, 0);

  const original = structuredClone(batch);
  const twelve = [...regular.slice(0, 10), ...heroes.slice(0, 2)].map(row => ({ ...row, override: "include" }));
  writeFileSync(file, JSON.stringify({ ...batch, entries: twelve }));
  assert.equal(run(cwd, "--verify").status, 0);
  writeFileSync(file, JSON.stringify({ ...batch, entries: [...twelve, { ...regular[10], override: "pin" }] }));
  assert.ok(JSON.parse(run(cwd, "--verify").stdout).errors.some(error => /合计最多 12 套/.test(error)));
  const landing = sections.find(section => section.id === "sample-block-1110");
  const landingPin = { ...entry(landing, "fast8"), teamId: landing.stageTeamIds[0], override: "pin" };
  writeFileSync(file, JSON.stringify({ ...batch, entries: [...batch.entries, landingPin] }));
  assert.equal(run(cwd, "--verify").status, 0);

  for (const row of batch.entries) row.override = "include";
  regular[0].timing = ["来牌顺"];
  regular[0].upgrade = "八级稳血\n九级再补";
  regular[0].override = "unknown";
  regular[1].pinOrder = 0.5;
  regular[2].manualBadge = "\n";
  regular[3].status = "avoid";
  const followup = sections.find(section => section.id === "sample-block-1060");
  const transition = { ...entry(followup, "reroll"), teamId: followup.stageTeamIds[0], override: "pin" };
  batch.entries.push(transition);

  writeFileSync(file, JSON.stringify(batch));
  const invalid = run(cwd, "--verify");
  assert.equal(invalid.status, 1);
  const { errors } = JSON.parse(invalid.stdout);
  for (const expected of [/\.timing/, /\.upgrade/, /\.override.*须为/, /\.pinOrder/, /\.manualBadge/,
    /过渡盘/, /次选棋盘/, /合计最多 12 套，其中英雄强化最多 2 套/]) {
    assert.ok(errors.some(error => expected.test(error)), expected);
  }

  heroes[0].group = "fast8";
  writeFileSync(file, JSON.stringify(batch));
  assert.ok(JSON.parse(run(cwd, "--verify").stdout).errors.some(error => /\.group.*分类不匹配/.test(error)));

  for (const entry of original.entries) delete entry.group;
  writeFileSync(file, JSON.stringify(original));
  assert.equal(run(cwd, "--verify").status, 0);

  writeFileSync(file, JSON.stringify({ ...original, entries: [] }));
  assert.equal(run(cwd, "--verify").status, 0);
});

test("the homepage warns when the current native cohort plus valid overrides has fewer than four home guides", t => {
  const cwd = fixture(t);
  const file = join(cwd, "data", "patch-recommendations.json");
  const familyFile = join(cwd, "data", "guide-family-stats.json");
  const mapFile = join(cwd, "data", "guide-family-map.json");
  const raw = readJson(file);
  const family = readJson(familyFile);
  const familyMap = readJson(mapFile);
  const writeCohort = rows => {
    const ids = new Set(rows.map(row => String(row.clusterId)));
    writeFileSync(familyFile, JSON.stringify({ ...family, rows, smallSamples: [] }));
    writeFileSync(mapFile, JSON.stringify({
      ...familyMap,
      rows: familyMap.rows.filter(row => ids.has(String(row.clusterId))),
    }));
  };
  const kept = family.rows.filter(row => ["429018", "429003", "429024"].includes(String(row.clusterId)));
  assert.equal(kept.length, 3);
  writeCohort(kept);
  const check = (overrides, fields = {}) => {
    const overrideKeys = new Set(overrides.map(({ teamId }) => teamId));
    writeFileSync(file, JSON.stringify({ ...raw, ...fields,
      entries: [...raw.entries.filter(entry => !overrideKeys.has(entry.teamId)), ...overrides],
    }));
    const result = run(cwd, "--verify");
    assert.equal(result.status, 0, result.stdout || result.stderr);
    return JSON.parse(result.stdout).warnings;
  };
  const lowCount = warnings => warnings.find(warning => /本版推荐达线及手动入榜仅/.test(warning));
  assert.match(lowCount(check([])), /仅 2 套/);

  const first = raw.entries.find(entry => entry.sectionId === "sample-block-0338");
  const second = raw.entries.find(entry => entry.sectionId === "sample-block-0854");
  const manual = [{ ...first, override: "pin", pinOrder: 1 }, { ...second, override: "include", manualBadge: "站主推荐" }];
  assert.equal(lowCount(check(manual)), undefined);
  const jinxAdvice = raw.entries.find(entry => entry.sectionId === "sample-block-1110");
  const jinx = kept.find(row => row.sectionId === jinxAdvice.sectionId);
  for (const teamId of [jinx.teamId, jinx.landingTeamId]) {
    const excluded = { ...jinxAdvice, teamId, override: "exclude" };
    assert.match(lowCount(check([...manual, excluded])), /仅 3 套/);
  }
  const jhinAdvice = raw.entries.find(entry => entry.sectionId === "sample-block-0051");
  const jhin = kept.find(row => row.sectionId === jhinAdvice.sectionId);
  const excludedAlias = { ...jhinAdvice, teamId: jhin.sharedTeamIds[0], override: "exclude" };
  assert.equal(lowCount(check([...manual, excludedAlias])), undefined);

  const hero = family.rows.find(row => row.heroAugment && row.games >= 100 && row.mean <= 4.40);
  assert.ok(hero);
  writeCohort([...kept, hero]);
  assert.match(lowCount(check([])), /仅 3 套/);
  assert.equal(lowCount(check(manual.slice(0, 1))), undefined);
  writeCohort(kept);

  const { effectiveAt } = readJson(join(cwd, "data", "current-patch.json"));
  const older = new Date(Date.parse(effectiveAt) - 1000).toISOString();
  const stale = check(manual, { build: String(Number(raw.build) - 1), reviewedAt: older });
  assert.match(lowCount(stale), /仅 0 套/);
});

test("the gate rejects dropped bound clusters and invalid family-map board references", t => {
  const cwd = fixture(t);
  const familyFile = join(cwd, "data", "guide-family-stats.json");
  const mapFile = join(cwd, "data", "guide-family-map.json");
  const family = readJson(familyFile);
  const familyMap = readJson(mapFile);

  // Dropping 429002 (Mosher Viego) from guide-family-stats.json while bound in guide-family-map.json must fail data:verify
  writeFileSync(familyFile, JSON.stringify({
    ...family,
    rows: family.rows.filter(row => String(row.clusterId) !== "429002"),
  }));
  const dropped = run(cwd, "--verify");
  assert.equal(dropped.status, 1);
  assert.ok(JSON.parse(dropped.stdout).errors.some(error => /缺少已绑定体系 429002/.test(error)));

  // Moving a bound cluster (<100 games) into smallSamples keeps it accounted for and passes
  const viego = family.rows.find(row => String(row.clusterId) === "429002");
  const smallViego = { ...viego, places: [10, 10, 10, 10, 5, 5, 0, 0], games: 50, mean: 3.1 };
  writeFileSync(familyFile, JSON.stringify({
    ...family,
    rows: family.rows.filter(row => String(row.clusterId) !== "429002"),
    smallSamples: [smallViego],
  }));
  assert.equal(run(cwd, "--verify").status, 0);

  // Broken board ID in guide-family-map.json must fail data:verify
  writeFileSync(familyFile, JSON.stringify(family));
  const brokenMap = structuredClone(familyMap);
  brokenMap.rows[0].teamId = "00000000-0000-4000-8000-deadbeef0000";
  writeFileSync(mapFile, JSON.stringify(brokenMap));
  const invalidBoard = run(cwd, "--verify");
  assert.equal(invalidBoard.status, 1);
  assert.ok(JSON.parse(invalidBoard.stdout).errors.some(error => /guide-family-map\.json\.rows\[0\]\.teamId/.test(error)));
});

test("guide-placement refresh preserves existing stats on transient single-board zero counts and aborts on mass zeros", () => {
  const pyCandidates = process.platform === "win32" ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
  const py = pyCandidates.find(([cmd, ...flags]) =>
    spawnSync(cmd, [...flags, "-c", "import sys"], { stdio: "ignore" }).status === 0);
  assert.ok(py, "Python 3 required");
  const [cmd, ...flags] = py;
  const script = [
    "import importlib.util, pathlib, sys",
    "sys.path.insert(0, 'scripts')",
    "spec = importlib.util.spec_from_file_location('rgd', pathlib.Path('scripts/refresh-guide-distributions.py'))",
    "mod = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(mod)",
    "r1 = {'url': 'u1', 'games': 915, 'mean': 3.97, 'topFourRate': 0.58, 'winRate': 0.14, 'placementCounts': [128,150,140,113,110,100,94,80], 'observedOn': '2026-11-26'}",
    "r2 = {'url': 'u2', 'games': 0, 'placementCounts': [0]*8, 'observedOn': '2026-11-26'}",
    "preserved = mod.apply_refreshed_counts([r1, r2], {'u1': [0]*8, 'u2': [10,10,0,0,0,0,0,0]}, '2026-11-27')",
    "assert preserved == ['u1'] and r1['games'] == 915 and r1['mean'] == 3.97 and r1['observedOn'] == '2026-11-26'",
    "assert r2['games'] == 20 and r2['mean'] == 1.5 and r2['observedOn'] == '2026-11-27'",
    "active = [{'url': f'a{i}', 'games': 120, 'placementCounts': [15]*8, 'observedOn': '2026-11-26'} for i in range(3)]",
    "try:",
    "    mod.apply_refreshed_counts(active, {f'a{i}': [0]*8 for i in range(3)}, '2026-11-27')",
    "    raise AssertionError('expected ValueError on mass unexpected zeros')",
    "except ValueError as exc:",
    "    assert 'unexpectedly returned 0 games' in str(exc)",
  ].join("\n");
  const res = spawnSync(cmd, [...flags, "-X", "utf8", "-c", script], { cwd: site, encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout);
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
