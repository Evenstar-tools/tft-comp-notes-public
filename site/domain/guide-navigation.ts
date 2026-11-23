import { parseGuideFilters, type GuideFilters } from "./guide-reading";

const filterKeys = ["q", "view", "category", "style", "cost", "sort", "scope", "exclude"] as const;
export type GuideSearchPage = "/" | "/find" | "/search";
export const guideNavigationChange = "guide-navigation-change";

export function guideNavigationParams(filters: GuideFilters) {
  const params = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key]?.trim();
    if (value && (key !== "scope" || (value !== "all" && filters.q?.trim())) && (key !== "exclude" || filters.q?.trim()) &&
      (key !== "sort" || value !== "recommended")) params.set(key, value);
  }
  return params;
}

export function guideNavigationHref(path: GuideSearchPage, filters: GuideFilters, fromItem?: string) {
  const params = guideNavigationParams(filters);
  if (path !== "/search" && fromItem) params.set("fromItem", fromItem);
  return path + (params.size ? "?" + params : "");
}

export function currentGuideNavigation(path: GuideSearchPage, current: Pick<Location, "pathname" | "search">) {
  if (current.pathname !== "/" && current.pathname !== "/find" && current.pathname !== "/search") return path;
  const filters = parseGuideFilters(Object.fromEntries(new URLSearchParams(current.search)));
  if (current.pathname === "/find" && filters.sort === "category") delete filters.sort;
  return guideNavigationHref(path, filters);
}
