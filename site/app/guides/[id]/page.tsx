import { notFound, permanentRedirect, redirect } from "next/navigation";
import { publicGuidePublication } from "@/server/publication";
import { DocumentView } from "@/components/DocumentView";
import { familyVariants, groupGuides } from "@/domain/guide-families";
import { teamPlacement } from "@/components/GuidePlacement";
import { guideSystems, rankGuideSystems } from "@/domain/guide-variant-strip";
import { canonicalGuidePath } from "@/domain/guide-slugs";
import { isVersionUpdate, publishedVersionUpdates, versionUpdateLink } from "@/domain/version-updates";
import { season } from "@/data";
import { validHomeReturn } from "@/lib/home-position";
import { validHeroReturn } from "@/domain/library-navigation";
import { validAugmentReturn } from "@/domain/augment-library";
import { validVersionReturn } from "@/domain/guide-reading";
import { currentPatchRecommendations } from "@/server/patch-recommendations";
import { patchRecommendationLabels } from "@/domain/patch-recommendations";
import currentPatch from "@/data/current-patch.json";
import familyStats from "@/data/guide-family-stats.json";
import placementBatch from "@/data/guide-placement.json";
import { readPosterShare, validItemLibraryReturn } from "@/domain/links";
import { boardStages } from "@/domain/team-stages";
import { resolveGuideRequest } from "@/domain/legacy-guide-redirects";
import { databaseConfigured } from "@/server/access";
import { hasOwnerSession } from "@/server/owner-session";
import "./guide-detail.css";
export const metadata = { title: "阵容笔记" };
export const dynamic = "force-dynamic";
export default async function Guide({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { team, stage, flex, poster, posterFormat, posterStages, from, stats } = await searchParams;
  const returnTo = validHomeReturn(from) ?? validAugmentReturn(from) ?? validVersionReturn(from) ?? validHeroReturn(from) ?? validItemLibraryReturn(from);
  const initialStage = boardStages.find(option => option === stage);
  const initialFlex = typeof flex === "string" ? flex : undefined;
  const posterShare = readPosterShare(posterFormat, posterStages);
  const live = await publicGuidePublication();
  const linkParams = {
    stage: initialStage, flex: initialFlex, poster: poster === "1" ? poster : undefined,
    posterFormat: posterShare.format, posterStages: typeof posterStages === "string" ? posterStages : undefined,
    from: returnTo, stats: typeof stats === "string" ? stats : undefined,
  };
  const request = resolveGuideRequest(id, typeof team === "string" ? team : undefined, live?.sections ?? [], linkParams);
  if (!live || !request) notFound();
  if (request.redirectTo !== undefined) permanentRedirect(request.redirectTo);
  const { section, teamId } = request;
  if (isVersionUpdate(section)) {
    if (publishedVersionUpdates(season.id, live).some(update => update.id === section.id)) redirect(versionUpdateLink(section.id));
    notFound();
  }
  const family = groupGuides(live.sections, live.season, teamPlacement).find(group => group.sections.some(s => s.id === section.id));
  const preferred = family?.lead.section.id === section.id ? family.lead.team : undefined;
  const variants = Object.fromEntries((family?.boards ?? []).filter(b => b.section.id === section.id)
    .map(b => [b.team.id, familyVariants(family!, b.team.id)]));
  const systemsFor = (candidate: typeof section) => guideSystems(candidate, familyStats,
    (candidate.gameData ?? live.season).id, currentPatch, placementBatch.minGames);
  const localSystems = systemsFor(section);
  const siblings = Object.values(variants).flat().filter(variant => variant.sectionId !== section.id);
  const siblingSystems = (family?.sections ?? []).filter(candidate => candidate.id !== section.id).flatMap(candidate =>
    systemsFor(candidate).flatMap(system => {
      const sibling = siblings.find(variant => variant.sectionId === candidate.id && system.boardIds.includes(variant.teamId));
      return sibling ? [{ ...system, change: sibling.change }] : [];
    }));
  const systems = rankGuideSystems([...localSystems, ...siblingSystems]);
  const best = systems[0]?.stat ? systems[0] : undefined;
  if (team === undefined && best && best.sectionId !== section.id && !initialStage && !initialFlex && !linkParams.poster) {
    redirect(canonicalGuidePath(best.sectionId, best.teamId, linkParams));
  }
  const bestLocal = localSystems[0]?.stat ? localSystems[0].teamId : undefined;
  const entryTeam = section.reroll?.entryTeamId ?? preferred?.id;
  const defaultTeam = bestLocal ?? (entryTeam && section.reroll?.added.includes(entryTeam) && databaseConfigured() && await hasOwnerSession()
    ? section.primaryTeamId ?? section.team?.id ?? entryTeam : entryTeam);
  const patchAdvice = currentPatchRecommendations(live)?.entries.filter(entry => entry.sectionId === section.id).map(entry => ({
    teamId: entry.teamId, note: entry.note, label: "本版 · " + patchRecommendationLabels[entry.status],
    href: versionUpdateLink(currentPatch.updateId, { anchor: entry.sources?.length ? "patch-recommendations" : undefined }),
  }));
  return (
    <div className="reading-page guide-detail-page">
      <DocumentView section={section} gameData={section.gameData ?? live.season} publicationId={live.id}
        initialTeam={teamId} defaultTeam={defaultTeam}
        initialStage={initialStage} initialFlex={initialFlex}
        variants={variants} systems={systems} openPoster={poster === "1"} returnTo={returnTo}
        initialPosterShare={poster === "1" ? posterShare : undefined} patchAdvice={patchAdvice} />
    </div>
  );
}
