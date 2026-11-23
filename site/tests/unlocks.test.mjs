import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hasUnlockCondition, unlockText } from "../domain/unlocks.ts";
import { updateUnlocks } from "../scripts/prepare-unlocks.mjs";

const season = JSON.parse(fs.readFileSync(new URL("../data/season.json", import.meta.url), "utf8"));

test("shop flags replace old guide conditions, keeping each Akali form independent", () => {
  const units = ["akali-kda", "akali-true-damage", "galio"].map(id => ({
    id, cost: 5, name: id, aliases: [], sourceUnlock: { text: "旧条件" },
  }));
  const snapshot = {
    build: "test", date: "2026-11-18", lockedCount: 2, traitAliases: {},
    releaseUrl: "release", guideUrl: "guide",
    units: [
      { id: "akali-kda", cost: 5, locked: true, condition: { text: "12 星", raw: "12 stars" } },
      { id: "akali-true-damage", cost: 5, locked: true, condition: { text: "375 闪耀值", raw: "375 Bling" } },
      { id: "galio", cost: 5, locked: false },
    ],
  };
  const updated = updateUnlocks({ units, traits: [] }, snapshot);
  assert.deepEqual(updated.units.filter(hasUnlockCondition).map(u => u.unlock.text), ["12 星", "375 闪耀值"]);
  assert.ok(updated.units.every(u => !u.sourceUnlock));
  assert.equal(hasUnlockCondition({ sourceUnlock: { text: "旧攻略已冻结的条件" } }), true);
  assert.equal(hasUnlockCondition({ unlock: { text: " " } }), false);
  assert.equal(unlockText({ sourceUnlock: { text: "旧资料" }, unlock: { text: "新任务" } }), "新任务");
  assert.equal(unlockText({ sourceUnlock: { text: "仅有历史资料" }, unlock: { text: " " } }), "仅有历史资料");
  assert.throws(() => updateUnlocks(updated, { ...snapshot, units: snapshot.units.slice(1) }), /roster/);
});

test("every live unlock shows resolved text, an identifiable build and valid related traits", () => {
  const ids = new Set(season.traits.map(t => t.id));
  const active = season.units.filter(hasUnlockCondition);
  const builds = new Set();
  assert.ok(active.length > 0 && active.length < season.units.length);
  for (const unit of active) {
    assert.equal(unit.sourceUnlock, undefined, unit.id);
    const build = unit.unlock.source.label.match(/\b\d+\.\d+\.\d+\.\d+\b/)?.[0];
    assert.ok(build, unit.id);
    assert.match(unit.unlock.source.url, /^https:\/\//, unit.id);
    builds.add(build);
    assert.doesNotMatch(unit.unlock.text + " " + unit.unlock.raw, /\bX+\b|<TFTCurveTable|待公布/i, unit.id);
    for (const trait of unit.unlock.traitIds ?? []) assert.ok(ids.has(trait), unit.id);
  }
  const newest = [...builds].sort((a, b) => a.localeCompare(b, "en", { numeric: true })).at(-1);
  assert.equal(newest, season.unlockRelease.build);
});
