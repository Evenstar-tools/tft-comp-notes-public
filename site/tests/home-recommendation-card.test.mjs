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

const source = readFileSync(new URL("../components/PatchRecommendationList.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
const require = createRequire(import.meta.url);
const imports = new Map([
  ["@/domain/guide-reading", reading], ["@/domain/guide-family-stats", stats],
  ["@/lib/beijing-time", time], ["@/lib/home-position", position],
  ["@/domain/guide-equipment-conditions", {}], ["./GuideEquipmentConditions", {}],
  ["./OwnerPageEditor", { OwnerInlineEdit: ({ label }) => createElement("button", { "aria-label": label }) }],
]);
const exports = {};
new Function("require", "exports", outputText)(id => imports.get(id) ?? require(id), exports);

const sampledBatch = { patch: "19.1c", queue: "PBE", updatedAt: "2026-11-26T00:00:00Z", days: 3, spansBuilds: true };

function renderCards(cards, stats, editor = {}) {
  return renderToStaticMarkup(createElement(exports.PatchRecommendationList, { home: "/", stats, cards, ...editor }));
}

test("the recommendation card shows only mean placement and exposes the full sample in its label", () => {
  const html = renderCards([{
    group: "fast9", title: "速九阵容", team: { id: "board" },
    rating: { sectionId: "guide", mean: 3.41, games: 1234, topFourRate: .681, winRate: .215, sampleScope: "9 级结算" },
    manualBadge: "不应显示", timing: "血量和经济都高再上九。", upgrade: "经济足够时升九。", avatars: [], stages: [],
  }], sampledBatch);
  assert.match(html, /title="平均排名 3\.41 · 前四 68\.1% · 登顶 21\.5% · 1,234 场 · PBE 19\.1c · 近 3 天体系样本 · 9 级结算"/);
  assert.match(html, /aria-label="平均排名 3\.41 · 前四 68\.1% · 登顶 21\.5% · 1,234 场 · PBE 19\.1c · 近 3 天体系样本 · 9 级结算"/);
  assert.match(html, /<span class="home-patch-mean-label">均名<\/span> <b>3\.41<\/b><\/span>/);
  const visibleText = html.replace(/<[^>]+>/g, "");
  assert.match(visibleText, /采样窗口跨热补/);
  assert.match(visibleText, /时机血量和经济都高再上九/);
  assert.match(html, /<dt>升等<\/dt><dd>经济足够时升九。<\/dd>/);
  assert.doesNotMatch(visibleText, /提档|不应显示|前四|登顶|[\d,]+\s*场/);
});

test("an unsampled recommendation shows the owner label and reason without a placement metric", () => {
  const card = {
    group: "fast9", title: "探戈爵士卡牌", team: { id: "board" },
    rating: { sectionId: "guide", teamId: "board", name: "探戈爵士卡牌", carryId: "twistedfate" },
    manualReason: "七级来牌特别顺才走", avatars: [], stages: [],
  };
  const html = renderCards([card]);
  assert.match(html, /href="\/guides\/guide\?team=board/);
  assert.match(html, /id="guide-card-patch-guide-board-manual" class="home-patch-manual-badge" role="group" title="七级来牌特别顺才走" aria-label="站主推荐 · 七级来牌特别顺才走">站主推荐<\/span>/);
  assert.match(html, /aria-describedby="[^"]*guide-card-patch-guide-board-manual"/);
  assert.doesNotMatch(html, /均名|平均排名|前四|登顶|home-patch-mean|home-patch-sample|数据更新/);
  assert.doesNotMatch(html, /owner-home-card-action|data-owner-editing|调整探戈爵士卡牌的推荐/);
  const editing = renderCards([card], undefined, { onEdit: () => {}, selectedEntry: "guide:board" });
  assert.match(editing, /data-owner-editing="true" data-owner-selected="true"/);
  assert.match(editing, /aria-label="调整探戈爵士卡牌的推荐"/);
  const mixed = renderCards([card, {
    ...card, team: { id: "sampled" }, rating: { sectionId: "guide2", mean: 4.12, games: 1200 },
  }], sampledBatch);
  assert.match(mixed, /采样窗口跨热补/);
  assert.match(mixed, /均名<\/span> <b>4\.12<\/b>/);
  assert.match(mixed, /站主推荐<\/span>/);
  assert.match(renderCards([{ ...card, manualBadge: "版本首发" }]), /aria-label="版本首发 · 七级来牌特别顺才走">版本首发<\/span>/);
});
