import assert from "node:assert/strict";
import test from "node:test";
import preview from "../data/public-preview.json" with { type: "json" };
import rerollBoards from "../data/s19-reroll-boards.json" with { type: "json" };
import { checkedSourceGuide } from "../components/guide-board-transfer.ts";
import { extractPublicGuideIdFromHref, resolvePublicPage } from "../domain/analytics.ts";
import { sectionTeams } from "../domain/document-flow.ts";
import { guideLink } from "../domain/guide-reading.ts";
import { boardPublicSlug, canonicalGuidePath, guidePublicSlug, resolveBoardTeamId, resolveGuideSectionId } from "../domain/guide-slugs.ts";
import { mergedGuideIds, resolveGuideRequest } from "../domain/legacy-guide-redirects.ts";
import { canonicalGuideHref, itemGuideOrigin } from "../domain/links.ts";
import { isVersionUpdate } from "../domain/version-updates.ts";
import { prepareFamilyPublication } from "../scripts/export-family-catalog.mjs";

const published = prepareFamilyPublication(preview);
const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const jinx = "sample-block-1110";
const jinxLv8 = "00000000-0000-4000-8000-000000001252";
const graves = "sample-block-0251";
const gravesPyke = "00000000-0000-4000-8000-000000000093";

test("every public guide has a unique, reversible public slug", () => {
  const sections = preview.sections.filter(section => !isVersionUpdate(section));
  const slugs = new Set();
  for (const { id } of sections) {
    const slug = guidePublicSlug(id);
    assert.match(slug, kebab, id);
    assert.ok(!slug.includes("sample-block"), id);
    assert.ok(!slugs.has(slug), slug);
    slugs.add(slug);
    assert.equal(resolveGuideSectionId(slug), id);
    assert.equal(resolveGuideSectionId(id), id);
  }
});

test("each snapshot board and every added public board have a reversible slug unique within their guide", () => {
  const live = new Map(published.sections.map(section => [section.id, section]));
  const staged = new Map(rerollBoards.map(guide => [guide.sectionId, guide.stages]));
  for (const section of preview.sections.filter(section => !isVersionUpdate(section))) {
    const { id } = section;
    const effective = live.get(id);
    assert.ok(effective, id);
    const ids = new Set([
      ...sectionTeams(section).map(team => team.id),
      ...sectionTeams(effective).map(team => team.id),
      ...(staged.get(id) ?? []).filter(stage => stage.pieces?.length).map(stage => stage.teamId),
    ]);
    const slugs = new Set();
    for (const teamId of ids) {
      const slug = boardPublicSlug(id, teamId);
      assert.notEqual(slug, teamId, id + ":" + teamId);
      assert.match(slug, kebab, teamId);
      assert.ok(!slug.includes("sample-block"), slug);
      assert.ok(!slugs.has(slug), id + ":" + slug);
      slugs.add(slug);
      assert.equal(resolveBoardTeamId(id, slug), teamId);
      assert.equal(resolveBoardTeamId(id, teamId), teamId);
    }
  }
});

test("known short links are generated directly and unmapped IDs retain existing behavior", () => {
  assert.equal(guideLink(jinx), "/guides/jazz-jinx");
  assert.equal(guideLink(jinx, jinxLv8, "/?sort=category"), "/guides/jazz-jinx?team=lv8&from=%2F%3Fsort%3Dcategory");
  assert.equal(guideLink("sample-block-0229", "0dd45d5d-496c-459b-9db2-8e05355bd6c2"), "/guides/prodigy-baron?team=95-lv9");
  assert.equal(guideLink("guide", "board"), "/guides/guide?team=board");
  assert.equal(guidePublicSlug("constructor"), "constructor");
  assert.equal(boardPublicSlug(jinx, "constructor"), "constructor");
  assert.equal(resolveBoardTeamId(jinx, undefined), undefined);
});

test("legacy paths, UUID board queries and merged routes resolve directly to the renderable short link", () => {
  const params = { stage: "mid", flex: "test-flex", poster: "1", posterFormat: "full",
    posterStages: "early,late", from: "/?sort=category#guide-card-jinx", stats: "period" };
  const cases = [
    [jinx, undefined, jinx, undefined, "/guides/jazz-jinx", null],
    [jinx, jinxLv8, jinx, jinxLv8, "/guides/jazz-jinx", "lv8"],
    [jinx, "lv8", jinx, jinxLv8, "/guides/jazz-jinx", "lv8"],
    ["jazz-jinx", jinxLv8, jinx, jinxLv8, "/guides/jazz-jinx", "lv8"],
    ["sample-block-0452", gravesPyke, graves, gravesPyke, "/guides/ocean-graves", "lv9-pyke"],
    ["0452", undefined, graves, "00000000-0000-4000-8000-000000001261", "/guides/ocean-graves", "4-jugg-graves"],
    ["showoff-draven", "lv7-viego", "choreographer-draven-viego", "00000000-0000-4000-8000-000000001177", "/guides/choreographer-draven-viego", "lv7"],
    ["sample-block-0407", "00000000-0000-4000-8000-000000001177", "choreographer-draven-viego", "00000000-0000-4000-8000-000000001177", "/guides/choreographer-draven-viego", "lv7"],
  ];
  for (const [id, rawTeam, sectionId, teamId, pathname, boardSlug] of cases) {
    const { redirectTo } = resolveGuideRequest(id, rawTeam, published.sections, params);
    assert.equal(redirectTo, canonicalGuidePath(sectionId, teamId, params));
    const target = new URL(redirectTo, "https://tft.local");
    assert.equal(target.pathname, pathname);
    assert.equal(target.searchParams.get("team"), boardSlug);
    target.searchParams.delete("team");
    assert.deepEqual(Object.fromEntries(target.searchParams), params);
    const canonical = resolveGuideRequest(pathname.split("/").at(-1), boardSlug ?? undefined, published.sections, params);
    assert.equal(canonical.redirectTo, undefined);
    assert.equal(canonical.section.id, sectionId);
    assert.equal(canonical.teamId, teamId);
  }
  for (const id of mergedGuideIds) {
    const { redirectTo } = resolveGuideRequest(id, undefined, published.sections);
    assert.ok(redirectTo && !redirectTo.includes("sample-block") && !redirectTo.includes("00000000"), id);
  }
});

test("analytics, item back links and saved guide sources recognize both URL formats", () => {
  const legacy = `/guides/${jinx}?team=${jinxLv8}&stage=mid&flex=example`;
  const canonical = "/guides/jazz-jinx?team=lv8&stage=mid&flex=example";
  const source = { sectionId: jinx, teamId: jinxLv8 };
  for (const href of [legacy, canonical]) {
    assert.equal(extractPublicGuideIdFromHref(href), jinx);
    assert.deepEqual(resolvePublicPage(href.split("?")[0]), {
      category: "guide", key: "guide:" + jinx, canonicalPath: "/guides/jazz-jinx",
    });
    assert.deepEqual(itemGuideOrigin(href), { href: canonical, ...source });
    assert.deepEqual(checkedSourceGuide({ href, ...source, title: "爵士金克丝" }), { href: canonical, ...source, title: "爵士金克丝" });
  }
  assert.equal(canonicalGuideHref(legacy + "#guide-conditions"), canonical + "#guide-conditions");
});
