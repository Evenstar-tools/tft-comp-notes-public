import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { newOwnerSession, ownerCookieName } from "../server/owner-session.ts";
import { getDatabaseClient } from "../server/runtime-db.ts";

const read = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const boardId = "00000000-0000-4000-8000-000000000050";
const stageId = "00000000-0000-4000-8000-000000000052";
const sectionId = "sample-block-0254";
const board = (id, name) => ({
  id, name, category: "待分类", notes: "原棋盘备注", revision: 1, updatedAt: "2026-11-28T00:00:00Z",
  pieces: [{ unitId: "ezreal", instanceId: id, stars: 2, items: [], position: 21 }],
});
const original = {
  id: "owner-content-test-publication", title: "阵容笔记", revision: 1, warnings: [], media: [], publishedAt: "2026-11-28T00:00:00Z",
  season: read("season"),
  sections: [{
    id: sectionId, title: "四安可伊泽瑞尔", category: "慢搜阵容", kind: "guide", primaryTeamId: boardId,
    summaryBlockId: "opening",
    blocks: [{ id: "opening", type: "text", text: "原攻略摘要" }, { id: "notes", type: "text", text: "独立攻略正文" }],
    teams: [board(boardId, "八级成型"), board(stageId, "六级追三")],
  }],
};
const module = source => "data:text/javascript," + encodeURIComponent(source);
const request = (url, input, origin = "http://127.0.0.1") => new Request("http://127.0.0.1/api/owner/content" + url, input === undefined ? {} : {
  method: "PUT", headers: { "content-type": "application/json", origin }, body: JSON.stringify(input),
});

test("owner guide content isolates draft, verifies authorization and publishes with compare-and-swap", async () => {
  process.env.DATABASE_URL = "file::memory:";
  process.env.OWNER_ACCESS_CODE = "owner-content-test";
  globalThis.ownerContentTestPublication = original;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "next/headers") return next(module(
        `export const cookies = () => new Map(globalThis.ownerContentTestCookie ? [[ "${ownerCookieName}", { value: globalThis.ownerContentTestCookie } ]] : []);`
      ), context);
      if (specifier === "@/server/publication") return next(module(
        "export const ownerContentBasePublication = () => globalThis.ownerContentTestPublication;"
      ), context);
      const target = specifier.startsWith("@/") ? new URL("../" + specifier.slice(2), import.meta.url).href : specifier;
      try { return next(target, context); } catch (error) {
        if (error.code !== "ERR_MODULE_NOT_FOUND" || !target.startsWith(".") && !target.startsWith("file:")) throw error;
        return next(target + ".ts", context);
      }
    },
    load(url, context, next) {
      return next(url, url.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context);
    },
  });
  try {
    const { GET, PUT } = await import("../app/api/owner/content/route.ts");
    const { applyPublishedOwnerContent } = await import("../server/owner-content.ts");
    const route = `?section=${sectionId}&team=${boardId}`;
    assert.equal((await GET(request(route))).status, 401);
    globalThis.ownerContentTestCookie = newOwnerSession();
    const first = await GET(request(route));
    assert.equal(first.headers.get("cache-control"), "no-store");
    const initial = await first.json();
    assert.equal(initial.revision, 0);
    assert.equal(initial.published.opening, "原攻略摘要");
    const target = { sectionId, teamId: boardId };
    const fields = { ...initial.published, title: "四安可伊泽瑞尔新标题", boardTitle: "新成型盘",
      opening: "", notes: "站主备注", blocks: ["stats", "body", "conditions", "equipment"] };
    const mutation = { target, revision: 0, fields, publish: false };
    assert.equal((await PUT(request("", mutation, "https://example.invalid"))).status, 403);
    assert.equal((await PUT(request("", { ...mutation, fields: { ...fields, blocks: ["body", "body", "body", "body"] } }))).status, 400);
    const saved = await (await PUT(request("", mutation))).json();
    assert.deepEqual(saved.draft, fields);
    assert.equal(saved.revision, 1);
    assert.equal((await applyPublishedOwnerContent(original)).sections[0].title, initial.published.title);
    assert.equal((await PUT(request("", mutation))).status, 409);
    const finish = { ...mutation, revision: 1, publish: true };
    const competing = await Promise.all([PUT(request("", finish)), PUT(request("", finish))]);
    assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
    globalThis.ownerContentTestCookie = newOwnerSession();
    const reopened = await (await GET(request(route))).json();
    assert.equal(reopened.revision, 2);
    assert.deepEqual(reopened.published, fields);
    assert.equal(reopened.draft, undefined);
    const changed = await applyPublishedOwnerContent(original);
    assert.deepEqual(changed.sections[0].blocks.map(entry => entry.text), ["", "独立攻略正文"]);
    assert.equal(changed.sections[0].title, fields.title);
    assert.equal(changed.sections[0].ownerOpening, "");
    assert.equal(changed.sections[0].teams[0].webTitle, fields.boardTitle);
    assert.deepEqual(changed.sections[0].teams[0].ownerBlocks, fields.blocks);
    assert.deepEqual(changed.sections[0].teams[0].pieces, original.sections[0].teams[0].pieces);
    assert.deepEqual(changed.sections[0].teams[1], original.sections[0].teams[1]);
    const home = await (await GET(request("?home=1"))).json();
    const homeFields = {
      ...home.published, introTitle: "开服说明", intro: "开服欢迎", blocks: ["recommendations", "intro"],
      recommendations: [{ sectionId, teamId: boardId, override: "pin" }],
    };
    assert.equal((await PUT(request("", {
      target: { home: true }, revision: home.revision - 24 * 60 * 60 * 1000, fields: homeFields, publish: true,
    }))).status, 409);
    const homePublish = await PUT(request("", { target: { home: true }, revision: home.revision, fields: homeFields, publish: true }));
    assert.equal(homePublish.status, 200);
    assert.deepEqual((await applyPublishedOwnerContent(original)).ownerHome, homeFields);
    const savedHome = await homePublish.json();
    const homeDraft = await PUT(request("", { target: { home: true }, revision: savedHome.revision, publish: false,
      fields: { ...homeFields, intro: "新版草稿", recommendations: [{ sectionId, teamId: boardId, override: "exclude" }] } }));
    assert.equal(homeDraft.status, 200);
    const { revision: oldBuildRevision } = await homeDraft.json();

    const { default: patch } = await import("../data/current-patch.json", { with: { type: "json" } });
    const initialBuild = patch.build;
    try {
      patch.build = String(Number(initialBuild) + 1);
      const newBuild = await (await GET(request("?home=1"))).json();
      assert.equal(newBuild.published.introTitle, homeFields.introTitle);
      assert.equal(newBuild.published.intro, homeFields.intro);
      assert.deepEqual(newBuild.published.blocks, homeFields.blocks);
      assert.deepEqual(newBuild.published.recommendations, []);
      assert.equal(newBuild.draft.intro, "新版草稿");
      assert.deepEqual(newBuild.draft.recommendations, []);
      assert.equal((await PUT(request("", {
        target: { home: true }, revision: oldBuildRevision, fields: homeFields, publish: true,
      }))).status, 409);
      assert.deepEqual((await applyPublishedOwnerContent(original)).ownerHome, {
        introTitle: homeFields.introTitle, intro: homeFields.intro, blocks: homeFields.blocks,
      });
      const accepted = await PUT(request("", { target: { home: true }, revision: newBuild.revision, fields: newBuild.draft, publish: true }));
      assert.equal(accepted.status, 200);
      assert.equal((await applyPublishedOwnerContent(original)).ownerHome.intro, "新版草稿");
    } finally {
      patch.build = initialBuild;
    }
  } finally {
    (await getDatabaseClient()).close();
    hooks.deregister();
    delete globalThis.ownerContentTestCookie;
    delete globalThis.ownerContentTestPublication;
    delete process.env.DATABASE_URL;
    delete process.env.OWNER_ACCESS_CODE;
  }
});

test("website recommendation edits replace only manual choices within the current build", async () => {
  const { applyOwnerHomeRecommendations } = await import("../domain/owner-content.ts");
  const patch = read("current-patch");
  const first = { sectionId, teamId: boardId, status: "recommended", timing: "原入场", note: "保留数据说明", override: "pin" };
  const second = { sectionId, teamId: stageId, status: "conditional", note: "原条件", upgrade: "升八" };
  const base = { ...patch, reviewedAt: patch.effectiveAt, entries: [first, second] };
  const entries = applyOwnerHomeRecommendations(base, [{ ...second, timing: "新入场", override: "include" }], patch).entries;
  assert.equal(entries[0].override, undefined);
  assert.equal(entries[0].timing, first.timing);
  assert.equal(entries[0].note, first.note);
  assert.equal(entries[1].override, "include");
  assert.equal(entries[1].timing, "新入场");
  assert.equal(entries[1].upgrade, second.upgrade);
  assert.deepEqual(applyOwnerHomeRecommendations(base, undefined, patch), base);
});
