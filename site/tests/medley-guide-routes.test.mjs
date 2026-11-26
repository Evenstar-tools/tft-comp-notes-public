import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { buildMedleyFits } from "../domain/medley-fit.ts";

// Give the existing guide-family imports the resolution Next provides.
const resolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith("./")) throw error;
      return nextResolve(specifier + ".ts", context);
    }
  },
});
const { medleyGuideRoutes } = await import("../domain/medley-guide-routes.ts");
resolver.deregister();

const season = { id: "s19-pbe", units: [], items: [], traits: [] };
const pieces = count => Array.from({ length: count }, (_, position) => ({ unitId: "unit-" + position, position, items: [] }));
const team = (id, count) => ({ id, name: id, pieces: pieces(count) });
const section = teams => ({ id: "guide", title: "实盘路线", category: "慢搜阵容", blocks: [], kind: "guide",
  primaryTeamId: teams[0].id, teams });

test("medley only compares stages with their authored terminal board", () => {
  const main = team("main", 8), second = { ...team("parallel", 8), boardRole: "variant" };
  const early = team("main-stage", 6), side = team("parallel-stage", 5);
  const guide = { ...section([main, second, early, side]), stageTeamIds: [early.id, side.id], reroll: {
    added: [], corrected: [], advice: {}, stages: [
      { teamId: early.id, name: "6级追三", parentTeamId: main.id },
      { teamId: side.id, name: "5级追三", parentTeamId: second.id },
    ],
  } };
  const routes = medleyGuideRoutes([guide], season, season);
  assert.deepEqual(routes.filter(route => route.stageHref).map(route => [route.teamId, route.stageHref]), [
    ["main", "/guides/guide?team=main-stage"],
    ["parallel", "/guides/guide?team=parallel-stage"],
  ]);
});

test("an embedded midgame board links to its exact stage and conditional or out-of-season guides are omitted", () => {
  const final = { ...team("final", 8), stages: { mid: { pieces: pieces(6) } } };
  const regular = section([final]);
  const gated = { ...section([{ ...final, conditions: [{ kind: "required", augmentId: "special" }] }]), id: "gated" };
  const old = { ...regular, id: "old", gameData: { ...season, id: "s18-live" } };
  const routes = medleyGuideRoutes([regular, gated, old], season, season);
  assert.equal(routes.length, 2);
  assert.equal(routes[0].stageHref, "/guides/guide?team=final&stage=mid");
  assert.equal(routes[0].opening.length, 6);
  assert.equal(routes[0].final.length, 8);
  assert.equal(routes[1].stageHref, undefined);
  assert.deepEqual(routes[1].opening, []);
});

test("published reviewed transitions prove Guinsoo Gnar, Shojin Zoe and the ninth-level Vi check", () => {
  const readData = name => JSON.parse(readFileSync(new URL("../data/" + name, import.meta.url), "utf8"));
  const { sections, season: publicationSeason } = readData("public-preview.json");
  const current = readData("season.json");
  const { groups } = readData("medley-groups.json");
  const routes = medleyGuideRoutes(sections, publicationSeason, current);
  const fits = buildMedleyFits(groups, routes, current.units, current.items);
  const renata = fits[18].find(fit => fit.finalHref.endsWith("000046"));
  assert.equal(renata.score, 3);
  assert.deepEqual(renata.finalIds, ["lillia", "renata-glasc", "vi"]);
  assert.deepEqual(renata.lateIds, ["vi"]);
  assert.ok(renata.stageHref.endsWith("000111"));
  const gnar = fits[28].find(fit => fit.handoff?.fromId === "gnar");
  assert.deepEqual(gnar.handoff, {
    fromId: "gnar", toId: "kai-sa", itemIds: ["TFT_Item_GuinsoosRageblade", "TFT_Item_RunaansHurricane"], source: "guide",
  });
  const opening = routes.find(route => route.guideOpening && route.stageHref === gnar.stageHref && route.finalHref === gnar.finalHref);
  assert.ok(!opening.opening.find(piece => piece.unitId === "kai-sa").items.includes("TFT_Item_GuinsoosRageblade"));
  const zoe = fits[13].find(fit => fit.handoff?.fromId === "zoe");
  assert.ok(zoe.handoff.itemIds.includes("TFT_Item_SpearOfShojin"));
  assert.ok(zoe.finalHref.endsWith("001085"));
  assert.ok(zoe.stageHref.endsWith("001126"));
  assert.equal(renata.finalBoard.length, 9);
  assert.ok(fits[23].length <= 5 && fits[23].length >= 3);
});

test("newly added, edited, or removed S19 guides automatically recompute medley fits without manual mapping", () => {
  const readData = name => JSON.parse(readFileSync(new URL("../data/" + name, import.meta.url), "utf8"));
  const current = readData("season.json");
  const { groups } = readData("medley-groups.json");

  const newGuide = {
    id: "new-s19-guide",
    title: "新上架测试阵容",
    category: "84运营",
    kind: "guide",
    blocks: [],
    primaryTeamId: "new-final",
    teams: [{
      id: "new-final",
      name: "新上架测试阵容",
      pieces: [
        { unitId: "lillia", position: 0, items: [] },
        { unitId: "renata-glasc", position: 1, items: ["TFT_Item_SpearOfShojin"] },
        { unitId: "vi", position: 2, items: [] },
        { unitId: "leona", position: 3, items: [] },
        { unitId: "k-sante", position: 4, items: [] },
        { unitId: "viego", position: 5, items: [] },
        { unitId: "nasus", position: 6, items: [] },
        { unitId: "jax", position: 7, items: [] },
      ],
      stages: {
        mid: {
          pieces: [
            { unitId: "lillia", position: 0, items: [] },
            { unitId: "renata-glasc", position: 1, items: ["TFT_Item_SpearOfShojin"] },
            { unitId: "sett", position: 2, items: [] },
            { unitId: "nasus", position: 3, items: [] },
            { unitId: "jax", position: 4, items: [] },
          ],
        },
      },
    }],
  };

  // 1. Added new guide -> automatically gets 3/3 full fit on group 18 with zero manual config
  const addedFits = buildMedleyFits(groups, medleyGuideRoutes([newGuide], current, current), current.units, current.items);
  const added = addedFits[18].find(fit => fit.sectionId === "new-s19-guide");
  assert.ok(added);
  assert.equal(added.score, 3);
  assert.equal(added.handoff?.fromId, "renata-glasc");
  assert.equal(added.finalBoard.length, 8);

  // 2. Edited guide (removed Vi from final) -> recomputed score drops and Vi disappears from finalBoard
  const editedGuide = structuredClone(newGuide);
  editedGuide.teams[0].pieces = editedGuide.teams[0].pieces.filter(p => p.unitId !== "vi");
  const editedFits = buildMedleyFits(groups, medleyGuideRoutes([editedGuide], current, current), current.units, current.items);
  const edited = editedFits[18].find(fit => fit.sectionId === "new-s19-guide");
  assert.equal(edited.score, 1);
  assert.ok(!edited.finalBoard.some(p => p.unitId === "vi"));

  // 3. Removed guide -> disappears cleanly
  const removedFits = buildMedleyFits(groups, medleyGuideRoutes([], current, current), current.units, current.items);
  assert.deepEqual(removedFits[18], []);
});
