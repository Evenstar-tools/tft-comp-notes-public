import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { includeWebDetails, refreshWebDetails } from "../server/guide-details.ts";
import { guideBody, guideFacets, readingNotes, sourceSummary } from "../domain/guide-reading.ts";

const season = JSON.parse(readFileSync(new URL("../data/season.json", import.meta.url)));
const id = "sample-block-0420";
const url = "https://evenstar-tft-library.zhangzeyu99.chatgpt.site/guides/" + id;
const link = (href = url) => ({ id: "jump", type: "text", text: "网页详解", elements: [
  { text_run: { content: "网页详解", text_element_style: { link: { url: href } } } },
] });
const summary = { id: "brief", type: "text", text: "选秀前 D 四次，五级追炸弹。" };
const team = (id, name, units) => ({ id, name, pieces: units.map(unitId => ({ unitId, stars: 2, items: [] })) });
const main = team("00000000-0000-4000-8000-000000000042", "五高能三编舞 · 九人口主阵容", ["ziggs", "seraphine", "kobuko", "teemo", "nidalee"]);
const jazz = team("00000000-0000-4000-8000-000000000098", "备选 · 三爵士吉格斯", ["ziggs", "kobuko", "tristana", "swain"]);
function sectionWith(blocks) {
  return { id, title: "高能流行芬妮&炸弹", kind: "guide", blocks, team: main, teams: [main, jazz], primaryTeamId: main.id };
}

test("compact Feishu guide restores board-specific reading and roles without a circular link or repeat summary", () => {
  const section = sectionWith([summary, link()]);
  includeWebDetails(section, new Set(section.blocks.map(block => block.id)), "sample-block-0026");
  assert.equal(sourceSummary(section), summary.text);
  assert.ok(section.blocks.every(block => block.id !== "jump" && block.id !== "sample-block-0026"));
  const primary = readingNotes(section, main, season);
  assert.equal(primary.opening, summary.text);
  assert.deepEqual(primary.roles.filter(r => r.label === "主C").map(r => r.units), [["ziggs"], ["seraphine"]]);
  assert.deepEqual(primary.roles.find(r => r.label === "副C")?.units, ["teemo"]);
  const alt = readingNotes(section, jazz, season);
  assert.deepEqual(alt.roles.find(r => r.label === "功能装")?.units, ["swain"]);
  assert.deepEqual(guideFacets(section, jazz, season).costs, [1]);
  const current = guideBody(section, jazz).current;
  assert.ok(current.some(b => b.label && b.text === "三爵士备选"));
  assert.ok(current.some(b => b.id === "sample-block-0255"));
  assert.ok(!current.some(b => b.id === "sample-block-0365"));
  const result = structuredClone(section);
  includeWebDetails(section, new Set(section.blocks.map(b => b.id)));
  assert.deepEqual(section, result);
});

test("web details require a matching self-link and preserve restored, moved or newly written Feishu blocks", () => {
  for (const plain of [sectionWith([summary]), sectionWith([link(url + "?team=other")]), { ...sectionWith([link()]), kind: "note" }]) {
    const original = structuredClone(plain);
    includeWebDetails(plain, new Set(plain.blocks.map(b => b.id)));
    assert.deepEqual(plain, original);
  }
  const edited = { id: "sample-block-0255", type: "text", text: "站主手改的爵士说明。" };
  const moved = "sample-block-0102";
  const section = sectionWith([summary, link(), edited]);
  includeWebDetails(section, new Set([...section.blocks.map(b => b.id), moved]), edited.id);
  assert.deepEqual(section.blocks.filter(b => b.id === edited.id), [edited]);
  assert.ok(!section.blocks.some(b => b.id === moved));
});

test("a copied unlock paragraph follows the patch while hand-edited notes keep their text", () => {
  const id = "sample-block-0461";
  const previous = "演示旧文案 5";
  const run = {content:previous, text_element_style:{bold:false}};
  const section = {id:"sample-block-0214",blocks:[{id,type:"text",text:previous,elements:[{text_run:run}]}]};
  refreshWebDetails(section);
  assert.match(section.blocks[0].text,/25 金币利息开迦娜/);
  assert.equal(run.content,section.blocks[0].text);
  section.blocks[0].text = "站主新写的运营建议。";
  refreshWebDetails(section);
  assert.equal(section.blocks[0].text,"站主新写的运营建议。");
});
