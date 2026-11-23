import assert from "node:assert/strict";
import test from "node:test";
import { observeLobbies } from "../domain/lobby-observation.ts";

test("each target result sees only other seats and counts each opposing family once", () => {
  const first = { id: "a", build: "x", at: 2, seats: [["a", "only-on-own-board"], ["b"], ["b"], [], [], [], [], []] };
  const shared = { id: "b", build: "x", at: 1, seats: [[], ["a"], [], [], [], [], ["a"], []] };
  const result = observeLobbies([first, shared], "a");
  assert.equal(result.games, 3);
  assert.deepEqual(result.examples.map(game => game.placements), [[1], [2, 7]]);
  assert.equal(result.mean, 10 / 3);
  assert.deepEqual(result.rows.map(({id, games, mean}) => [id, games, mean]), [["a", 2, 4.5], ["b", 1, 1]]);
  assert.equal(observeLobbies([first], "missing").mean, null);
});
