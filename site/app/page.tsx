import { publicGuidePublication } from "@/server/publication";
import { readableSection, sectionTeams } from "@/domain/document-flow";
import { guideLink, isEditorialSection, parseGuideFilters } from "@/domain/guide-reading";
import { guideNavigationHref } from "@/domain/guide-navigation";
import { guideWearerQuery, splitGuideConditions } from "@/domain/guide-search";
import { validItemLibraryReturn } from "@/domain/links";
import { heroAugmentCategory } from "@/domain/hero-augments";
import { isVersionUpdate, sameEdition } from "@/domain/version-updates";
import { currentPatchRecommendations } from "@/server/patch-recommendations";
import currentPatch from "@/data/current-patch.json";
import { GuideList } from "@/components/GuideList";
import { HomeGuidePosition } from "@/components/HomeGuidePosition";
import { HomeGuideBanner } from "@/components/GuideNavigation";
import { performSiteSearch } from "@/server/site-search";
import "./home-recommendations.css";

export const dynamic = "force-dynamic";
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [live, query] = await Promise.all([publicGuidePublication(), searchParams]);
  const filters = parseGuideFilters(query);
  const fromItem = validItemLibraryReturn(query.fromItem);
  const term = filters.q ?? "";
  const initialSearch = term && !filters.scope && !guideWearerQuery(term) && splitGuideConditions(term).length === 1
    ? await performSiteSearch(term, filters.exclude, live).catch(() => undefined) : undefined;
  const sections = live?.sections.filter(section => readableSection(section) && !isEditorialSection(section) && !isVersionUpdate(section)) ?? [];
  const guides = sections.filter(section => section.kind === "guide" || sectionTeams(section).length || section.title !== section.category);
  const heroGuides = guides.filter(section => section.category === heroAugmentCategory);
  const showingHeroAugments = filters.view === "hero-augments";
  const regularGuides = guides.filter(section => section.category !== heroAugmentCategory);
  const notes = sections.filter(section => !guides.includes(section));
  const patch = live && sameEdition(live.season.id, currentPatch.seasonId) ? currentPatch : undefined;
  return (
    <div className="home-library">
      {live && guides.length ? (
        <>
          <GuideList sections={regularGuides} heroSections={heroGuides} season={live.season} initial={filters} initialSearch={initialSearch}
            recommendations={currentPatchRecommendations(live)} patch={patch} fromItem={fromItem} />
          <HomeGuidePosition />
        </>
      ) : <>
        <HomeGuideBanner patch={patch} />
        {showingHeroAugments && <a className="text-link" href={guideNavigationHref("/", { ...filters, view: undefined }, fromItem)}>常规阵容</a>}
        <section className="empty-state">
          <h2>{showingHeroAugments ? "暂无已发布英雄强化阵容" : "暂无已发布阵容"}</h2>
          <a className="text-link" href="/heroes">查看英雄图鉴</a>
        </section>
      </>}
      {!showingHeroAugments && !!notes.length && <nav className="flow-actions home-notes" aria-label="补充资料">
        {notes.map(note => <a key={note.id} href={guideLink(note.id)}>{note.title}</a>)}
      </nav>}
    </div>
  );
}
