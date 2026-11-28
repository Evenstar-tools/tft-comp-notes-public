import type { Publication, Section } from "./document";
import { sectionTeams } from "./document-flow.ts";
import { heroAugmentCategory } from "./hero-augments.ts";
import type { PlacementBatch } from "./guide-placement";
import { usedPopulation } from "./team.ts";
import type { Piece, Season, Team } from "./types";
import { sameEdition } from "./version-updates.ts";

export function boardQuerySignature(pieces: Piece[]) {
  return JSON.stringify([usedPopulation(pieces), pieces.map(piece => piece.unitId).sort()]);
}

export function supportsOrdinaryBoardQuery(section: Pick<Section, "category">, team: Pick<Team, "pieces" | "conditions">, data: Pick<Season, "items">) {
  const roster = team.pieces.map(piece => piece.unitId);
  const equipment = new Set(team.pieces.flatMap(piece => piece.items));
  if (equipment.size && !Array.isArray(data.items)) return false;
  return new Set(roster).size === roster.length && section.category !== heroAugmentCategory && section.category !== "纹章阵容" &&
    !team.conditions?.some(condition => condition.kind === "required") &&
    !data.items?.some(item => equipment.has(item.id) && (item.traitId || item.category === "emblem" || item.category === "team-size"));
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
    const team = sectionTeams(section).find(entry => entry.id === teamId && (entry.publishedRosterChanged || entry.publishedRosterNeedsReview));
    if (!team) return [];
    const roster = team.pieces.map(piece => piece.unitId).sort();
    const signature = boardQuerySignature(team.pieces);
    const population = usedPopulation(team.pieces);
    const data = section.gameData ?? publication.season;
    if (!supportsOrdinaryBoardQuery(section, team, data) || roster.some(id => !unitIds[id])) {
      review.push({ sectionId, teamId, signature });
      return [];
    }
    const complete = placement.build === build && placement.records.some(record =>
      record.querySignature === signature && record.build === build && record.conditions?.teamId === teamId && !record.sourcePeriod);
    if (complete) return [];
    return [{ sectionId, teamId, population, roster, units: roster.map(id => unitIds[id] + "-1"), signature }];
  });
  return { boards, review };
}
