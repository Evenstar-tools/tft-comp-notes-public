import { ItemLibrary, type ItemGuideUse } from "@/components/ItemLibrary";
import { itemMap } from "@/data";
import { readableSection, sectionTeams } from "@/domain/document-flow";
import { guideBoardName, primaryFirst } from "@/domain/guide-reading";
import { gearFilters, type GearPageParams } from "@/domain/gear-library";
import { itemGuideOrigin } from "@/domain/links";
import { livePublication } from "@/server/publication";

export const dynamic = "force-dynamic";

export default async function Items({ searchParams }: {
  searchParams: Promise<GearPageParams>;
}) {
  const params = await searchParams;
  const { item, unit, view, from } = params;
  const origin = itemGuideOrigin(from);
  let guideOrigin: typeof origin;
  const examples: Record<string, ItemGuideUse[]> = {};
  try {
    const live = await livePublication();
    for (const section of live?.sections.filter(readableSection) ?? []) {
      const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
      for (const team of teams) {
        if (origin?.sectionId === section.id && origin.teamId === team.id) guideOrigin = origin;
        const boardName = guideBoardName(team);
        for (const piece of team.pieces) for (const itemId of piece.items) {
          if (!itemMap.has(itemId)) continue;
          const uses = examples[itemId] ??= [];
          if (uses.some(use => use.sectionId === section.id && use.teamId === team.id && use.unitId === piece.unitId)) continue;
          uses.push({ sectionId: section.id, teamId: team.id, title: section.title, boardName, isPrimary: team.id === teams[0]?.id, unitId: piece.unitId });
        }
      }
    }
  } catch {
    // The equipment catalogue and match samples don't depend on published guide content.
  }
  return <ItemLibrary itemId={item} unitId={unit} initialView={view} initialFilters={gearFilters(params)} openBuilds={params.builds === "1"}
    examples={examples} origin={guideOrigin} />;
}
