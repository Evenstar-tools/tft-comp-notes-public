import { redirect } from "next/navigation";
import { guideNavigationHref } from "@/domain/guide-navigation";
import { parseGuideFilters } from "@/domain/guide-reading";
import { validItemLibraryReturn } from "@/domain/links";
import { searchQueryLimit } from "@/domain/site-search";
import { SiteSearchOverlay } from "@/components/SiteSearchOverlay";

export default async function FindPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseGuideFilters(params);
  const fromItem = validItemLibraryReturn(params.fromItem);
  const { q, ...legacyFilters } = filters;
  if (fromItem || Object.values(legacyFilters).some(Boolean)) {
    redirect(guideNavigationHref("/", { ...filters, sort: filters.sort ?? "category" }, fromItem));
  }
  const query = typeof params.q === "string" ? params.q.trim().slice(0, searchQueryLimit) : q ?? "";
  return <main id="main" className="task-page"><h1>站内搜索</h1><SiteSearchOverlay inlineQuery={query} /></main>;
}
