import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as reading from "../domain/guide-reading.ts";
import * as stats from "../domain/guide-family-stats.ts";
import * as time from "../lib/beijing-time.ts";
import * as position from "../lib/home-position.ts";

test("the recommendation card shows only mean placement and exposes the full sample in its label", () => {
  const source = readFileSync(new URL("../components/PatchRecommendationList.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const require = createRequire(import.meta.url);
  const imports = new Map([
    ["@/domain/guide-reading", reading], ["@/domain/guide-family-stats", stats],
    ["@/lib/beijing-time", time], ["@/lib/home-position", position],
    ["@/domain/guide-equipment-conditions", {}], ["./GuideEquipmentConditions", {}],
  ]);
  const exports = {};
  new Function("require", "exports", outputText)(id => imports.get(id) ?? require(id), exports);

  const html = renderToStaticMarkup(createElement(exports.PatchRecommendationList, {
    home: "/",
    stats: { patch: "19.1c", queue: "PBE", updatedAt: "2026-11-26T00:00:00Z", days: 3 },
    cards: [{
      group: "fast9", title: "速九阵容", team: { id: "board" },
      rating: { sectionId: "guide", mean: 3.41, games: 1234, topFourRate: .681, winRate: .215, sampleScope: "9 级结算" },
      conditional: true, sampleLabel: "核心样本", timing: "血量和经济都高再上九。", avatars: [], stages: [],
    }],
  }));
  assert.match(html, /title="平均排名 3\.41 · 前四 68\.1% · 登顶 21\.5% · 1,234 场 · 核心样本 · 9 级结算"/);
  assert.match(html, /aria-label="平均排名 3\.41 · 前四 68\.1% · 登顶 21\.5% · 1,234 场 · 核心样本 · 9 级结算"/);
  assert.match(html, /<span class="home-patch-mean-label">均名<\/span> <b>3\.41<\/b><\/span>/);
  const visibleText = html.replace(/<[^>]+>/g, "");
  assert.match(visibleText, /时机血量和经济都高再上九/);
  assert.doesNotMatch(visibleText, /有条件|前四|登顶|[\d,]+\s*场/);
});
