import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

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
  assert.deepEqual(routes.map(route => [route.teamId, route.stageHref]), [
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
  assert.equal(routes.length, 1);
  assert.equal(routes[0].stageHref, "/guides/guide?team=final&stage=mid");
  assert.equal(routes[0].opening.length, 6);
  assert.equal(routes[0].final.length, 8);
});
