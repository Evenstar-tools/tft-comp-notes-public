import test from "node:test";
import assert from "node:assert/strict";
import { buildMedleyFits } from "../domain/medley-fit.ts";

const units = Object.entries({ a: 1, b: 2, c: 3, d: 1, late: 4, high: 5, spare: 2, sona: 7, carry: 4 })
  .map(([id, cost]) => ({ id, cost }));
const items = [
  { id: "output", category: "completed" },
  { id: "TFT_Item_WarmogsArmor", category: "completed" },
  { id: "artifact", category: "artifact" },
  { id: "component", category: "component" },
  { id: "emblem", category: "completed", traitId: "collab" },
];
const piece = (unitId, items = [], alternate) => ({ unitId, items, alternate });
const group = { number: 1, unitIds: ["a", "b", "c", "d", "late", "high", "spare"] };
const route = (sectionId, opening, final, openingCarryIds = [], finalCarryIds = [], teamId = sectionId) => ({
  sectionId, teamId, title: sectionId, stageLabel: "六级", stageHref: "/opening/" + teamId, finalHref: "/final/" + teamId,
  opening, final, openingCarryIds, finalCarryIds,
});
const score = (...routes) => buildMedleyFits([group], routes, units, items)[1];

test("only retained fielded 1–3 costs score overlap and late additions score together once", () => {
  const [fit] = score(route("fit",
    [piece("a"), piece("a"), piece("b"), piece("c"), piece("d"), piece("sona"), piece("spare", [], piece("high"))],
    [piece("a"), piece("b"), piece("c"), piece("d"), piece("late"), piece("high"), piece("carry", [], piece("spare"))]));
  assert.deepEqual(fit.cheapIds, ["a", "b", "c", "d"]);
  assert.deepEqual(fit.lateIds, ["late", "high"]);
  assert.equal(fit.openingCount, 6);
  assert.equal(fit.score, 4);
  assert.deepEqual(score(route("only late", [piece("sona"), piece("late")], [piece("high"), piece("carry", [], piece("a"))])), []);
});

test("carry evidence keeps actual equipped output or transfers it from a departing carry", () => {
  const loadout = ["output", "TFT_Item_WarmogsArmor", "artifact", "component", "emblem"];
  const opening = [piece("a", loadout), piece("b"), piece("c", loadout)];
  const withGear = score(
    route("transfer", opening, [piece("a"), piece("b"), piece("carry", loadout)], ["c"], ["carry"]),
    route("keep", opening, [piece("a", loadout), piece("b"), piece("late")], ["a", "c"], ["a"]),
    route("still fielded", opening, [piece("a"), piece("b"), piece("c"), piece("carry", loadout)], ["c"], ["carry"]),
    route("tank items", [piece("a", loadout.slice(1))], [piece("a", loadout.slice(1))], ["a"], ["a"]),
  );
  const by = id => withGear.find(fit => fit.sectionId === id);
  assert.deepEqual(by("transfer").handoff, { fromId: "c", toId: "carry", itemIds: ["output"] });
  assert.deepEqual(by("keep").handoff, { fromId: "a", toId: "a", itemIds: ["output"] });
  assert.equal(by("keep").score, 4);
  assert.equal(by("still fielded").handoff, undefined);
  assert.equal(by("tank items").score, 1);
});

test("top five use distinct guides and prefer opening activation when scores tie", () => {
  const base = id => route(id, [piece("a")], [piece("a")]);
  const alternate = route("A", [piece("a"), piece("b"), piece("c")], [piece("a")], [], [], "A-early");
  const two = route("B", [piece("a"), piece("b")], [piece("a")]);
  const dense = route("F", [piece("a"), piece("b")], [piece("a"), piece("b")]);
  const routes = ["G", "E", "A", "D", "C"].map(base).concat(alternate, two, dense);
  const ids = (list) => score(...list).map(fit => fit.teamId);
  assert.deepEqual(ids(routes), ["F", "A-early", "B", "C", "D"]);
  assert.deepEqual(ids(routes.reverse()), ["F", "A-early", "B", "C", "D"]);
  const [best] = score(route("all", [piece("a", ["output"]), piece("b"), piece("c")],
    [piece("a", ["output"]), piece("b"), piece("c"), piece("late")], ["a"], ["a"]));
  assert.equal(best.score, 5);
});

test("a group with no supported transition has no fit", () => {
  const result = buildMedleyFits([{ number: 2, unitIds: ["spare"] }], [route("guide", [piece("a")], [piece("a")])], units, items);
  assert.deepEqual(result, { 2: [] });
});
