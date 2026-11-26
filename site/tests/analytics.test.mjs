import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalPageUrl,
  extractPublicGuideIdFromHref,
  isExcludedPath,
  isHostAllowed,
  normalizeSearchResultType,
  parseIgnoreFlagFromSearch,
  parseRumConfig,
  rankBucket,
  resolveEntryChannel,
  resolveGuideEntrySource,
  resolvePublicPage,
  sanitizeAnalyticsPayload,
} from "../domain/analytics.ts";

test("RUM config is disabled by default and requires switch, appId, and host allowlist", () => {
  assert.equal(parseRumConfig({}).active, false);
  assert.equal(parseRumConfig({ NEXT_PUBLIC_RUM_ENABLED: "1", NEXT_PUBLIC_RUM_APP_ID: "app123" }).active, false);
  assert.equal(
    parseRumConfig({
      NEXT_PUBLIC_RUM_ENABLED: "0",
      NEXT_PUBLIC_RUM_APP_ID: "app123",
      NEXT_PUBLIC_RUM_ALLOWED_HOSTS: "tftnotes.com",
    }).active,
    false,
  );

  const active = parseRumConfig({
    NEXT_PUBLIC_RUM_ENABLED: "true",
    NEXT_PUBLIC_RUM_APP_ID: " rum-app-1 ",
    NEXT_PUBLIC_RUM_ALLOWED_HOSTS: "https://TFTNotes.com, www.tftnotes.com:443",
  });
  assert.equal(active.active, true);
  assert.equal(active.appId, "rum-app-1");
  assert.deepEqual(active.allowedHosts, ["tftnotes.com", "www.tftnotes.com"]);
  assert.equal(active.hostUrl, "https://rumt-zh.com");
  assert.equal(isHostAllowed("tftnotes.com", active.allowedHosts), true);
  assert.equal(isHostAllowed("preview.edgeone.cool", active.allowedHosts), false);
});

test("excluded paths and explicit test ignore flags are blocked from collection", () => {
  for (const path of ["/manage", "/manage/publish", "/editor/owner", "/editor/owner/draft", "/api/session", "/search", "/find"]) {
    assert.equal(isExcludedPath(path), true, path);
    assert.equal(resolvePublicPage(path, ""), null, path);
  }
  assert.equal(parseIgnoreFlagFromSearch("?rum_ignore=1"), true);
  assert.equal(parseIgnoreFlagFromSearch("?analytics=off"), true);
  assert.equal(parseIgnoreFlagFromSearch("?rum_ignore=0"), false);
  assert.equal(parseIgnoreFlagFromSearch("?q=jinx"), null);
});

test("public page resolution maps primary sections cleanly while ignoring filter and search params", () => {
  assert.deepEqual(resolvePublicPage("/", "?q=%E9%B1%BC%E9%AA%A8%E5%A4%B4&cost=4"), {
    category: "home",
    key: "home:recommended",
    canonicalPath: "/",
  });
  assert.deepEqual(resolvePublicPage("/", "?sort=category&style=84&q=jinx"), {
    category: "home",
    key: "home:all_guides",
    canonicalPath: "/?view=all-guides",
  });
  assert.deepEqual(resolvePublicPage("/", "?sort=mean&metric=topFourRate&direction=desc"), {
    category: "home",
    key: "home:all_guides",
    canonicalPath: "/?view=all-guides",
  });
  assert.deepEqual(resolvePublicPage("/", "?view=hero-augments&cost=2"), {
    category: "home",
    key: "home:hero_augments",
    canonicalPath: "/?view=hero-augments",
  });
  assert.deepEqual(resolvePublicPage("/", "?view=comp-trends"), {
    category: "home",
    key: "home:comp_trends",
    canonicalPath: "/?view=comp-trends",
  });
  assert.deepEqual(resolvePublicPage("/guides/sample-block-0001", "?team=board-1&stage=mid&from=%2F"), {
    category: "guide",
    key: "guide:sample-block-0001",
    canonicalPath: "/guides/sample-block-0001",
  });
  assert.deepEqual(resolvePublicPage("/heroes", "?view=grid&cost=5"), {
    category: "heroes",
    key: "heroes:grid",
    canonicalPath: "/heroes?view=grid",
  });
  assert.deepEqual(resolvePublicPage("/heroes", "?tab=stats"), {
    category: "heroes",
    key: "heroes:stats",
    canonicalPath: "/heroes?tab=stats",
  });
  assert.deepEqual(resolvePublicPage("/heroes", "?unit=jinx&q=jinx"), {
    category: "heroes",
    key: "heroes:list",
    canonicalPath: "/heroes",
  });
  assert.deepEqual(resolvePublicPage("/combos", "?hand=jinx:2&min=9"), {
    category: "combos",
    key: "combos",
    canonicalPath: "/combos",
  });
  assert.deepEqual(resolvePublicPage("/editor", "?guideBoard=secret-uuid"), {
    category: "editor",
    key: "editor",
    canonicalPath: "/editor",
  });

  // Canonical URL strips sensitive or free-text query params.
  assert.equal(
    buildCanonicalPageUrl("https://tftnotes.com", "/guides/sample-block-0001", "?team=abc&utm_source=secret&q=private"),
    "https://tftnotes.com/guides/sample-block-0001",
  );
  assert.equal(
    buildCanonicalPageUrl("https://tftnotes.com", "/", "?q=%E7%A7%81%E4%BA%BA%E6%90%9C%E7%B4%A2%E8%AF%8D"),
    "https://tftnotes.com/",
  );
});

test("entry channel attribution uses campaign allowlist, referrer domain classes, and internal/direct fallback", () => {
  assert.equal(
    resolveEntryChannel({
      search: "?utm_source=bilibili&secret=abc",
      referrer: "https://www.google.com/search?q=tft",
      currentHost: "tftnotes.com",
    }),
    "bilibili",
  );
  // Unknown campaign params must never pass through verbatim.
  assert.equal(
    resolveEntryChannel({
      search: "?utm_source=my_private_group_123",
      referrer: "https://www.baidu.com/s?wd=secret",
      currentHost: "tftnotes.com",
    }),
    "search_engine",
  );
  assert.equal(
    resolveEntryChannel({
      search: "?utm_source=my_private_group_123",
      referrer: "",
      currentHost: "tftnotes.com",
    }),
    "direct",
  );
  assert.equal(
    resolveEntryChannel({
      search: "",
      referrer: "https://bbs.ngabbs.com/read.php?tid=12345",
      currentHost: "tftnotes.com",
    }),
    "nga",
  );
  assert.equal(
    resolveEntryChannel({
      search: "",
      referrer: "https://some-blog.example.org/post/1",
      currentHost: "tftnotes.com",
    }),
    "external",
  );
  assert.equal(
    resolveEntryChannel({
      search: "",
      referrer: "https://tftnotes.com/heroes",
      currentHost: "tftnotes.com",
    }),
    "internal",
  );
  assert.equal(
    resolveEntryChannel({
      search: "?utm_source=wechat",
      referrer: "https://www.bilibili.com/video/BV123",
      currentHost: "tftnotes.com",
      hasSessionNavigation: true,
    }),
    "internal",
  );
});

test("guide entry source, rank buckets, result types, and payload sanitization enforce strict allowlists", () => {
  assert.equal(resolveGuideEntrySource({ recordedSource: "site_search", returnTo: "/" }), "site_search");
  assert.equal(resolveGuideEntrySource({ returnTo: "/" }), "home_rec");
  assert.equal(resolveGuideEntrySource({ returnTo: "/?sort=category" }), "guide_list");
  assert.equal(resolveGuideEntrySource({ returnTo: "/?q=jinx" }), "site_search");
  assert.equal(resolveGuideEntrySource({ returnTo: "/heroes?unit=jinx" }), "other");
  assert.equal(resolveGuideEntrySource({ referrer: "" }), "direct");
  assert.equal(resolveGuideEntrySource({ referrer: "https://www.bilibili.com/video/BV1", currentHost: "tftnotes.com" }), "direct");

  assert.equal(rankBucket(1), "1");
  assert.equal(rankBucket(2), "2-3");
  assert.equal(rankBucket(3), "2-3");
  assert.equal(rankBucket(4), "4-10");
  assert.equal(rankBucket(10), "4-10");
  assert.equal(rankBucket(11), "11+");

  assert.equal(normalizeSearchResultType("guides"), "guide");
  assert.equal(normalizeSearchResultType("heroes"), "unit");
  assert.equal(normalizeSearchResultType("gear"), "item");
  assert.equal(normalizeSearchResultType("/traits?trait=jazz"), "trait");
  assert.equal(normalizeSearchResultType("/augments?q=test"), "augment");
  assert.equal(normalizeSearchResultType("/updates"), "other");
  assert.equal(extractPublicGuideIdFromHref("/guides/sample-block-0009?team=t1"), "sample-block-0009");
  assert.equal(extractPublicGuideIdFromHref("/heroes?unit=jinx"), null);

  assert.deepEqual(
    sanitizeAnalyticsPayload({ name: "search_results", ext1: "has_results", ext2: "overlay", ext3: "raw_query_should_be_dropped" }),
    { name: "search_results", ext1: "has_results", ext2: "overlay", ext3: "" },
  );
  assert.equal(
    sanitizeAnalyticsPayload({ name: "guide_view", ext1: "bad id with spaces", ext2: "detail", ext3: "home_rec" }),
    null,
  );
  assert.equal(
    sanitizeAnalyticsPayload({ name: "tool_action", ext1: "poster_download", ext2: "sample-block-0001", ext3: "poster" })?.ext2,
    "sample-block-0001",
  );
});
