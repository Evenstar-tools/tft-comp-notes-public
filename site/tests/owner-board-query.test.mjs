import assert from "node:assert/strict";
import { test } from "node:test";
import { familyRosterMatches } from "../domain/guide-family-stats.ts";
import { boardQuerySignature, publishedBoardRefreshPlan } from "../domain/owner-board-query.ts";
import { applyBoardOverrides, publishedBoardContent } from "../domain/published-board-layout.ts";

const edition = "s19-pbe-19.1";
const build = "6045507";
const unitIds = { a: "TFT19_A", b: "TFT19_B", c: "TFT19_C" };
const piece = (unitId, position, instanceId = unitId) => ({ unitId, instanceId, position, stars: 2, items: [] });
const original = { id: "board", pieces: [piece("a", 0), piece("b", 9)] };

function published(pieces, { conditions, category = "普通攻略", source = original, items = [] } = {}) {
  return applyBoardOverrides({
    season: { id: edition, items },
    sections: [{ id: "guide", category, team: original }],
    boardOverrides: [{
      sectionId: "guide", teamId: "board", edition,
      source: publishedBoardContent(source),
      content: publishedBoardContent({ pieces, conditions }),
    }],
  });
}

test("站主挪格或重新添加同名棋子不重查，换任意实际上场棋子才重查", () => {
  const same = published([piece("b", 0), piece("a", 22, "readded")]);
  assert.equal(same.sections[0].team.publishedRosterChanged, undefined);
  assert.deepEqual(publishedBoardRefreshPlan(same, { build, records: [] }, build, unitIds), { boards: [], review: [] });

  const different = published([piece("a", 0), piece("c", 9)]);
  const board = different.sections[0].team;
  const signature = boardQuerySignature(board.pieces);
  const oldSignature = boardQuerySignature(original.pieces);
  const oldRecord = { build, conditions: { teamId: "board" }, querySignature: oldSignature };
  const plan = publishedBoardRefreshPlan(different, { build, records: [oldRecord] }, build, unitIds);
  assert.deepEqual(plan.boards, [{
    sectionId: "guide", teamId: "board", population: 2, roster: ["a", "c"],
    units: ["TFT19_A-1", "TFT19_C-1"], signature,
  }]);
  assert.deepEqual(plan.review, []);
  assert.equal(familyRosterMatches({ boardSignatures: { board: oldSignature } }, board), false);
  assert.equal(familyRosterMatches({ boardSignatures: { board: signature } }, board), true);

  const completed = { ...oldRecord, querySignature: signature };
  assert.deepEqual(publishedBoardRefreshPlan(different, { build, records: [completed] }, build, unitIds).boards, []);
  assert.equal(publishedBoardRefreshPlan(different, {
    build, records: [{ ...completed, build: "prior" }],
  }, build, unitIds).boards.length, 1);
});

test("必需条件、英雄强化与重复棋子交数据维护复核，冲突源盘不生效", () => {
  const roster = [piece("a", 0), piece("c", 9)];
  for (const publication of [
    published(roster, { conditions: [{ kind: "required", augmentId: "special" }] }),
    published(roster, { category: "英雄强化阵容" }),
    published([piece("a", 0), piece("a", 9, "other-a")]),
  ]) {
    const { boards, review } = publishedBoardRefreshPlan(publication, { build, records: [] }, build, unitIds);
    assert.deepEqual(boards, []);
    assert.equal(review[0].teamId, "board");
  }
  const signature = boardQuerySignature(roster);
  const stats = { boardSignatures: { board: signature } };
  const placement = { build, records: [{ build, conditions: { teamId: "board" }, querySignature: signature }] };
  const restricted = published(roster, { conditions: [{ kind: "required", augmentId: "special" }] });
  assert.equal(familyRosterMatches(stats, restricted.sections[0].team), false);
  assert.equal(publishedBoardRefreshPlan(restricted, placement, build, unitIds).review.length, 1);

  const sameRoster = published(original.pieces, { conditions: [{ kind: "required", augmentId: "special" }] });
  assert.equal(familyRosterMatches({ boardSignatures: { board: boardQuerySignature(original.pieces) } }, sameRoster.sections[0].team), false);
  assert.equal(publishedBoardRefreshPlan(sameRoster, { build, records: [] }, build, unitIds).review.length, 1);

  for (const itemId of ["TFT_Item_ForceOfNature", "TFT_Item_TacticiansRing", "TFT_Item_TacticiansScepter"]) {
    const withPopulation = published([{ ...roster[0], items: [itemId] }, roster[1]], {
      items: [{ id: itemId, category: "team-size" }],
    });
    const { boards, review } = publishedBoardRefreshPlan(withPopulation, placement, build, unitIds);
    assert.deepEqual(boards, []);
    assert.equal(review.length, 1);
    assert.equal(familyRosterMatches(stats, withPopulation.sections[0].team), false);
  }

  const stale = published(roster, { source: { ...original, pieces: [piece("b", 0), piece("c", 9)] } });
  assert.deepEqual(publishedBoardRefreshPlan(stale, { build, records: [] }, build, unitIds), { boards: [], review: [] });
  assert.equal(boardQuerySignature([piece("baron-nashor", 0)]), '[2,["baron-nashor"]]');
});
