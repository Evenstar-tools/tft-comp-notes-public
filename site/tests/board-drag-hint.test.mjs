import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const boardSource = readFileSync(new URL("../components/Board.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(boardSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
});

test("a bench drop explains the alternate action and the limit per slot", () => {
  const dragNote = { hidden: true, textContent: "" };
  const restingNote = { hidden: false };
  const refs = [{ current: false }, { current: dragNote }, { current: restingNote }];
  const teemo = { id: "teemo", name: "提莫" };
  let preview;
  const imports = new Map([
    ["react", {
      ...require("react"), useState: initial => [initial, () => {}], useRef: () => refs.shift(),
      useMemo: run => run(), useCallback: callback => callback,
    }],
    ["@/hooks/use-board-drag", { useBoardDrag: (_drop, _enabled, callback) => { preview = callback; return {}; } }],
    ["@/data", { unitMap: new Map([[teemo.id, teemo]]), itemMap: new Map(), unitLabel: unit => ({ base: unit.name }) }],
    ["@/domain/board-instruments", { boardInstruments: () => new Map() }],
    ["@/domain/board-layout", { BOARD_WIDTH: 7, BOARD_HEIGHT: 4, HEX_WIDTH: 1, HEX_HEIGHT: 1, hexPosition: () => ({ x: 0, y: 0 }) }],
    ["./ItemIcon", { ItemIcon: () => null }],
    ["./GameIconImage", { GameIconImage: () => null }],
    ["./Glyphs", { Stars: () => null }],
  ]);
  const exports = {};
  new Function("require", "exports", outputText)(id => imports.get(id) ?? require(id), exports);
  exports.Board.type({
    pieces: [{ instanceId: "target", unitId: teemo.id, position: 4, stars: 1, items: [] }],
    selectedId: null, targeting: null,
  });
  preview({ source: null, destination: 4 });
  assert.equal(dragNote.textContent, "松手设为提莫的替补棋子（叠放左上角，没来时可互换）");
  assert.equal(dragNote.hidden, false);
  preview({ source: null, destination: 4, blocked: true });
  assert.equal(dragNote.textContent, "每格最多设置一个替补棋子");
  preview(null);
  assert.equal(dragNote.hidden, true);
  assert.equal(restingNote.hidden, false);
});

test("editor alternate badge overrides generic editor button padding, min-height, and radius", () => {
  const css = readFileSync(new URL("../app/interface.css", import.meta.url), "utf8");
  const match = css.match(/\.board-alternate,\s*\.editor button\.board-alternate\s*\{([^}]+)\}/);
  assert.ok(match, "expected .editor button.board-alternate selector to out-rank .editor button");
  const body = match[1];
  assert.match(body, /min-height:\s*0/);
  assert.match(body, /padding:\s*0/);
  assert.match(body, /border-radius:\s*50%/);
  assert.match(body, /overflow:\s*hidden/);
});
