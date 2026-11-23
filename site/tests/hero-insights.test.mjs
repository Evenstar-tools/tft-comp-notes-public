import assert from "node:assert/strict";
import test from "node:test";
import { commonHeroItems, rankHeroes } from "../domain/hero-insights.ts";

test("ranks forms independently within the same cost and excludes thin samples", () => {
  const result = (mean, games = 100) => ({ games, mean, top4Rate: 0.5, winRate: 0.1 });
  const ranks = rankHeroes([
    { id: "gnar", cost: 1 }, { id: "lillia", cost: 1 },
    { id: "akali-kda", cost: 5 }, { id: "akali-true-damage", cost: 5 },
    { id: "nidalee", cost: 5 }, { id: "other", cost: 5 },
  ], {
    gnar: result(4.7), lillia: result(4.1),
    "akali-kda": result(2.8), "akali-true-damage": result(4.1),
    nidalee: result(4.1), other: result(1.1, 99),
  }, 100);
  assert.deepEqual(ranks.get("lillia"), { place: 1, total: 2 });
  assert.deepEqual(ranks.get("akali-kda"), { place: 1, total: 3 });
  assert.deepEqual(ranks.get("akali-true-damage"), { place: 2, total: 3 });
  assert.deepEqual(ranks.get("nidalee"), { place: 2, total: 3 });
  assert.equal(ranks.has("other"), false);
});

test("keeps complete items with enough wearer samples, ranked separately per form", () => {
  const samples = {
    gloves: { rows: [{ unitId: "akali-kda", games: 200 }, { unitId: "akali-true-damage", games: 99 }] },
    edge: { rows: [{ unitId: "akali-kda", games: 100, mean: 4.06, rate: 0.28, placementDelta: -0.17 }, { unitId: "akali-true-damage", games: 120, mean: null, rate: null }] },
    sword: { rows: [{ unitId: "akali-kda", games: 500 }] },
  };
  const items = new Map([["gloves", { category: "completed" }], ["edge", { category: "completed" }], ["sword", { category: "component" }]]);
  assert.deepEqual(commonHeroItems(items, samples, 100), {
    "akali-kda": [{ itemId: "gloves", games: 200 }, { itemId: "edge", games: 100, mean: 4.06, rate: 0.28, placementDelta: -0.17 }],
    "akali-true-damage": [{ itemId: "edge", games: 120 }],
  });
});
