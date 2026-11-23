import test from "node:test";
import assert from "node:assert/strict";
import { findBoardPivots } from "../domain/board-pivots.ts";
import { usedPopulation } from "../domain/team.ts";

const itemMap = new Map(["bow", "ie", "db", "tank", "rod", "armor"].map(id => [id, { id }]));
itemMap.set("rod", { category: "component" });
itemMap.set("emblem", { traitId: "k-da" });
function piece(id, instance, stars = 1, items = []) {
  return { unitId: id, instanceId: instance, position: instance, stars, items };
}
function choice(id, pieces, cores = [], section = id) {
  return { sectionId: section, population: usedPopulation(pieces), cores, team: { id, pieces } };
}
const find = (pieces, choices) => findBoardPivots(pieces, usedPopulation(pieces), choices, itemMap);

test("pivots compare adjacent populations, retain actual copies, skip identical and unrelated boards and group stages", () => {
  const source = [piece("a",1,2), piece("a",2), piece("b",3), piece("c",4)];
  const same = choice("same", [...source].reverse());
  const next = choice("next", [piece("a",6), piece("baron-nashor",7), piece("b",8), piece("c",9)]);
  const sibling = { ...next, team: { ...next.team, id: "sub" } };
  const unrelated = choice("unrelated", [piece("x",1),piece("y",2),piece("c",3),piece("z",4)]);
  const tooBig = choice("six", [...next.team.pieces, piece("extra",5)]);
  const [match] = find(source, [same, tooBig, unrelated, sibling, next]);
  assert.equal(match.candidate.sectionId, "next");
  assert.deepEqual(match.kept.map(p => p.instanceId), [1,3,4]);
  assert.deepEqual(match.added.map(p => p.unitId), ["baron-nashor"]);
  assert.deepEqual(match.removed.map(p => p.instanceId), [2]);
  assert.equal(find(source, [same,tooBig,unrelated,sibling,next]).length, 1);
  assert.deepEqual(find([], [next]), []);
});

test("locked forms remain distinct and matching favors an invested carry and its published items", () => {
  const source = [piece("akali-kda",1,3,["ie"]),piece("b",2),piece("c",3)];
  const invested = choice("c", [piece("akali-kda",4,3,["ie"]),piece("b",5),piece("x",6)],["akali-kda"]);
  const different = choice("d", [piece("akali-true-damage",4),piece("b",5),piece("c",6)]);
  const [best, other] = find(source, [different,invested]);
  assert.equal(best.candidate.sectionId, "c");
  assert.equal(other.added[0].unitId, "akali-true-damage");
  assert.equal(other.removed[0].unitId, "akali-kda");
});

test("equipment handoffs use only released copies and vacant slots, report missing emblems and preserve inputs", () => {
  const source = [piece("tank",1,2,["tank","ie","armor"]),piece("samira",2,2,["ie","rod","db"]),piece("filler",3)];
  const target = choice("jhin", [piece("tank",4,2,["tank","db"]),piece("jhin",5,2,["ie","db","emblem"]),piece("support",6,1,["ie","rod"])],["jhin","tank"]);
  const snapshot = JSON.stringify([source, target]);
  const [match] = find(source,[target]);
  assert.deepEqual(match.missingEmblems,["emblem"]);
  assert.deepEqual(match.transfers.map(t => [t.from.unitId, t.to.unitId, t.items]), [["samira","jhin",["ie","db"]]]);
  assert.equal(JSON.stringify([source,target]),snapshot);
});
