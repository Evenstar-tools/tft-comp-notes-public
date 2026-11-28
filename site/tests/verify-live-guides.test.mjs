import assert from "node:assert/strict";
import { test } from "node:test";
import { compareGuideCatalog, verifyRenderedBoard } from "../scripts/verify-live-guides.mjs";

const guide = { sectionId: "lineup", teamId: "eight", guide: "示意攻略", board: "八级", units: ["a", "b"] };
const variant = { ...guide, teamId: "nine", board: "九级", units: ["a", "b", "c"] };

test("a same-size catalog still reports a lost variant and a mismatched roster", () => {
  const expected = { seasonId: "s19-pbe", boards: [guide, variant] };
  const changed = { seasonId: expected.seasonId, boards: [
    { ...guide, units: ["a", "c"] }, { ...variant, teamId: "another" },
  ] };
  const errors = compareGuideCatalog(expected, changed);
  assert.match(errors.join("\n"), /漏盘.*lineup\/nine/);
  assert.match(errors.join("\n"), /错配.*lineup\/eight.*units/);
  assert.match(errors.join("\n"), /多出.*lineup\/another/);
  assert.deepEqual(compareGuideCatalog(expected, { ...expected, boards: [variant, { ...guide, units: ["b", "a"] }] }), []);
});

test("guide readback requires the requested board marker on the visible grid", () => {
  const html = `<div class="read-board" data-guide-team-id="eight"><div class="board" aria-label="4 排 7 列阵容棋盘"></div></div>`;
  assert.ok(verifyRenderedBoard(html, guide));
  assert.ok(!verifyRenderedBoard(html, variant));
  assert.ok(!verifyRenderedBoard(`<script>${html}</script>`, guide));
  assert.ok(!verifyRenderedBoard(`<div class="read-board" data-guide-team-id="eight"></div><div aria-label="4 排 7 列阵容棋盘"></div>`, guide));
});
