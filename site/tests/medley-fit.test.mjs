import test from "node:test";
import assert from "node:assert/strict";
import { buildMedleyFits } from "../domain/medley-fit.ts";

const units = Object.entries({
  a: 1, b: 2, c: 3, late: 4, high: 5, spare: 2, sona: 7, gnar: 1, zoe: 1, "kai-sa": 3, lux: 3, ezreal: 2,
}).map(([id, cost]) => ({ id, cost }));
const rageblade = "TFT_Item_GuinsoosRageblade";
const shojin = "TFT_Item_SpearOfShojin";
const armor = "TFT_Item_BrambleVest";
const shred = "TFT_Item_StatikkShiv";
const items = [rageblade, shojin, armor, shred, "TFT_Item_GuardianAngel"].map(id => ({ id, category: "completed" }));
const piece = (unitId, items = [], alternate) => ({ unitId, items, alternate });
const group = { number: 1, unitIds: ["a", "b", "c", "late", "high", "spare", "gnar", "zoe"] };
const route = (sectionId, opening, final, openingCarryIds = [], finalCarryIds = [], teamId = sectionId) => ({
  sectionId, teamId, title: sectionId, stageLabel: "六级", stageHref: "/opening/" + teamId, finalHref: "/final/" + teamId,
  opening, final, openingCarryIds, finalCarryIds,
});
const picks = (...routes) => buildMedleyFits([group], routes, units, items)[1];

test("terminal counts actual distinct Medley champions, late check requires newly fielded high costs, and finalBoard marks members", () => {
  const [fit] = picks(route("fit",
    [piece("a"), piece("a"), piece("b"), piece("sona"), piece("late")],
    [piece("a"), piece("a"), piece("sona"), piece("late"), piece("high"), piece("lux", [], piece("spare"))]));
  assert.deepEqual(fit.openingIds, ["a", "b", "late", "sona"]);
  assert.deepEqual(fit.finalIds, ["a", "late", "high", "sona"]);
  assert.deepEqual(fit.cheapIds, ["a"]);
  assert.deepEqual(fit.lateIds, ["high"]);
  assert.equal(fit.openingCount, 4);
  assert.equal(fit.score, 2);
  assert.equal(fit.tier, "core");
  assert.equal(fit.finalBoard.length, 5);
  assert.equal(fit.finalBoard.find(p => p.unitId === "high")?.isLateMedley, true);
  assert.equal(fit.finalBoard.find(p => p.unitId === "lux")?.isMedley, false);

  const [alreadyFielded] = picks(route("before", [piece("a"), piece("late")], [piece("a"), piece("b"), piece("late")]));
  assert.deepEqual(alreadyFielded.lateIds, []);
  assert.equal(alreadyFielded.score, 1);

  const [twoFinal] = picks(route("two final", [piece("a"), piece("b")], [piece("a"), piece("high")]));
  assert.equal(twoFinal.tier, "extra");
  assert.equal(twoFinal.score, 0);
  assert.deepEqual(picks(route("one final", [piece("a")], [piece("a")])), []);
});

test("without a stage only the confirmed terminal can score", () => {
  const { stageHref, stageLabel, ...terminal } = route("terminal", [], [piece("a"), piece("late"), piece("high")]);
  const [fit] = picks(terminal);
  assert.deepEqual(fit.openingIds, []);
  assert.deepEqual(fit.lateIds, []);
  assert.equal(fit.stageHref, undefined);
  assert.equal(fit.score, 1);
});

test("only an actual group starter's output can stay or transfer to a compatible main carry", () => {
  const loadout = [shojin, armor, shred, "TFT_Item_GuardianAngel"];
  const opener = [piece("a"), piece("b"), piece("zoe", loadout)];
  const [ap] = picks(route("AP", opener, [piece("a"), piece("b"), piece("lux", loadout)], ["zoe"], ["lux"]));
  assert.deepEqual(ap.handoff, { fromId: "zoe", toId: "lux", itemIds: [shojin] });
  const [keep] = picks(route("keep", opener, [piece("a"), piece("b"), piece("zoe", loadout)], ["zoe"], ["zoe"]));
  assert.deepEqual(keep.handoff, { fromId: "zoe", toId: "zoe", itemIds: [shojin] });
  assert.equal(keep.score, 2);
  const [ad] = picks({ ...route("AD", [piece("gnar", [rageblade])], [piece("kai-sa", [rageblade])], ["gnar"], ["kai-sa"]), guideOpening: true });
  assert.deepEqual(ad.handoff, { fromId: "gnar", toId: "kai-sa", itemIds: [rageblade], source: "guide" });

  const finished = [piece("a"), piece("b"), piece("ezreal", [shojin])];
  const [mismatch] = picks(route("cross profile", opener, finished, ["zoe"], ["ezreal"]));
  const [stillFielded] = picks(route("still fielded", opener, [piece("a"), piece("b"), piece("zoe"), piece("lux", loadout)], ["zoe"], ["lux"]));
  const [nonMember] = picks(route("not a Medley opener", [piece("a"), piece("b"), piece("lux", loadout)], opener, ["lux"], ["zoe"]));
  const [utilityOnly] = picks(route("utility only", [piece("a"), piece("b"), piece("zoe", loadout.slice(1))],
    [piece("a"), piece("b"), piece("lux", loadout.slice(1))], ["zoe"], ["lux"]));
  for (const fit of [mismatch, stillFielded, nonMember, utilityOnly]) assert.equal(fit.handoff, undefined);
});

test("returns up to five candidates with top three favored by checks and opening activation, at most one entry per guide", () => {
  const final = [piece("a"), piece("b"), piece("high")];
  const base = id => route(id, [piece("a"), piece("b")], final);
  const alternate = route("A", [piece("a"), piece("b"), piece("c")], final, [], [], "A-early");
  const fit = route("F", [piece("a"), piece("b"), piece("gnar", [rageblade])], [...final, piece("kai-sa", [rageblade])],
    ["gnar"], ["kai-sa"]);
  const routes = ["G", "E", "A", "D", "C", "H"].map(base).concat(alternate, fit);
  const ids = list => picks(...list).map(result => result.teamId);
  assert.deepEqual(ids(routes), ["F", "A-early", "C", "D", "E"]);
  assert.deepEqual(ids(routes.reverse()), ["F", "A-early", "C", "D", "E"]);
});

test("newly added or edited guides without authored role labels auto-infer carries from output items", () => {
  const newlyAdded = route(
    "brand-new-guide",
    [piece("a"), piece("b"), piece("gnar", [rageblade])],
    [piece("a"), piece("b"), piece("high"), piece("kai-sa", [rageblade])],
  );
  const [fit] = picks(newlyAdded);
  assert.equal(fit.score, 3);
  assert.deepEqual(fit.handoff, { fromId: "gnar", toId: "kai-sa", itemIds: [rageblade] });
  assert.equal(fit.finalBoard.find(p => p.unitId === "kai-sa")?.isCarry, true);
});

test("two retained low-cost champions are a fallback and unsupported groups remain empty", () => {
  const [twoLow] = picks(route("two low", [piece("a"), piece("b")], [piece("a"), piece("b")]));
  assert.equal(twoLow.score, 0);
  assert.equal(twoLow.tier, "core");
  const result = buildMedleyFits([{ number: 2, unitIds: ["spare"] }], [route("guide", [piece("a")], [piece("a")])], units, items);
  assert.deepEqual(result, { 2: [] });
});
