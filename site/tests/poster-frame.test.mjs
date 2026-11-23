import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { matchesImageRatio, readPngSize } from "../server/png-size.ts";

test("uses the uploaded PNG's IHDR dimensions for the K/DA Neeko stage board", async () => {
  const header = Buffer.from("89504e470d0a1a0a0000000d494844520000052800000807", "hex");
  const size = await readPngSize(new Blob([header]));
  assert.deepEqual(size, {width: 1320, height: 2055});
  assert.equal(matchesImageRatio({width: 1400, height: 1010}, size), false);
  assert.equal(matchesImageRatio({width: 1400, height: 1030}, {width: 1400, height: 1010}), false);
  assert.equal(matchesImageRatio({width: 615, height: 957}, size), true);
  assert.equal(matchesImageRatio({}, size), false);
  assert.equal(await readPngSize(new Blob([header.subarray(0, 12)])), undefined);
  header.writeUInt32BE(0, 16);
  assert.equal(await readPngSize(new Blob([header])), undefined);
});

test("exports the saved stages once in play order, including two boards at the same population", async () => {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith("@/data/") && specifier.endsWith(".json")) {
        return { ...next(new URL("../" + specifier.slice(2), import.meta.url).href, context),
          importAttributes: { type: "json" } };
      }
      try { return next(specifier, context); } catch (error) {
        if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith("./")) throw error;
        return next(specifier + ".ts", context);
      }
    },
  });
  try {
    const { defaultPosterFormat, posterLayout, posterStageTitle } = await import("../domain/poster.ts");
    const piece = position => ({ instanceId: "p", unitId: "kayn", position, stars: 2, items: [] });
    const team = { id: "team", name: "心之钢", notes: "", pieces: [piece(7)],
      stages: { early: { pieces: [piece(1)] }, mid: { pieces: [piece(2)], instrumentPositions: { maracas: 8 } } } };
    const season = { units: [], items: [], traits: [] };
    assert.equal(defaultPosterFormat(team), "full");
    const layout = (format, ids, source = team) => posterLayout(undefined, source, season, format, ids);
    const full = layout("full");
    assert.deepEqual(full.boards.map(posterStageTitle), ["前期 · 1人口", "中期 · 1人口", "后期 · 1人口"]);
    assert.deepEqual(full.boards.map(board => board.pieces[0].position), [1, 2, 7]);
    assert.equal(full.boards[1].instrumentPositions.maracas, 8);
    assert.ok(full.operations.every(step => !step.board));
    assert.deepEqual(layout("full", [full.stages[1].id]).boards.map(board => board.pieces[0].position), [2, 7]);
    assert.deepEqual(layout("quick").boards, [team]);
    const single = { ...team, mainStage: "early", stages: undefined };
    assert.deepEqual(layout("full", undefined, single).boards, [single]);
    assert.equal(defaultPosterFormat(single), "quick");
  } finally {
    hooks.deregister();
  }
});
