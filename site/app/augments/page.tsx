import { season } from "@/data";
import { isLiveLaunchTransition, sameEdition } from "@/domain/version-updates";
import { AugmentLibrary } from "@/components/AugmentLibrary";
import { publishedSnapshot } from "@/server/publication";
import { displayGuideName } from "@/domain/trait-names.mjs";
import { heroAugmentForGuide } from "@/domain/hero-augments";
import { sectionTeams } from "@/domain/document-flow";
import { guideBoardName, guideStrategyLabel, primaryFirst } from "@/domain/guide-reading";
import type { AugmentGuide } from "@/domain/augment-library";
import { augmentBoardSamples, type PlacementBatch } from "@/domain/guide-placement";
import placements from "@/data/guide-placement.json";
import current from "@/data/current-patch.json";
import "./augments.css";

export const metadata = { title: "海克斯" };
export const dynamic = "force-dynamic";

export default async function AugmentsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query: Record<string, string | undefined> = Object.fromEntries(Object.entries(params).map(([key, value]) =>
    [key, Array.isArray(value) ? value[0] : value]));
  const statsView = query.view === "stats" || query.view === "full" ||
    Boolean(query.season && (query.season !== "19" || query.realm === "live"));
  const publication = statsView ? null : await publishedSnapshot().catch(() => null);
  const guides: Record<string, AugmentGuide> = {};
  const activeTeams = new Set<string>();
  const patch = /^s19-pbe-(\d+\.\d+)(?:\.|$)/.exec(season.id)?.[1] ?? "";
  const launchPatch = isLiveLaunchTransition(current) ? (current.metaTftPatch?.patch ?? "") + (current.metaTftPatch?.bPatch ?? "") : undefined;
  const sections = (patch || launchPatch !== undefined) && publication && sameEdition(season.id, publication.season.id) ? publication.sections : [];
  for (const section of sections) {
    if (section.gameData && !sameEdition(season.id, section.gameData.id)) continue;
    const augment = heroAugmentForGuide(section);
    if (augment) {
      const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
      const primary = teams[0];
      const boardNames = Object.fromEntries(teams.map(team => [
        team.id, displayGuideName(team === primary
          ? guideStrategyLabel(section, team, section.gameData ?? season, primary) ?? guideBoardName(team)
          : guideBoardName(team)),
      ]));
      guides[augment.id] = { title: displayGuideName(section.title), sectionId: section.id, primaryTeamId: primary?.id, boardNames };
      teams.forEach(team => activeTeams.add(team.id));
    }
  }
  const batch = placements as PlacementBatch;
  const samples = !statsView && patch && batch.edition === "s19-pbe-" + patch && batch.patch === "PBE " + patch
    ? augmentBoardSamples(batch.records.filter(record => record.augmentBuild && activeTeams.has(record.augmentBuild.teamId)), batch.date ?? "") : {};
  return <AugmentLibrary guides={guides} samples={samples} initialId={query.id ?? ""} initialSeason={query.season} initialRealm={query.realm}
    initialView={query.view} initialPatch={query.patch} currentPatch={patch} launchPatch={launchPatch} initialFilters={query} initialQuery={query.q ?? ""} />;
}
