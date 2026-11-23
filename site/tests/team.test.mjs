import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { guideBoardKind, relatedUnitIds, traitCounts, movePiece, teamFromCombo, teamText, usedPopulation, mixedForms, conflictingForm, switchForm } from "../domain/team.ts";
import { readTeamStage, writeTeamStage } from "../domain/team-stages.ts";
const season = JSON.parse(
  fs.readFileSync(new URL("../data/season.json", import.meta.url), "utf8"),
);

test("editing three stages keeps board contents separate and the latest populated board at the root", () => {
  const original = { id: "legacy", name: "原阵容", revision: 4, pieces: [{unitId:"jinx", position:20, stars:2, items:["bow"]}], instrumentPositions: { maracas: 15 } };
  const early = { pieces: [{unitId:"neeko", position:3, stars:1, items:[]}] };
  const mid = { pieces: [{unitId:"jax", position:13, stars:3, items:["vest"]}], instrumentPositions: {rainstick: 18} };
  const edit = (root, stage, changes) => writeTeamStage(root, stage, {...readTeamStage(root, stage), ...changes});
  const stages = edit(edit(original, "early", early), "mid", {...mid, name:"新名字"});
  assert.deepEqual(readTeamStage(stages, "late"), {...original, name:"新名字"});
  assert.deepEqual(stages.stages, {early, mid});
  assert.equal(readTeamStage(stages, "early").instrumentPositions, undefined);
  assert.deepEqual(readTeamStage(JSON.parse(JSON.stringify(stages)), "mid").instrumentPositions, mid.instrumentPositions);
  assert.deepEqual(edit(original, "late", {name:"新名字"}), {...original, name:"新名字"});
  const removed = edit(stages, "late", {pieces:[]});
  assert.equal(removed.mainStage, "mid");
  assert.deepEqual(removed.stages, {early});
  assert.deepEqual(removed.pieces, mid.pieces);
  assert.deepEqual(removed.instrumentPositions, mid.instrumentPositions);
  assert.deepEqual(readTeamStage(removed, "late").pieces, []);
  const onlyEarly = edit(removed, "mid", {pieces:[]});
  assert.equal(onlyEarly.mainStage, "early");
  assert.equal(onlyEarly.stages, undefined);
  assert.deepEqual(edit(onlyEarly, "early", {pieces:[]}), {id:"legacy", name:"新名字", revision:4, pieces:[]});
});
test("every hero and trait reference has a unique resolvable identity", () => {
  assert.equal(new Set(season.units.map((unit) => unit.id)).size, 94);
  assert.equal(new Set(season.units.map((unit) => unit.nameEn)).size, 93);
  const traitIds = new Set(season.traits.map((trait) => trait.id));
  for (const unit of season.units)
    for (const id of unit.traits)
      assert.ok(traitIds.has(id), `${unit.id} -> ${id}`);
});
test("grid highlights direct shared traits without transitive expansion", () => {
  const units = [
    { id: "a", traits: ["x", "y"] },
    { id: "b", traits: ["x", "z"] },
    { id: "c", traits: ["y"] },
    { id: "d", traits: ["z"] },
  ];
  assert.deepEqual([...relatedUnitIds("a", units)], ["a", "b", "c"]);
  assert.equal(relatedUnitIds(null, units).size, 0);
});
test("duplicate unit and alternate form do not inflate trait counts; KDA uses stars", () => {
  const units = [
    { id: "a", nameEn: "A", traits: ["kda", "front"] },
    { id: "a-alt", nameEn: "A", traits: ["kda", "front"] },
    { id: "b", nameEn: "B", traits: ["kda", "collab"] },
  ];
  const traits = [
    { id: "kda", countMode: "stars", thresholds: [3, 5] },
    { id: "front", thresholds: [2] },
    { id: "collab", dynamic: true, thresholds: [1] },
  ];
  const pieces = [
    { unitId: "a", stars: 2, items: [] },
    { unitId: "a-alt", stars: 1, items: [] },
    { unitId: "b", stars: 3, items: [] },
  ];
  const counts = traitCounts(pieces, units, traits, []);
  assert.equal(counts.find((t) => t.id === "kda").count, 5);
  assert.equal(counts.find((t) => t.id === "front").count, 1);
  assert.equal(counts.find((t) => t.id === "collab").active, false);
});
test("moving onto an occupied board slot swaps and preserves equipment and stars", () => {
  const pieces = [
    { instanceId: "a", position: 0, stars: 3, items: ["sword"] },
    { instanceId: "b", position: 7, stars: 1, items: [] },
  ];
  assert.deepEqual(movePiece(pieces, "a", 7), [
    { ...pieces[0], position: 7 },
    { ...pieces[1], position: 0 },
  ]);
  assert.equal(movePiece(pieces, "a", 28), pieces);
});
test("quest-only tiers stay separate from headcount, while ordinary seven-member tiers still activate", () => {
  function count(id, stars) {
    const members = season.units.filter(unit => unit.traits.includes(id));
    const pieces = members.map(unit => ({unitId:unit.id, stars, items:[]}));
    return traitCounts(pieces, season.units, season.traits, []).find(trait => trait.id === id);
  }
  const kda = count("k-da", 3);
  assert.ok(kda.count >= 21);
  assert.equal(kda.level, 15);
  const ionic = count("ionic-spark", 1);
  assert.equal(ionic.count, 10);
  assert.equal(ionic.level, 7);
  for (const [id, expected] of [["heartsteel",7],["pentakill",7],["true-damage",5]]) {
    assert.equal(count(id, 1).level, expected);
  }
  assert.equal(count("collab", 1).active, false);
});
test("population uses deployed instances and Baron occupies two slots in text and totals", () => {
  const pieces = ["baron-nashor","neeko","lucian","jax","alune","mel","leona"].map((unitId, position) => ({unitId,position,stars:1,items:[]}));
  assert.equal(usedPopulation(pieces), 8);
  const text = teamText({name:"八人口", pieces}, season.units, season.traits, season.items);
  assert.match(text, /\n8 人口\n/);
  const solo = teamText({name:"单独上场", pieces:[{...pieces[0],unitId:"jinx"}]}, season.units, season.traits, []);
  assert.doesNotMatch(solo, /已开常规/);
  assert.match(solo, /未达档/);
});
test("replacing an Akali form preserves copies, items, position and star level", () => {
  const a = { unitId:"akali-kda", instanceId:"a", position:13, stars:3, items:["sword"] };
  const b = { ...a, unitId:"akali-true-damage", instanceId:"b", position:7 };
  assert.equal(conflictingForm([a], b.unitId), a);
  assert.equal(mixedForms([a,b]), true);
  const fixed = switchForm([a,b], b.unitId);
  assert.deepEqual(fixed,[{...a,unitId:b.unitId},b]);
  assert.equal(mixedForms(fixed), false);
  assert.equal(conflictingForm(fixed, b.unitId), undefined);
});
test("combo links construct a separate valid roster at the promised stars", () => {
  const code = "ziggs.neeko:2.lucian.tristana.jax.alune.mel.leona";
  const draft = teamFromCombo(code, season.units, season.traits);
  assert.ok(draft);
  assert.equal(draft.pieces.find(p=>p.unitId==="neeko").stars, 2);
  assert.equal(new Set(draft.pieces.map(p=>p.position)).size, 8);
  assert.equal(usedPopulation(draft.pieces),8);
  assert.equal(draft.revision,0);
  assert.notEqual(teamFromCombo(code, season.units, season.traits).id, draft.id);
  for (const invalid of [code+".bad", code.replace("neeko:2","ziggs"), code.replace(":2",":3"), code.replace("jax","missing"), "jinx"]) assert.equal(teamFromCombo(invalid, season.units, season.traits),null);
});

test("the public guide catalog treats a capped Jinx board as a final board and a leveling board as a transition", () => {
  const board = (id, size) => ({ id, pieces: Array.from({length:size}, () => ({unitId:"jinx"})), boardRole:"stage" });
  const main = board("eight", 8), cap = board("nine", 9), leveling = board("seven", 7);
  const section = {stageTeamIds:["nine", "seven"]};
  assert.deepEqual([main, cap, leveling].map(team => guideBoardKind(section, team, main)), ["主阵", "上限", "过渡"]);
  assert.equal(guideBoardKind({stageTeamIds:[]}, leveling, main), "变阵");
  assert.equal(guideBoardKind({}, leveling, main), "过渡");
});
