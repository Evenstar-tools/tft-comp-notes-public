import { publicGuidePublication } from "@/server/publication";
import { packedHomeGuideIndex } from "@/server/home-guide-index";
import type { Publication, Section } from "@/domain/document";
import { season as currentSeason } from "@/data";
import { readableSection, sectionTeams } from "@/domain/document-flow";
import { homeGuidePreview } from "@/domain/home-guide-preview";
import { guideLink, isEditorialSection, parseGuideFilters } from "@/domain/guide-reading";
import { guideNavigationHref } from "@/domain/guide-navigation";
import { guideWearerQuery, splitGuideConditions } from "@/domain/guide-search";
import { validItemLibraryReturn } from "@/domain/links";
import { heroAugmentCategory } from "@/domain/hero-augments";
import { editionScope, isLiveLaunchTransition, isOfficialEdition, isVersionUpdate, sameEdition } from "@/domain/version-updates";
import { currentPatchRecommendations } from "@/server/patch-recommendations";
import currentPatch from "@/data/current-patch.json";
import compTrendHistory from "@/data/comp-trends.json";
import { buildCompTrendModel } from "@/domain/comp-trends";
import { ArtifactTrendRanking } from "@/components/ArtifactTrendRanking";
import { GuideList } from "@/components/GuideList";
import { HomeGuidePosition } from "@/components/HomeGuidePosition";
import { HomeGuideBanner } from "@/components/GuideNavigation";
import { performSiteSearch } from "@/server/site-search";
import "./home-recommendations.css";

export const dynamic = "force-dynamic";

function homeTrends(live: Publication, guides: Section[], patch?: typeof currentPatch & { launchTransition?: boolean }) {
  if (!editionScope(live.season.id)) return;
  const boards = new Map(guides.map(section => [section.id, new Set(sectionTeams(section).map(team => team.id))]));
  const model = buildCompTrendModel(compTrendHistory, live.season, boards, patch);
  if (isLiveLaunchTransition(patch)) return model && model.days.length >= 2 ? model : undefined;
  return model ?? {
    scope: isOfficialEdition(live.season.id) ? "国际服排位 · 数据待更新" : "PBE · 数据待更新",
    days: [], tracks: [], patches: [], discoveries: [],
  };
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [live, query] = await Promise.all([publicGuidePublication(), searchParams]);
  const filters = parseGuideFilters(query);
  const fromItem = validItemLibraryReturn(query.fromItem);
  const term = filters.view === "comp-trends" ? undefined : splitGuideConditions(filters.q ?? "")[0];
  const initialSearch = term && !filters.scope && !guideWearerQuery(term)
    ? await performSiteSearch(term, filters.exclude, live).catch(() => undefined) : undefined;
  const sections = live?.sections.filter(section => readableSection(section) && !isEditorialSection(section) && !isVersionUpdate(section)) ?? [];
  const guides = sections.filter(section => section.kind === "guide" || sectionTeams(section).length || section.title !== section.category);
  const heroGuides = guides.filter(section => section.category === heroAugmentCategory);
  const showingHeroAugments = filters.view === "hero-augments";
  const regularGuides = guides.filter(section => section.category !== heroAugmentCategory);
  const notes = sections.filter(section => !guides.includes(section));
  const patch = live && sameEdition(live.season.id, currentPatch.seasonId) ? currentPatch : undefined;
  const homeSeason = live && sameEdition(live.season.id, currentSeason.id) ? currentSeason : live?.season;
  return (
    <div className="home-library">
      {live && homeSeason && guides.length ? (
        <>
          <GuideList index={packedHomeGuideIndex(live, () => ({
              sections: regularGuides.map(section => homeGuidePreview(section, homeSeason)),
              heroSections: heroGuides.map(section => homeGuidePreview(section, homeSeason)),
              trends: homeTrends(live, regularGuides, patch),
            }))}
            season={homeSeason === currentSeason ? undefined : homeSeason} initial={filters} initialSearch={initialSearch}
            recommendations={currentPatchRecommendations(live)}
            artifactRanking={<ArtifactTrendRanking edition={live.season.id} />} patch={patch} fromItem={fromItem} checkedAt={Date.now()} />
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
