import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseRoster, independentDraft } from "../domain/roster-import.ts";
import { emptyTeam, teamText, usedPopulation } from "../domain/team.ts";
const data = JSON.parse(readFileSync(new URL("../data/season.json",import.meta.url),"utf8"));
const parse = input => parseRoster(input,data.units,data.items);
test("a pasted list resolves names, English multiword names, aliases, stars and the two slots of Baron", () => {
  const p = parse("两星提莫、小炮、Ziggs ★★、Baron Nashor、K/DA阿卡丽");
  assert.deepEqual(p.errors,[]);
  assert.deepEqual(p.pieces.map(x=>[x.unitId,x.stars]),[["teemo",2],["tristana",1],["ziggs",2],["baron-nashor",1],["akali-kda",1]]);
  assert.equal(usedPopulation(p.pieces),6);
  for (const text of ["阿卡丽","错棋","小炮 小炮","提莫4星","阿卡丽（K/DA）、阿卡丽（真实伤害）","提莫 · 第5排第2格","提莫 · 第1排第1格\n小炮 · 第1排第1格"])
    assert.ok(parse(text).errors.length,text);
});
test("the editor's own exported roster round trips, including items, notes and named Akali form", () => {
  const pieces = parse("阿卡丽（K/DA） 2星 · 第3排第7格\n提莫 2星 · 第4排第3格 · 青龙刀、红霸符、虚空之杖").pieces;
  const base = {...emptyTeam(),name:"测试站位",notes:"满 900 热力后上提莫。",pieces};
  const parsed = parse(teamText(base,data.units,data.traits,data.items));
  assert.deepEqual(parsed.errors,[]); assert.deepEqual(parsed.pieces,pieces);
  assert.equal(parsed.name,base.name); assert.equal(parsed.notes,base.notes);
  const instrumentPositions = { maracas: 4, rainstick: 11 };
  const copied = independentDraft({...base,sectionId:"old",instrumentPositions},emptyTeam());
  assert.notEqual(copied.id,base.id); assert.equal(copied.sectionId,undefined);
  assert.ok(copied.pieces.every(p=>p.instanceId));
  assert.deepEqual(copied.instrumentPositions,instrumentPositions);
  assert.notEqual(copied.instrumentPositions,instrumentPositions);
  const early = { pieces: [{ ...copied.pieces[0], items: ["sword"] }], instrumentPositions: { maracas: 7 } };
  const stagedCopy = independentDraft({ ...copied, mainStage: "mid", stages: { early } }, emptyTeam());
  assert.equal(stagedCopy.mainStage, "mid");
  const extra = stagedCopy.stages.early;
  assert.deepEqual(extra.instrumentPositions, early.instrumentPositions);
  assert.notEqual(extra.pieces[0].instanceId, early.pieces[0].instanceId);
  extra.pieces[0].items.pop();
  assert.deepEqual(early.pieces[0].items, ["sword"]);
});

test("the editor imports player nicknames while retaining the requested stars", () => {
  const parsed = parse("岩雀、瞎子二星、米老鼠、男枪、酒桶、奥巴马二星");
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.pieces.map(piece => [piece.unitId, piece.stars]), [
    ["taliyah", 1], ["lee-sin", 2], ["smeech", 1], ["graves", 1], ["gragas", 1], ["lucian", 2],
  ]);
});
