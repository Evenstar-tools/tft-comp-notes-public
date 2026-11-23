import test from "node:test";
import assert from "node:assert/strict";
import { itemCohort } from "../scripts/special-item-cohort.mjs";

test("item scores match the wearers' exact hotfix and day window", () => {
  const hotfix = ["19.1", "a"];
  const first = [2, 0, 0, 0, 0, 0, 0, 1];
  const second = [0, 1, 0, 0, 0, 0, 0, 0];
  const outside = Array(8).fill(100);
  const result = {
    updated: 1, queue_id: "pbe", tft_set: "TFTSet19", unit_games: [{ patch: hotfix }],
    dates: [
      { itemName: "chalice", patch: hotfix, day: 1, places: first },
      { itemName: "chalice", patch: hotfix, day: 2, places: second },
      { itemName: "chalice", patch: ["19.1", ""], day: 1, places: outside },
      { itemName: "chalice", patch: hotfix, day: 4, places: outside },
      { itemName: "another-item", patch: hotfix, day: 1, places: outside },
    ],
    units: [{ places: first }, { places: second }],
  };
  assert.deepEqual(itemCohort(result, "chalice", "19.1", 3), {
    version: "19.1a", stats: { games: 4, mean: 3, winRate: 0.5 },
  });
  // The independent daily rollup can lag behind the ranked wearers by a game.
  const newerWearers = [{ places: first }, { places: [0, 2, 0, 0, 0, 0, 0, 0] }];
  assert.equal(itemCohort({ ...result, units: newerWearers }, "chalice", "19.1", 3).stats.games, 5);
  assert.throws(() => itemCohort({ ...result, units: [{ places: outside }] }, "chalice", "19.1", 3), /disagree/);
});

test("a rolling wearer cohort may span one extra day bucket from the same hotfix", () => {
  const patch = ["19.1", "a"];
  const early = [156, 73, 63, 47, 44, 30, 16, 26];
  const boundary = [4, 8, 3, 5, 3, 3, 2, 2];
  const full = early.map((count, i) => count + boundary[i]);
  const result = {
    updated: 1, queue_id: "pbe", tft_set: "TFTSet19", unit_games: [{ patch }],
    dates: [
      { itemName: "emblem", patch, day: 3, places: early },
      { itemName: "emblem", patch, day: 4, places: boundary },
      { itemName: "emblem", patch: ["19.1", ""], day: 4, places: Array(8).fill(100) },
    ],
    units: [{ places: full }],
  };
  assert.equal(itemCohort(result, "emblem", "19.1", 3).stats.games, 485);
  assert.throws(() => itemCohort({ ...result, dates: result.dates.filter(row => row.day !== 4) }, "emblem", "19.1", 3), /disagree/);
});
