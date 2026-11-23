import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matrixAxes, matrixCells } from "../domain/trait-matrix.ts";
import { preferredSeasonTraitNames } from "../domain/trait-names.mjs";

const read = file => JSON.parse(readFileSync(new URL("../data/" + file, import.meta.url), "utf8"));
const { units, traits } = read("season.json");
const reference = read("trait-reference.json");
const axes = matrixAxes(traits, units);
const matrix = matrixCells(units, axes);
const positions = id => [...matrix.cells].filter(([, members]) => members.some(unit => unit.id === id)).map(([key]) => key);

test("PBE trait names take priority while distinct legacy names remain searchable", () => {
  const normalized = preferredSeasonTraitNames(traits.map(trait => ({ ...trait, gameName: reference[trait.id]?.gameName })));
  const byId = new Map(normalized.map(trait => [trait.id, trait]));
  assert.deepEqual(Object.fromEntries([
    "choreographer", "beach-pop", "boy-band", "country", "hitmaker", "illbeats", "slayer", "producer", "frontman", "juggernaut",
  ].map(id => [id, byId.get(id).name])), {
    choreographer: "编舞师", "beach-pop": "海之歌", "boy-band": "幻翎BOYS", country: "乡村音乐",
    hitmaker: "制作人", illbeats: "大触打击乐", slayer: "舞者", producer: "音乐总监", frontman: "主唱", juggernaut: "主宰",
  });
  assert.ok(byId.get("beach-pop").aliases.includes("海滩流行"));
  assert.ok(byId.get("illbeats").aliases.includes("酷炫节拍"));
  assert.ok(byId.get("illbeats").aliases.includes("病拍"));
  assert.ok(!byId.get("producer").aliases.includes("制作人"));
  assert.ok(!byId.get("juggernaut").aliases.includes("主唱"));
});

test("one form occupies each of its true intersections; category placeholders and dynamic members stay distinct", () => {
  assert.equal(matrix.columns[0].id, "other-column");
  assert.deepEqual(positions("ziggs").sort(), ["hyperpop|arcanist", "hyperpop|swiftstriker"]);
  assert.deepEqual(positions("teemo"), ["hyperpop|other-column"]);
  assert.deepEqual(positions("sona"), ["other-row|collab"]);
  assert.deepEqual([...matrix.cells].filter(([key]) => key.endsWith("|collab")).flatMap(([, members]) => members.map(unit => unit.id)), ["sona"]);
  assert.deepEqual(positions("akali-kda"), ["k-da|other-column"]);
  assert.deepEqual(positions("akali-true-damage"), ["true-damage|other-column"]);
  const placements = [...matrix.cells.values()].flat().map(unit => unit.id);
  assert.equal(new Set(placements).size, units.length);
  assert.equal(placements.length, 106);
  const ziggs = units.find(unit => unit.id === "ziggs");
  const filtered = matrixCells([ziggs], axes);
  assert.deepEqual(filtered.rows.map(row => row.id), ["hyperpop"]);
  assert.deepEqual(filtered.columns.map(col => col.id).sort(), ["arcanist", "swiftstriker"]);
});

test("every real matrix header has its season icon and one explanation per displayed threshold", () => {
  for (const trait of [...axes.rows, ...axes.columns].filter(t => t.thresholds.length)) {
    assert.ok(trait.image, trait.id);
    const detail = reference[trait.id];
    assert.deepEqual(detail?.tiers.map(t => t.min), trait.thresholds, trait.id);
    assert.ok(detail.tiers.every(t => t.description.trim()), trait.id);
  }
  assert.ok(reference.hyperpop.emblem?.name);
  assert.equal(reference.collab.emblem, undefined);
});
