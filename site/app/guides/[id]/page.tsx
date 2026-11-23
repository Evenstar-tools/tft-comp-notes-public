import { notFound, redirect } from "next/navigation";
import { publicGuidePublication } from "@/server/publication";
import { DocumentView } from "@/components/DocumentView";
import { familyVariants, groupGuides } from "@/domain/guide-families";
import { teamPlacement } from "@/components/GuidePlacement";
import { isVersionUpdate, publishedVersionUpdates, versionUpdateLink } from "@/domain/version-updates";
import { season } from "@/data";
import { validHomeReturn } from "@/lib/home-position";
import { validHeroReturn } from "@/domain/library-navigation";
import { validAugmentReturn } from "@/domain/augment-library";
import { validVersionReturn } from "@/domain/guide-reading";
import { currentPatchRecommendations } from "@/server/patch-recommendations";
import { patchRecommendationLabels } from "@/domain/patch-recommendations";
import currentPatch from "@/data/current-patch.json";
import { readPosterShare, validItemLibraryReturn } from "@/domain/links";
export const metadata = { title: "阵容笔记" };
export const dynamic = "force-dynamic";
export default async function Guide({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ team?: string | string[]; poster?: string | string[]; posterFormat?: string | string[]; posterStages?: string | string[]; from?: string | string[] }>;
}) {
  const { id } = await params;
  const { team, poster, posterFormat, posterStages, from } = await searchParams;
  const returnTo = validHomeReturn(from) ?? validAugmentReturn(from) ?? validVersionReturn(from) ?? validHeroReturn(from) ?? validItemLibraryReturn(from);
  const live = await publicGuidePublication();
  const section = live?.sections.find((entry) => entry.id === id);
  if (!section) notFound();
  if (isVersionUpdate(section)) {
    if (publishedVersionUpdates(season.id, live).some(update => update.id === id)) redirect(versionUpdateLink(id));
    notFound();
  }
  const family = groupGuides(live!.sections, live!.season, teamPlacement).find(group => group.sections.some(s => s.id === id));
  const preferred = family?.lead.section.id === id ? family.lead.team : undefined;
  const variants = Object.fromEntries((family?.boards ?? []).filter(b => b.section.id === id)
    .map(b => [b.team.id, familyVariants(family!, b.team.id)]));
  const patchAdvice = currentPatchRecommendations(live)?.entries.filter(entry => entry.sectionId === id).map(entry => ({
    teamId: entry.teamId, note: entry.note, label: "本版 · " + patchRecommendationLabels[entry.status],
    href: versionUpdateLink(currentPatch.updateId, { anchor: entry.sources?.length ? "patch-recommendations" : undefined }),
  }));
  return (
    <div className="reading-page">
      <DocumentView section={section} gameData={section.gameData ?? live!.season} publicationId={live!.id}
        initialTeam={typeof team === "string" ? team : section.reroll?.entryTeamId ?? preferred?.id} variants={variants} openPoster={poster === "1"} returnTo={returnTo}
        initialPosterShare={poster === "1" ? readPosterShare(posterFormat, posterStages) : undefined} patchAdvice={patchAdvice} />
    </div>
  );
}
