import { canonicalGuidePath, resolveGuideSectionId } from "./guide-slugs.ts";

export const ANALYTICS_EVENT_NAMES = [
  "page_view",
  "guide_view",
  "search_results",
  "search_result_open",
  "tool_action",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type PageCategory =
  | "home"
  | "guide"
  | "heroes"
  | "items"
  | "traits"
  | "augments"
  | "combos"
  | "editor"
  | "updates";

export type EntryChannel =
  | "bilibili"
  | "wechat"
  | "xiaohongshu"
  | "douyin"
  | "nga"
  | "tieba"
  | "qq"
  | "weibo"
  | "feishu"
  | "github"
  | "datatft"
  | "metatft"
  | "search_engine"
  | "external"
  | "direct"
  | "internal";

export type GuideViewMode = "detail" | "quick_view";
export type GuideEntrySource = "home_rec" | "guide_list" | "site_search" | "direct" | "other";
export type SearchSurface = "overlay" | "home_inline" | "find";
export type SearchResultState = "has_results" | "no_results";
export type SearchResultType = "guide" | "unit" | "item" | "trait" | "augment" | "other";
export type RankBucket = "1" | "2-3" | "4-10" | "11+";

export type ToolActionName =
  | "combo_first_result"
  | "poster_open"
  | "poster_download"
  | "poster_open_original"
  | "poster_share"
  | "poster_copy_link"
  | "editor_import_guide"
  | "editor_import_combo"
  | "editor_export_image"
  | "editor_copy_text"
  | "editor_save_local";

export type ToolSurface = "combos" | "poster" | "guide" | "editor";

export type RumRuntimeConfig = {
  enabled: boolean;
  appId: string;
  allowedHosts: string[];
  hostUrl: string;
  env: "production" | "test" | "pre" | "gray" | "development";
  active: boolean;
};

export type PublicPageDescriptor = {
  category: PageCategory;
  key: string;
  canonicalPath: string;
};

export type AnalyticsPayload = {
  name: AnalyticsEventName;
  ext1: string;
  ext2: string;
  ext3: string;
};

const DEFAULT_RUM_HOST_URL = "https://rumt-zh.com";
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ALLOWED_ENVS = new Set(["production", "test", "pre", "gray", "development"]);
const ALLOWED_EVENTS = new Set<string>(ANALYTICS_EVENT_NAMES);

const CAMPAIGN_ALIASES: Record<string, EntryChannel> = {
  bilibili: "bilibili",
  bili: "bilibili",
  wechat: "wechat",
  weixin: "wechat",
  wx: "wechat",
  xiaohongshu: "xiaohongshu",
  xhs: "xiaohongshu",
  redbook: "xiaohongshu",
  douyin: "douyin",
  dy: "douyin",
  nga: "nga",
  tieba: "tieba",
  qq: "qq",
  weibo: "weibo",
  wb: "weibo",
  feishu: "feishu",
  lark: "feishu",
  github: "github",
  datatft: "datatft",
  metatft: "metatft",
};

const REFERRER_CHANNEL_SUFFIXES: ReadonlyArray<readonly [string, EntryChannel]> = [
  ["bilibili.com", "bilibili"],
  ["b23.tv", "bilibili"],
  ["ngabbs.com", "nga"],
  ["nga.cn", "nga"],
  ["nga.178.com", "nga"],
  ["tieba.baidu.com", "tieba"],
  ["xiaohongshu.com", "xiaohongshu"],
  ["xhslink.com", "xiaohongshu"],
  ["douyin.com", "douyin"],
  ["weibo.com", "weibo"],
  ["weibo.cn", "weibo"],
  ["github.com", "github"],
  ["datatft.com", "datatft"],
  ["metatft.com", "metatft"],
];

const SEARCH_ENGINE_SUFFIXES = [
  "baidu.com",
  "google.com",
  "google.com.hk",
  "google.co.jp",
  "bing.com",
  "cn.bing.com",
  "sogou.com",
  "so.com",
  "quark.cn",
  "sm.cn",
  "duckduckgo.com",
  "yahoo.com",
  "yandex.com",
  "yandex.ru",
];

const TOOL_ACTIONS = new Set<string>([
  "combo_first_result",
  "poster_open",
  "poster_download",
  "poster_open_original",
  "poster_share",
  "poster_copy_link",
  "editor_import_guide",
  "editor_import_combo",
  "editor_export_image",
  "editor_copy_text",
  "editor_save_local",
]);

const TOOL_SURFACES = new Set<string>(["combos", "poster", "guide", "editor"]);
const GUIDE_MODES = new Set<string>(["detail", "quick_view"]);
const GUIDE_SOURCES = new Set<string>(["home_rec", "guide_list", "site_search", "direct", "other"]);
const SEARCH_SURFACES = new Set<string>(["overlay", "home_inline", "find"]);
const SEARCH_STATES = new Set<string>(["has_results", "no_results"]);
const SEARCH_TYPES = new Set<string>(["guide", "unit", "item", "trait", "augment", "other"]);
const RANK_BUCKETS = new Set<string>(["1", "2-3", "4-10", "11+"]);
const PAGE_CATEGORIES = new Set<string>(["home", "guide", "heroes", "items", "traits", "augments", "combos", "editor", "updates"]);
const ENTRY_CHANNELS = new Set<string>([
  "bilibili", "wechat", "xiaohongshu", "douyin", "nga", "tieba",
  "qq", "weibo", "feishu", "github", "datatft", "metatft",
  "search_engine", "external", "direct", "internal",
]);

function normalizeHostEntry(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split(/[/?#:]/, 1)[0] ?? "";
  }
}

function normalizeRumHostUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return DEFAULT_RUM_HOST_URL;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.origin;
    }
  } catch {
    // Fall back to default China RUM collector origin.
  }
  return DEFAULT_RUM_HOST_URL;
}

export function parseRumConfig(env: {
  NEXT_PUBLIC_RUM_ENABLED?: string;
  NEXT_PUBLIC_RUM_APP_ID?: string;
  NEXT_PUBLIC_RUM_ALLOWED_HOSTS?: string;
  NEXT_PUBLIC_RUM_HOST_URL?: string;
  NEXT_PUBLIC_RUM_ENV?: string;
}): RumRuntimeConfig {
  const flag = (env.NEXT_PUBLIC_RUM_ENABLED ?? "").trim().toLowerCase();
  const enabled = flag === "1" || flag === "true";
  const appId = (env.NEXT_PUBLIC_RUM_APP_ID ?? "").trim();
  const allowedHosts = Array.from(
    new Set(
      (env.NEXT_PUBLIC_RUM_ALLOWED_HOSTS ?? "")
        .split(/[\s,;]+/)
        .map(normalizeHostEntry)
        .filter(Boolean),
    ),
  );
  const hostUrl = normalizeRumHostUrl(env.NEXT_PUBLIC_RUM_HOST_URL);
  const rawEnv = (env.NEXT_PUBLIC_RUM_ENV ?? "production").trim().toLowerCase();
  const rumEnv = (ALLOWED_ENVS.has(rawEnv) ? rawEnv : "production") as RumRuntimeConfig["env"];

  return {
    enabled,
    appId,
    allowedHosts,
    hostUrl,
    env: rumEnv,
    active: enabled && Boolean(appId) && allowedHosts.length > 0,
  };
}

export function isHostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  const normalized = normalizeHostEntry(hostname);
  if (!normalized || !allowedHosts.length) return false;
  return allowedHosts.includes(normalized);
}

export function isPublicId(value: string | undefined | null): value is string {
  return typeof value === "string" && PUBLIC_ID_PATTERN.test(value);
}

export function isExcludedPath(pathname: string): boolean {
  const clean = pathname.trim() || "/";
  return (
    clean === "/manage" ||
    clean.startsWith("/manage/") ||
    clean === "/editor/owner" ||
    clean.startsWith("/editor/owner/") ||
    clean === "/api" ||
    clean.startsWith("/api/") ||
    clean === "/search" ||
    clean === "/find"
  );
}

export function parseIgnoreFlagFromSearch(search: string): boolean | null {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const rumIgnore = params.get("rum_ignore")?.trim().toLowerCase();
  if (rumIgnore === "1" || rumIgnore === "true") return true;
  if (rumIgnore === "0" || rumIgnore === "false") return false;
  const analyticsFlag = params.get("analytics")?.trim().toLowerCase();
  if (analyticsFlag === "off" || analyticsFlag === "0" || analyticsFlag === "false") return true;
  if (analyticsFlag === "on" || analyticsFlag === "1" || analyticsFlag === "true") return false;
  return null;
}

export function resolvePublicPage(pathname: string, search = ""): PublicPageDescriptor | null {
  const cleanPath = (pathname || "/").replace(/\/+$/, "") || "/";
  if (isExcludedPath(cleanPath)) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);

  if (cleanPath === "/") {
    const view = params.get("view");
    const sort = params.get("sort");
    if (view === "comp-trends") {
      return { category: "home", key: "home:comp_trends", canonicalPath: "/?view=comp-trends" };
    }
    if (view === "hero-augments") {
      return { category: "home", key: "home:hero_augments", canonicalPath: "/?view=hero-augments" };
    }
    if (sort === "category" || sort === "mean") {
      return { category: "home", key: "home:all_guides", canonicalPath: "/?view=all-guides" };
    }
    return { category: "home", key: "home:recommended", canonicalPath: "/" };
  }

  if (cleanPath.startsWith("/guides/")) {
    const id = cleanPath.slice("/guides/".length);
    if (!id || id.includes("/") || !isPublicId(id)) return null;
    const sectionId = resolveGuideSectionId(id);
    return { category: "guide", key: `guide:${sectionId}`, canonicalPath: canonicalGuidePath(sectionId) };
  }

  if (cleanPath === "/heroes") {
    if (params.get("tab") === "stats") {
      return { category: "heroes", key: "heroes:stats", canonicalPath: "/heroes?tab=stats" };
    }
    if (params.get("view") === "grid") {
      return { category: "heroes", key: "heroes:grid", canonicalPath: "/heroes?view=grid" };
    }
    return { category: "heroes", key: "heroes:list", canonicalPath: "/heroes" };
  }

  if (cleanPath === "/items") return { category: "items", key: "items", canonicalPath: "/items" };
  if (cleanPath === "/emblems") return { category: "items", key: "emblems", canonicalPath: "/emblems" };
  if (cleanPath === "/traits") return { category: "traits", key: "traits", canonicalPath: "/traits" };
  if (cleanPath === "/traits/medley") return { category: "traits", key: "traits:medley", canonicalPath: "/traits/medley" };
  if (cleanPath === "/augments") return { category: "augments", key: "augments", canonicalPath: "/augments" };
  if (cleanPath === "/combos") return { category: "combos", key: "combos", canonicalPath: "/combos" };
  if (cleanPath === "/editor") return { category: "editor", key: "editor", canonicalPath: "/editor" };
  if (cleanPath === "/updates") return { category: "updates", key: "updates", canonicalPath: "/updates" };

  return null;
}

export function buildCanonicalPageUrl(origin: string, pathname: string, search = ""): string {
  const safeOrigin = (() => {
    try {
      return new URL(origin).origin;
    } catch {
      return "https://invalid.local";
    }
  })();
  const resolved = resolvePublicPage(pathname, search);
  return resolved ? `${safeOrigin}${resolved.canonicalPath}` : `${safeOrigin}/`;
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function resolveEntryChannel(input: {
  search: string;
  referrer: string;
  currentHost: string;
  allowedHosts?: readonly string[];
  hasSessionNavigation?: boolean;
}): EntryChannel {
  if (input.hasSessionNavigation) return "internal";

  const params = new URLSearchParams(input.search.startsWith("?") ? input.search : `?${input.search}`);
  for (const paramKey of ["utm_source", "src", "channel"] as const) {
    const raw = params.get(paramKey)?.trim().toLowerCase();
    if (raw && raw in CAMPAIGN_ALIASES) {
      return CAMPAIGN_ALIASES[raw];
    }
  }

  const ref = input.referrer.trim();
  if (!ref) return "direct";

  let refHost = "";
  try {
    refHost = new URL(ref).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  if (!refHost) return "direct";

  const normalizedCurrent = normalizeHostEntry(input.currentHost);
  if (refHost === normalizedCurrent || (input.allowedHosts && input.allowedHosts.includes(refHost))) {
    return "internal";
  }

  for (const [suffix, channel] of REFERRER_CHANNEL_SUFFIXES) {
    if (hostMatchesSuffix(refHost, suffix)) return channel;
  }
  for (const suffix of SEARCH_ENGINE_SUFFIXES) {
    if (hostMatchesSuffix(refHost, suffix)) return "search_engine";
  }
  return "external";
}

function classifyHomePath(pathWithSearch: string): GuideEntrySource {
  try {
    const parsed = new URL(pathWithSearch, "https://local.invalid");
    if (parsed.pathname !== "/" && parsed.pathname !== "/find" && parsed.pathname !== "/search") {
      return "other";
    }
    if (parsed.searchParams.get("q")?.trim()) return "site_search";
    const view = parsed.searchParams.get("view");
    const sort = parsed.searchParams.get("sort");
    if (view === "hero-augments" || view === "comp-trends" || sort === "category" || sort === "mean") {
      return "guide_list";
    }
    return "home_rec";
  } catch {
    return "other";
  }
}

export function resolveGuideEntrySource(input: {
  recordedSource?: GuideEntrySource | null;
  returnTo?: string | null;
  referrer?: string;
  currentHost?: string;
  allowedHosts?: readonly string[];
}): GuideEntrySource {
  if (input.recordedSource && GUIDE_SOURCES.has(input.recordedSource)) {
    return input.recordedSource;
  }

  if (input.returnTo) {
    return classifyHomePath(input.returnTo);
  }

  const ref = (input.referrer ?? "").trim();
  if (!ref) return "direct";
  try {
    const parsed = new URL(ref);
    const refHost = parsed.hostname.toLowerCase();
    const current = normalizeHostEntry(input.currentHost ?? "");
    const sameSite = refHost === current || Boolean(input.allowedHosts?.includes(refHost));
    if (!sameSite) return "direct";
    return classifyHomePath(parsed.pathname + parsed.search);
  } catch {
    return "direct";
  }
}

export function rankBucket(positionOneBased: number): RankBucket {
  if (!Number.isFinite(positionOneBased) || positionOneBased <= 1) return "1";
  if (positionOneBased <= 3) return "2-3";
  if (positionOneBased <= 10) return "4-10";
  return "11+";
}

export function normalizeSearchResultType(kindOrHref: string | null | undefined): SearchResultType {
  const raw = (kindOrHref ?? "").trim().toLowerCase();
  if (raw === "guide" || raw === "guides") return "guide";
  if (raw === "unit" || raw === "units" || raw === "hero" || raw === "heroes") return "unit";
  if (raw === "item" || raw === "items" || raw === "gear" || raw === "emblem" || raw === "emblems") return "item";
  if (raw === "trait" || raw === "traits") return "trait";
  if (raw === "augment" || raw === "augments") return "augment";
  if (raw.startsWith("/guides/")) return "guide";
  if (raw.startsWith("/heroes")) return "unit";
  if (raw.startsWith("/items") || raw.startsWith("/emblems")) return "item";
  if (raw.startsWith("/traits")) return "trait";
  if (raw.startsWith("/augments")) return "augment";
  return "other";
}

export function extractPublicGuideIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const parsed = new URL(href, "https://local.invalid");
    if (!parsed.pathname.startsWith("/guides/")) return null;
    const id = parsed.pathname.slice("/guides/".length).replace(/\/+$/, "");
    return isPublicId(id) ? resolveGuideSectionId(id) : null;
  } catch {
    return null;
  }
}

export function isWhitelistedEventName(name: unknown): name is AnalyticsEventName {
  return typeof name === "string" && ALLOWED_EVENTS.has(name);
}

export function sanitizeAnalyticsPayload(payload: AnalyticsPayload): AnalyticsPayload | null {
  if (!isWhitelistedEventName(payload.name)) return null;

  switch (payload.name) {
    case "page_view": {
      if (!PAGE_CATEGORIES.has(payload.ext1)) return null;
      if (!/^[a-z0-9:_-]{1,80}$/i.test(payload.ext2)) return null;
      if (!ENTRY_CHANNELS.has(payload.ext3)) return null;
      return payload;
    }
    case "guide_view": {
      if (!isPublicId(payload.ext1)) return null;
      if (!GUIDE_MODES.has(payload.ext2)) return null;
      if (!GUIDE_SOURCES.has(payload.ext3)) return null;
      return payload;
    }
    case "search_results": {
      if (!SEARCH_STATES.has(payload.ext1)) return null;
      if (!SEARCH_SURFACES.has(payload.ext2)) return null;
      return { name: payload.name, ext1: payload.ext1, ext2: payload.ext2, ext3: "" };
    }
    case "search_result_open": {
      if (!SEARCH_TYPES.has(payload.ext1)) return null;
      if (!RANK_BUCKETS.has(payload.ext2)) return null;
      if (!SEARCH_SURFACES.has(payload.ext3)) return null;
      return payload;
    }
    case "tool_action": {
      if (!TOOL_ACTIONS.has(payload.ext1)) return null;
      const guideId = payload.ext2 ? (isPublicId(payload.ext2) ? payload.ext2 : null) : "";
      if (guideId === null) return null;
      if (!TOOL_SURFACES.has(payload.ext3)) return null;
      return { name: payload.name, ext1: payload.ext1, ext2: guideId, ext3: payload.ext3 };
    }
  }
}
