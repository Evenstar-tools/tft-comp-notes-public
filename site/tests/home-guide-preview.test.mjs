import test from "node:test";
import assert from "node:assert/strict";
import { homeGuidePreview } from "../domain/home-guide-preview.ts";

test("home previews preserve the canonical board, stages and alternates in order", () => {
  const active = { instanceId: "persisted-piece", unitId: "sett", position: 7, stars: 2, items: ["tank"],
    alternate: { instanceId: "persisted-alternate", unitId: "shyvana", stars: 1, items: ["shield"] } };
  const early = { ...active, instanceId: "persisted-early", position: 4 };
  const main = { id: "main", pieces: [active], stages: { early: { pieces: [early] } }, instrumentPositions: { rainstick: 8 } };
  const variant = { id: "variant", pieces: [{ ...active, position: 4 }, { ...active, instanceId: "persisted-copy", position: 9 }] };
  const section = { id: "guide", team: { ...main, pieces: [] }, teams: [variant, main],
    blocks: [{ id: "a", type: "text", text: "前排", elements: [] }], gameData: { id: "s19-pbe" } };
  const preview = homeGuidePreview(section, { id: "s19-pbe" });

  assert.deepEqual(preview.teams.map(board => board.id), ["main", "variant"]);
  assert.deepEqual(preview.teams[0].pieces[0], { ...active, instanceId: "0",
    alternate: { ...active.alternate, instanceId: "0-alt" } });
  assert.equal(preview.teams[0].stages.early.pieces[0].position, 4);
  assert.equal(preview.teams[0].instrumentPositions.rainstick, 8);
  assert.deepEqual(preview.teams[1].pieces.map(piece => piece.instanceId), ["0", "1"]);
  assert.equal(preview.team, undefined);
  assert.equal(preview.gameData, undefined);
  assert.equal(homeGuidePreview(section, { id: "s19-live" }).gameData, section.gameData);
  assert.deepEqual(preview.blocks, [{ id: "a", type: "text", text: "前排" }]);
  assert.equal(section.teams[1].pieces[0].instanceId, "persisted-piece");
});
