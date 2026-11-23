import { EmblemStats, type EmblemGuideUse } from "@/components/EmblemStats";
import { itemMap } from "@/data";
import { readableSection, sectionTeams } from "@/domain/document-flow";
import { guideBoardName, guideLink, primaryFirst } from "@/domain/guide-reading";
import { gearFilters, type GearPageParams } from "@/domain/gear-library";
import { livePublication } from "@/server/publication";
import { displayGuideName } from "@/domain/trait-names.mjs";
import "./emblem-stats.css";

export const metadata = { title: "转职数据" };
export const dynamic = "force-dynamic";

export default async function Emblems({ searchParams }: { searchParams: Promise<GearPageParams> }) {
  const params = await searchParams;
  const published = await livePublication().catch(() => null);
  const guide = published?.sections.find(section => section.title === "K/DA转芬妮");
  const guideUses: Record<string, EmblemGuideUse[]> = {};
  for (const section of published?.sections.filter(readableSection) ?? []) {
    for (const team of primaryFirst(sectionTeams(section), section.primaryTeamId)) {
      const board = guideBoardName(team);
      for (const piece of team.pieces) for (const itemId of piece.items) {
        if (itemMap.get(itemId)?.category !== "emblem") continue;
        const uses = guideUses[itemId] ??= [];
        if (uses.some(use => use.sectionId === section.id && use.teamId === team.id && use.unitId === piece.unitId)) continue;
        uses.push({ unitId: piece.unitId, sectionId: section.id, teamId: team.id, title: displayGuideName(section.title), board: displayGuideName(board) });
      }
    }
  }
  return <EmblemStats traitId={params.trait} holderId={params.unit} initialFilters={gearFilters(params)}
    guideHref={guide ? guideLink(guide.id) : undefined} guideUses={guideUses} />;
}
