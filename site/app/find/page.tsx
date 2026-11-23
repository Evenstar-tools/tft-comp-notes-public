import { redirect } from "next/navigation";
import { guideNavigationHref } from "@/domain/guide-navigation";
import { parseGuideFilters } from "@/domain/guide-reading";
import { validItemLibraryReturn } from "@/domain/links";

export default async function FindPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseGuideFilters(params);
  redirect(guideNavigationHref("/", { ...filters, sort: filters.sort ?? "category" }, validItemLibraryReturn(params.fromItem)));
}
