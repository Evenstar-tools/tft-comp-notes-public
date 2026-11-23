import { redirect } from "next/navigation";
import { guideNavigationHref } from "@/domain/guide-navigation";
import { parseGuideFilters } from "@/domain/guide-reading";

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  redirect(guideNavigationHref("/", parseGuideFilters(params)));
}
