import assert from "node:assert/strict";
import test from "node:test";
import { appendCompTrendBatch } from "../scripts/refresh-comp-trends.mjs";

const batch = {
  seasonId: "s19-pbe", set: "TFTSet19", queue: "PBE", source: "MetaTFT",
  sourceUrl: "https://www.metatft.com/pbe-comps", patch: "19.1c", days: 3, model: 429,
  updatedAt: "2026-11-26T10:00:00Z",
};
const jinx = {
  sectionId: "ionic-jinx", teamId: "eight", clusterId: "429012", name: "Ionic Jinx",
  carryIds: ["jinx"], games: 1000, mean: 4.2, topFourRate: 0.55, winRate: 0.15,
};

function withEditorialCarry(row) {
  const history = appendCompTrendBatch(undefined, { ...batch, rows: [row] });
  history.series[0].carryIds.push("gwen");
  return history;
}

function refresh(history, row, model = batch.model) {
  return appendCompTrendBatch(history, {
    ...batch, model, updatedAt: "2026-11-27T10:00:00Z", rows: [row],
  }).series.find(series => series.teamId === row.teamId);
}

test("trend co-carries survive only on the same verified board and source cluster", () => {
  const history = withEditorialCarry(jinx);
  assert.deepEqual(refresh(history, jinx).carryIds, ["jinx", "gwen"]);
  assert.deepEqual(refresh(history, { ...jinx, clusterId: "429013" }).carryIds, ["jinx"]);
  assert.deepEqual(refresh(history, { ...jinx, teamId: "nine" }).carryIds, ["jinx"]);
  assert.deepEqual(refresh(history, jinx, 430).carryIds, ["jinx"]);
  const unverified = { ...jinx, teamId: undefined };
  assert.deepEqual(refresh(withEditorialCarry(unverified), unverified).carryIds, ["jinx"]);
});
