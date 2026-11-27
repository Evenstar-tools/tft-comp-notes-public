import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitSections } from "../domain/document-flow.ts";
import { isVersionUpdate, publishedVersionUpdates, versionUpdateLink } from "../domain/version-updates.ts";
import { findPatchObjects, publishedPatchCallouts, splitHighlightLine } from "../domain/patch-reference.ts";
import { patchReferences } from "../data/patch-notes.ts";
import { guideLink, validVersionReturn } from "../domain/guide-reading.ts";
import { itemGuideOrigin, itemLink } from "../domain/links.ts";
import { sectionTeams } from "../domain/document-flow.ts";

test("published Feishu briefs stay in their own season and environment after a snapshot is merged", () => {
  const block = (id, text, level) => ({
    id, level, title: text,
    content: { id, type: level ? "heading" : "text", text },
  });
  const label = block("updates", "版本更新");
  label.content.elements = [{ text_run: { content: label.title, text_element_style: { bold: true } } }];
  const sections = splitSections([
    label,
    block("launch", "19.1 开服", 2),
    block("summary", "调整摘要"),
    block("empty", "19.2 待编辑", 2),
    block("reroll", "慢搜阵容", 1),
    block("lineup", "烈娜塔", 2),
    block("opener", "六级追三"),
  ]);
  const pbe = { season: { id: "s19-pbe-19.1" }, sections };
  const live = { season: { id: "s19-live-19.1" }, sections };
  assert.deepEqual(publishedVersionUpdates("s19-pbe-19.1", live), []);
  assert.deepEqual(publishedVersionUpdates("s19-live-19.1", pbe), []);
  assert.deepEqual(publishedVersionUpdates("s20-live-20.1", live), []);
  assert.deepEqual(publishedVersionUpdates("s19-live-19.2", live).map(s => s.id), ["launch"]);
  assert.deepEqual(publishedVersionUpdates("s19-pbe-19.2", pbe).map(s => s.id), ["launch"]);
  const carried = { ...live, sections: live.sections.map(s => ({ ...s, updateEdition: "s19-pbe-19.1" })) };
  assert.deepEqual(publishedVersionUpdates("s19-live-19.2", carried), []);
  assert.equal(versionUpdateLink("launch"), "/updates?entry=launch");
});

test("returning from a guide restores the version, search and section without allowing unrelated routes", () => {
  const updates = "/updates?" + new URLSearchParams({ entry: "pbe-day-2", q: "烬", category: "弈子" }) + "#patch-changes";
  const guideHref = guideLink("guide", "board", updates);
  const guide = new URL(guideHref, "https://tft.local");
  assert.equal(guide.searchParams.get("team"), "board");
  assert.equal(validVersionReturn(guide.searchParams.get("from")), updates);
  const item = new URL(itemLink("rageblade", "jinx", guideHref), "https://tft.local");
  assert.deepEqual(itemGuideOrigin(item.searchParams.get("from")), { href: guideHref, sectionId: "guide", teamId: "board" });
  for (const href of ["/updates", "/updates#patch-recommendations", "/updates?entry=pbe-day-2#eight-board-samples"]) {
    assert.equal(validVersionReturn(href), href);
  }
  for (const href of ["//example.com/updates", "https://tft.local/updates", "/updates/guide", "/updates#footer",
    "/updates?entry=one&entry=two", "/updates?lobby=owner", ["/updates"]]) {
    assert.equal(validVersionReturn(href), undefined);
  }
});

test("a patch search matches aliases inside the selected category and keeps old/new values paired", () => {
  const patch = patchReferences.find(p => p.id === "pbe-day-2");
  const { units } = JSON.parse(readFileSync(new URL("../data/season.json", import.meta.url), "utf8"));
  const currentUnits = new Map(units.map(unit => [unit.id, unit]));
  assert.deepEqual(findPatchObjects(patch, "解锁", "thresh")[0].object.values[0].slice(1), ["300 秒","275 秒"]);
  assert.equal(findPatchObjects(patch, "解锁", "风女")[0].object.name, "迦娜");
  assert.equal(findPatchObjects(patch, "装备", "锤石").length, 0);
  assert.ok(findPatchObjects(patch, "", "kda").some(row => row.category === "羁绊"));
  assert.deepEqual(findPatchObjects(patch, "弈子", "ＴＡＬＩＹＡ", currentUnits).map(row => row.object.unit), ["taliyah"]);
  assert.equal(findPatchObjects(patch, "海克斯", "liliya", currentUnits)[0].object.name, "我又蹦又唱");
  assert.equal(findPatchObjects(patch, "装备", "taliya", currentUnits).length, 0);
  const intro = { id: "introduction", category: "资料说明", kind: "note", blocks: [
    { type: "quote", children: [{ text: "更新预览" }, { text: "原文", elements: [{ text_run: { text_element_style: { link: { url: patch.source.url } } } }] }, { text: "本版要点" }] },
    { type: "quote", children: [{ text: "环境观察" },{ text: "次日预判" }] },
  ] };
  assert.deepEqual(publishedPatchCallouts(intro, patch), { highlights: ["本版要点"], observation: ["次日预判"] });
  assert.equal(publishedPatchCallouts(intro, patchReferences.find(p => p.id === "pbe-5986652")), undefined);
  assert.equal(publishedPatchCallouts(intro, patchReferences.find(p => p.id === "pbe-19-1a")), undefined);
  assert.deepEqual(publishedVersionUpdates("s19-pbe", { season: { id: "s19-pbe-19.1" }, sections: [intro] }), [intro]);
  assert.equal(isVersionUpdate({ ...intro, blocks: [...intro.blocks, { type: "text", text: "其他资料" }] }), false);
  assert.equal(isVersionUpdate({ ...intro, blocks: [{ type: "quote", children: [{ text: "更新预览" }, { text: "待编辑" }] }] }), false);
});

test("patch highlights split leading focus labels and current patch impacts stay concise and valid", () => {
  assert.deepEqual(splitHighlightLine("解锁：史密奇上调至 9 个非唯一羁绊。"), {
    label: "解锁",
    text: "史密奇上调至 9 个非唯一羁绊。",
  });
  assert.deepEqual(splitHighlightLine("普通说明无前缀。"), { text: "普通说明无前缀。" });

  const latest = patchReferences.find(patch => patch.id === "pbe-6035832");
  assert.ok(latest);
  assert.ok(latest.highlights.every(line => !/小队规划器代码/.test(line)));
  assert.ok(latest.highlights.some(line => splitHighlightLine(line).label === "小结"));
  const totalObjects = Object.values(latest.groups).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
  assert.equal(totalObjects, 61);

  const preview = JSON.parse(readFileSync(new URL("../data/public-preview.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(latest.impacts) && latest.impacts.length >= 4 && latest.impacts.length <= 8);
  for (const impact of latest.impacts) {
    const section = preview.sections.find(entry => entry.id === impact.sectionId);
    assert.ok(section, impact.sectionId);
    if (impact.teamId) {
      assert.ok(sectionTeams(section).some(board => board.id === impact.teamId), impact.teamId);
    }
  }
});
