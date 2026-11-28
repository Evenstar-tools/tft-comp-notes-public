import type { Publication } from "./document";
import { sectionTeams } from "./document-flow.ts";
import { heroAugmentCategory } from "./hero-augments.ts";
import type { PlacementBatch } from "./guide-placement";
import { usedPopulation } from "./team.ts";
import type { Piece } from "./types";
import { sameEdition } from "./version-updates.ts";

export function boardQuerySignature(pieces: Piece[]) {
  return JSON.stringify([usedPopulation(pieces), pieces.map(piece => piece.unitId).sort()]);
}

export function publishedBoardRefreshPlan(
  publication: Publication,
  placement: Pick<PlacementBatch, "build" | "records">,
  build: string,
  unitIds: Record<string, string>,
) {
  const review: { sectionId: string; teamId: string; signature: string }[] = [];
  const boards = (publication.boardOverrides ?? []).flatMap(({ sectionId, teamId, edition }) => {
    const section = publication.sections.find(entry => entry.id === sectionId);
    if (!section || !sameEdition(edition, (section.gameData ?? publication.season).id)) return [];
    const team = sectionTeams(section).find(entry => entry.id === teamId && entry.publishedRosterChanged);
    if (!team) return [];
    const roster = team.pieces.map(piece => piece.unitId).sort();
    const signature = boardQuerySignature(team.pieces);
    const population = usedPopulation(team.pieces);
    const complete = placement.build === build && placement.records.some(record =>
      record.querySignature === signature && record.build === build && record.conditions?.teamId === teamId && !record.sourcePeriod);
    if (complete) return [];

    // The ordinary exact query excludes duplicate units, emblems and extra population.
    // Conditional versions retain their own query rather than borrowing an ordinary sample.
    const data = section.gameData ?? publication.season;
    const equipment = new Set(team.pieces.flatMap(piece => piece.items));
    const restricted = section.category === heroAugmentCategory || section.category === "纹章阵容" ||
      data.items.some(item => equipment.has(item.id) && (item.category === "emblem" || item.id === "TFT_Item_ForceOfNature")) ||
      team.conditions?.some(condition => condition.kind === "required");
    if (restricted || new Set(roster).size !== roster.length || roster.some(id => !unitIds[id])) {
      review.push({ sectionId, teamId, signature });
      return [];
    }
    return [{ sectionId, teamId, population, roster, units: roster.map(id => unitIds[id] + "-1"), signature }];
  });
  return { boards, review };
}
