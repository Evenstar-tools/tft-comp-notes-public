import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Vinext resolves these existing extensionless domain imports; use the same
// resolution for the small dependency graph under Node's native TS test runner.
const resolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith("./")) throw error;
      return nextResolve(specifier + ".ts", context);
    }
  },
});
const { activeHomeRecommendationOverrides, applyHomeRecommendationOverrides, getPublishedPatchRecommendations, readablePatchIntroduction, sectionsAfterPartialPublish } =
  await import("../domain/patch-recommendations.ts");
resolver.deregister();

const board = "00000000-0000-4000-8000-000000000007";
const alternate = "00000000-0000-4000-8000-000000000031";
const guideId = "sample-block-0307";
const origin = "https://tft.example.com";
const edition = "s19-pbe";
const build = "6013636";
const effective = "2026-11-21T20:55:00-04:00";
const review = "2026-11-22T08:56:00+08:00";
const header = `阵容推荐 | ${edition} | ${build} | ${review}`;
const entry = (id = board) => `推荐 | /guides/${guideId}?team=${id} | 先开离子。`;
const intro = (...lines) => ({
  id: "introduction", kind: "note", title: "资料说明", category: "资料说明",
  blocks: [{ id: "callout", type: "quote", children: ["环境观察", ...lines].map((value, i) =>
    typeof value === "string" ? { id: "p" + i, type: "text", text: value } : value) }],
});
const guide = (id = board) => ({
  id: guideId, kind: "guide", title: "七离子金克丝", category: "速八", blocks: [],
  gameData: { id: "s19-pbe-19.1.0.5973071" }, teams: [{ id, pieces: [{ unitId: "jinx" }] }],
});
const parse = sections => getPublishedPatchRecommendations(sections, edition, build, effective);

test("Feishu notes opt in explicitly, keep order, resolve rich links, and can clear the slate", () => {
  assert.deepEqual(parse([intro("前期用四古典过渡。"), guide()]), { declared: false, issues: [] });
  assert.deepEqual(parse([intro("阵容推荐", "四古典。"), guide()]), { declared: false, issues: [] });
  const clear = parse([intro(header)]);
  assert.equal(clear.declared, true);
  assert.deepEqual(clear.batch.entries, []);
  const linked = {
    id: "linked", type: "text", text: "条件 ｜ 九人口棋盘 ｜ 只在血量健康时考虑。 ｜ 战绩",
    elements: [
      { text_run: { content: "条件 ｜ " } },
      { text_run: { content: "九人口棋盘", text_element_style: { link: { url: origin + "/guides/ionic-jinx?team=lv9" } } } },
      { text_run: { content: " ｜ 只在血量健康时考虑。 ｜ " } },
      { text_run: { content: "战绩", text_element_style: { link: { url: "https://www.metatft.com/pbe-comps" } } } },
    ],
  };
  const chapter = { ...guide(), team: guide(alternate).teams[0] };
  const draft = intro("先看物理装。", header + " | 2026-11-22T00:55:00Z | 2026-11-22T00:55:30Z",
    "摘要 | 先看过渡质量。", linked, entry(), "阵容推荐结束", "别空城等格温。");
  const result = parse([draft, chapter]);
  assert.deepEqual(result.issues, []);
  assert.equal(result.batch.summary, "先看过渡质量。");
  assert.deepEqual(result.batch.window, { start: "2026-11-22T00:55:00Z", end: "2026-11-22T00:55:30Z" });
  assert.deepEqual(result.batch.entries.map(({ teamId, status }) => [teamId, status]), [[alternate, "conditional"], [board, "recommended"]]);
  assert.deepEqual(result.batch.entries[0].sources, ["https://www.metatft.com/pbe-comps"]);
  assert.deepEqual(readablePatchIntroduction(draft, result.batch.summary).blocks[0].children.map(block => block.text),
    ["环境观察", "先看物理装。", "先看过渡质量。", "别空城等格温。"]);
  assert.equal(draft.blocks[0].children.length, 8);
});

test("homepage owner actions expire at the build boundary and carry configured recommendations into the public feed", () => {
  const published = parse([intro(header, entry()), guide()]).batch;
  const override = { sectionId: guideId, teamId: board, status: "recommended", override: "pin",
    pinOrder: 2, manualBadge: "站主推荐", note: "开局有羊刀再进。" };
  const configured = { ...published, entries: [override] };
  assert.deepEqual(activeHomeRecommendationOverrides(configured, { seasonId: edition, build }), [override]);
  assert.deepEqual(activeHomeRecommendationOverrides(configured, { seasonId: edition, build: "next" }), []);
  assert.deepEqual(activeHomeRecommendationOverrides(configured, { seasonId: "s19-live", build }), []);
  const [merged] = applyHomeRecommendationOverrides(published, configured);
  assert.equal(merged.override, "pin");
  assert.equal(merged.pinOrder, 2);
  assert.equal(merged.note, override.note);
  assert.deepEqual(applyHomeRecommendationOverrides({ ...published, build: "next" }, configured), published.entries);
});

test("the new secondary label and previously published label select the same category", () => {
  for (const label of ["次选阵容", "暂不推荐"]) {
    const result = parse([intro(header, `${label} | /guides/${guideId}?team=${board} | 格温没解锁时先稳血。`), guide()]);
    assert.deepEqual(result.issues, []);
    assert.equal(result.batch.entries[0].status, "avoid");
  }
});

test("partial publication validates against the actual post-publish board, not just draft or live", () => {
  const draft = [intro(header, entry(alternate)), guide(alternate)];
  const current = [intro("以前的建议"), guide()];
  const load = (selected, removed = []) => parse(sectionsAfterPartialPublish(current, draft, selected, removed));
  assert.match(load(["introduction"]).issues[0], /同时发布对应攻略/);
  assert.equal(load(["introduction", guideId]).batch.entries[0].teamId, alternate);
  assert.match(load(["introduction"], [guideId]).issues[0], /不在本次发布/);
  assert.equal(load([guideId]).declared, false);
  assert.match(parse([intro(header, entry()), { ...guide(), gameData: { id: "s18-live" } }]).issues[0], /同赛季/);
  const partial = parse([intro(header, "摘要 | 旧主力仍推荐。", entry(), entry(alternate)), guide(alternate)]);
  assert.match(partial.issues[0], /不在本次发布/);
  assert.deepEqual(partial.batch.entries.map(entry => entry.teamId), [alternate]);
  assert.equal(partial.batch.summary, undefined);
});

test("stale builds, bad clocks, duplicate boards and foreign or ambiguous links fail closed", () => {
  const reject = (lines, reason) => {
    const result = parse([intro(...lines), guide()]);
    assert.equal(result.declared, true);
    assert.equal(result.batch, undefined);
    assert.match(result.issues.join(" "), reason);
  };
  reject([header.replace(build, "6011486"), entry()], /请按当前构建复核/);
  reject([header.replace(edition, "s19-live"), entry()], /请按当前构建复核/);
  reject([header.replace(edition, "s19-pbe-19.1.1"), entry()], /请按当前构建复核/);
  reject([header.replace(review, "2026-02-30T08:56:00+08:00")], /复盘时间/);
  reject([header + " | 2026-11-22T00:56:00Z | 2026-11-22T00:55:00Z"], /样本窗口/);
  reject([header + " | 2026-11-22T00:55:01Z | 2026-11-22T00:56:30Z"], /样本窗口/);
  reject([header, entry(), entry()], /同一棋盘只能写一次/);
  reject([header, entry().replace("/guides", "https://example.org/guides")], /本站带 team 参数/);
  reject([header, entry().replace("?" + "team=" + board, "")], /本站带 team 参数/);
  reject([header, entry() + " | javascript:alert(1)"], /HTTPS/);
  reject([header, header, entry()], /只保留一处/);
});
