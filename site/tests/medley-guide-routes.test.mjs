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
});
