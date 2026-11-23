import assert from "node:assert/strict";
import test from "node:test";
import season from "../data/season.json" with { type: "json" };
import { correctRerollStars } from "../server/reroll-stars.ts";

const hyperpop = "sample-block-0420";
const renata = "sample-block-0122";
const lilliaAugment = "sample-block-0020";
function board(id, revision, ...lineup) {
  return { id, revision, pieces: lineup.map(([unitId, stars], position) => ({
    unitId, stars, position, items: [], instanceId: String(position),
  })) };
}
function stars(team) {
  return team.pieces.map(piece => piece.stars);
}

test("Hyperpop chases one-cost units at five and three two-cost units at six", () => {
  const four = board("generated", 0, ["ziggs", 2], ["kobuko", 2], ["seraphine", 2], ["swain", 1]);
  const five = { ...four, pieces: [...four.pieces, { unitId:"lulu", stars:1, items:[] }] };
  const six = { ...five, pieces: [...five.pieces, { unitId:"tristana", stars:2, items:[] }] };
  const project = team => correctRerollStars(team, season.units, hyperpop, undefined, true);
  assert.equal(project(four), four);
  assert.deepEqual(stars(project(five)), [3,3,2,1,1]);
  assert.deepEqual(stars(project(six)), [3,3,3,1,3,3]);
  assert.deepEqual(stars(six), [2,2,2,1,1,2]);
  const jazz = "00000000-0000-4000-8000-000000000098";
  assert.deepEqual(stars(correctRerollStars(six, season.units, hyperpop, jazz, true)), [3,3,2,1,1,2]);
});

test("the six-guardian augment branch inherits its own carry, leaving the other one-cost unit at two", () => {
  const five = board("generated", 0, ["lillia", 2], ["kennen", 2], ["jax", 1], ["nasus", 2], ["renata-glasc", 1]);
  const branch = "00000000-0000-4000-8000-000000000038";
  assert.deepEqual(stars(correctRerollStars(five, season.units, lilliaAugment, branch, true)), [3,2,1,2,1]);
});

test("a reviewed six-pop Renata board gains both three-stars without overwriting a later save or copy", () => {
  const six = board("00000000-0000-4000-8000-000000000118", 2, ["renata-glasc",2], ["nasus",2],
    ["jax",2], ["lillia",2], ["ksante",1], ["syndra",1]);
  const corrected = correctRerollStars(six, season.units, renata);
  assert.deepEqual(stars(corrected), [3,3,2,2,1,1]);
  assert.equal(correctRerollStars(corrected, season.units, renata), corrected);
  const saved = { ...six, revision:3 };
  const copy = { ...six, id:"new-draft" };
  assert.equal(correctRerollStars(saved, season.units, renata), saved);
  assert.equal(correctRerollStars(copy, season.units, renata), copy);
});

test("the nine-pop Hyperpop board shows all five chases and keeps Teemo at two", () => {
  const final = board("00000000-0000-4000-8000-000000000042", 5, ["ziggs",3], ["kobuko",3],
    ["seraphine",3], ["swain",2], ["lulu",2], ["tristana",2], ["teemo",2], ["garen",1], ["nidalee",1]);
  assert.deepEqual(stars(correctRerollStars(final, season.units, hyperpop)), [3,3,3,2,3,3,2,1,1]);
});
