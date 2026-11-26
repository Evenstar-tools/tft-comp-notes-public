"use client";

import {
  buildCanonicalPageUrl,
  isExcludedPath,
  isHostAllowed,
  isPublicId,
  isWhitelistedEventName,
  normalizeSearchResultType,
  parseIgnoreFlagFromSearch,
  parseRumConfig,
  rankBucket,
  resolveEntryChannel,
  resolveGuideEntrySource,
  resolvePublicPage,
  sanitizeAnalyticsPayload,
  type AnalyticsPayload,
  type GuideEntrySource,
  type GuideViewMode,
  type RumRuntimeConfig,
  type SearchResultState,
  type SearchResultType,
  type SearchSurface,
  type ToolActionName,
  type ToolSurface,
} from "@/domain/analytics";

type AegisLike = {
  rateLimitReady?: boolean;
  sendNow?: boolean;
  getOriginFrom?: () => string;
  reportEvent: (event: {
    name: string;
    ext1?: string;
    ext2?: string;
    ext3?: string;
    originFrom?: string;
  }) => void;
  destroy?: (force?: boolean) => void;
};

const IGNORE_STORAGE_KEY = "tft_rum_ignore";
const SESSION_ACTIVE_KEY = "tft_rum_session_active";
const GUIDE_ENTRY_KEY = "tft_rum_guide_entry";
const GUIDE_ENTRY_TTL_MS = 15_000;
const MAX_PENDING_EVENTS = 32;

const runtimeConfig: RumRuntimeConfig = parseRumConfig({
  NEXT_PUBLIC_RUM_ENABLED: process.env.NEXT_PUBLIC_RUM_ENABLED,
  NEXT_PUBLIC_RUM_APP_ID: process.env.NEXT_PUBLIC_RUM_APP_ID,
  NEXT_PUBLIC_RUM_ALLOWED_HOSTS: process.env.NEXT_PUBLIC_RUM_ALLOWED_HOSTS,
  NEXT_PUBLIC_RUM_HOST_URL: process.env.NEXT_PUBLIC_RUM_HOST_URL,
  NEXT_PUBLIC_RUM_ENV: process.env.NEXT_PUBLIC_RUM_ENV,
});

let aegisInstance: AegisLike | null = null;
let aegisPromise: Promise<AegisLike | null> | null = null;
let sdkBroken = false;
const pendingQueue: Array<{ payload: AnalyticsPayload; originFrom: string }> = [];

function safeReadStorage(storage: "session" | "local", key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (storage === "session" ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(storage: "session" | "local", key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    const store = storage === "session" ? window.sessionStorage : window.localStorage;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browser modes.
  }
}

export function syncAnalyticsIgnoreFlag() {
  if (typeof window === "undefined") return;
  const flag = parseIgnoreFlagFromSearch(window.location.search);
  if (flag === true) safeWriteStorage("session", IGNORE_STORAGE_KEY, "1");
  else if (flag === false) {
    safeWriteStorage("session", IGNORE_STORAGE_KEY, null);
    safeWriteStorage("local", IGNORE_STORAGE_KEY, null);
  }
}

function isIgnoredVisitor(): boolean {
  if (typeof window === "undefined") return true;
  syncAnalyticsIgnoreFlag();
  if (safeReadStorage("session", IGNORE_STORAGE_KEY) === "1") return true;
  if (safeReadStorage("local", IGNORE_STORAGE_KEY) === "1") return true;
  return false;
}

function canCollectOnCurrentPage(): boolean {
  if (typeof window === "undefined" || sdkBroken) return false;
  if (!runtimeConfig.active) return false;
  if (!isHostAllowed(window.location.hostname, runtimeConfig.allowedHosts)) return false;
  if (isExcludedPath(window.location.pathname)) return false;
  if (isIgnoredVisitor()) return false;
  return true;
}

function currentCanonicalUrl(): string {
  if (typeof window === "undefined") return "https://invalid.local/";
  return buildCanonicalPageUrl(window.location.origin, window.location.pathname, window.location.search);
}

function flushPending(instance: AegisLike) {
  if (!pendingQueue.length) return;
  const batch = pendingQueue.splice(0, pendingQueue.length);
  for (const item of batch) {
    try {
      instance.reportEvent({
        name: item.payload.name,
        ext1: item.payload.ext1,
        ext2: item.payload.ext2,
        ext3: item.payload.ext3,
        originFrom: item.originFrom,
      });
    } catch {
      // Never impact site functionality.
    }
  }
}

function ensureAegis(): Promise<AegisLike | null> {
  if (!canCollectOnCurrentPage()) return Promise.resolve(null);
  if (aegisInstance) return Promise.resolve(aegisInstance);
  if (aegisPromise) return aegisPromise;

  aegisPromise = import("aegis-web-sdk")
    .then(mod => {
      if (!canCollectOnCurrentPage()) return null;
      const AegisCtor = (mod.default ?? mod) as new (config: Record<string, unknown>) => AegisLike;
      const instance = new AegisCtor({
        id: runtimeConfig.appId,
        hostUrl: runtimeConfig.hostUrl,
        env: runtimeConfig.env,
        aid: true,
        device: true,
        // Disable every automatic collector so page_view is never double-counted
        // and no extra performance/error/speed traffic consumes quota.
        spa: false,
        onError: false,
        pagePerformance: false,
        webVitals: false,
        reportApiSpeed: false,
        reportAssetSpeed: false,
        reportBridgeSpeed: false,
        reportLoadPackageSpeed: false,
        speedSample: false,
        onClose: false,
        blankScreen: false,
        lagMonitor: false,
        memoryMonitor: false,
        apiLog: false,
        slowApiLog: false,
        pageLoadLog: false,
        slowPageLoadLog: false,
        assetLog: false,
        slowAssetLog: false,
        reportRetry: false,
        gzip: false,
        delay: 0,
        pvUrl: "",
        whiteListUrl: "",
        rateLimitUrl: "",
        urlHandler: () => currentCanonicalUrl(),
        beforeRequest: (data: { logType?: string; logs?: { name?: unknown } }) => {
          if (data?.logType !== "event") return false;
          if (!isWhitelistedEventName(data?.logs?.name)) return false;
          return data;
        },
        onBeforeRequest: (options: { type?: string; url?: string }) => {
          if (options?.type !== "event") return null;
          if (!options.url || !options.url.includes("/collect/events")) return null;
          return options;
        },
      });
      instance.rateLimitReady = true;
      instance.sendNow = true;
      instance.getOriginFrom = () => currentCanonicalUrl();
      aegisInstance = instance;
      flushPending(instance);
      return instance;
    })
    .catch(() => {
      sdkBroken = true;
      pendingQueue.length = 0;
      return null;
    });

  return aegisPromise;
}

function sendAnalyticsEvent(raw: AnalyticsPayload) {
  if (!canCollectOnCurrentPage()) return;
  const payload = sanitizeAnalyticsPayload(raw);
  if (!payload) return;
  const originFrom = currentCanonicalUrl();

  if (aegisInstance) {
    try {
      aegisInstance.reportEvent({
        name: payload.name,
        ext1: payload.ext1,
        ext2: payload.ext2,
        ext3: payload.ext3,
        originFrom,
      });
    } catch {
      // Never surface telemetry errors to users.
    }
    return;
  }

  if (pendingQueue.length < MAX_PENDING_EVENTS) {
    pendingQueue.push({ payload, originFrom });
  }
  void ensureAegis();
}

export function rememberGuideEntry(guideId: string | null | undefined, source: GuideEntrySource) {
  if (!isPublicId(guideId)) return;
  safeWriteStorage(
    "session",
    GUIDE_ENTRY_KEY,
    JSON.stringify({ guideId, source, ts: Date.now() }),
  );
}

function consumeGuideEntry(guideId: string): GuideEntrySource | null {
  const raw = safeReadStorage("session", GUIDE_ENTRY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { guideId?: string; source?: GuideEntrySource; ts?: number };
    if (parsed.guideId === guideId && typeof parsed.ts === "number" && Date.now() - parsed.ts <= GUIDE_ENTRY_TTL_MS) {
      safeWriteStorage("session", GUIDE_ENTRY_KEY, null);
      return parsed.source ?? null;
    }
  } catch {
    safeWriteStorage("session", GUIDE_ENTRY_KEY, null);
  }
  return null;
}

export function trackPageView(pathname?: string, search?: string): string | null {
  if (typeof window === "undefined") return null;
  const path = pathname ?? window.location.pathname;
  const query = search ?? window.location.search;
  const page = resolvePublicPage(path, query);
  if (!page) return null;

  const hasSessionNavigation = safeReadStorage("session", SESSION_ACTIVE_KEY) === "1";
  const channel = resolveEntryChannel({
    search: query,
    referrer: document.referrer || "",
    currentHost: window.location.hostname,
    allowedHosts: runtimeConfig.allowedHosts,
    hasSessionNavigation,
  });
  safeWriteStorage("session", SESSION_ACTIVE_KEY, "1");

  sendAnalyticsEvent({
    name: "page_view",
    ext1: page.category,
    ext2: page.key,
    ext3: channel,
  });
  return page.key;
}

export function trackGuideView(input: {
  guideId: string;
  mode: GuideViewMode;
  source?: GuideEntrySource;
  returnTo?: string | null;
}) {
  if (!isPublicId(input.guideId)) return;
  const recordedSource = input.mode === "detail" ? consumeGuideEntry(input.guideId) : null;
  const entrySource =
    input.source ??
    resolveGuideEntrySource({
      recordedSource,
      returnTo: input.returnTo,
      referrer: typeof document !== "undefined" ? document.referrer || "" : "",
      currentHost: typeof window !== "undefined" ? window.location.hostname : "",
      allowedHosts: runtimeConfig.allowedHosts,
    });

  sendAnalyticsEvent({
    name: "guide_view",
    ext1: input.guideId,
    ext2: input.mode,
    ext3: entrySource,
  });
}

export function trackSearchResults(state: SearchResultState, surface: SearchSurface) {
  sendAnalyticsEvent({
    name: "search_results",
    ext1: state,
    ext2: surface,
    ext3: "",
  });
}

export function trackSearchResultOpen(input: {
  resultType: SearchResultType | string;
  positionOneBased: number;
  surface: SearchSurface;
}) {
  sendAnalyticsEvent({
    name: "search_result_open",
    ext1: normalizeSearchResultType(input.resultType),
    ext2: rankBucket(input.positionOneBased),
    ext3: input.surface,
  });
}

export function trackToolAction(input: {
  action: ToolActionName;
  guideId?: string | null;
  surface: ToolSurface;
}) {
  const safeGuideId = isPublicId(input.guideId) ? input.guideId : "";
  sendAnalyticsEvent({
    name: "tool_action",
    ext1: input.action,
    ext2: safeGuideId,
    ext3: input.surface,
  });
}
