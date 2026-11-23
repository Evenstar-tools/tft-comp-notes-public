import { guideRerollTargets } from "../domain/reroll-targets.ts";
import { usedPopulation } from "../domain/team.ts";
import type { Piece, Team, Unit } from "../domain/types";
import revisions from "../data/s19-reroll-star-revisions.json" with { type: "json" };

// Apply corrections to the reviewed versions in the original Feishu publication.
// A later save and a user-created copy both keep their own stars.
const reviewed: Record<string, number> = revisions;

export function correctRerollStars(
  team: Team, units: Unit[], sectionId: string, parentTeamId?: string, siteAuthored = false,
) {
  if (!siteAuthored && reviewed[team.id] !== team.revision) return team;
  const population = usedPopulation(team.pieces);
  const desired = new Map<string, Piece["stars"]>();
  for (const id of guideRerollTargets(sectionId, team.id, parentTeamId)) {
    const cost = units.find(unit => unit.id === id)?.cost;
    if ((cost === 1 && population >= 5) || (cost === 2 && population >= 6)) desired.set(id, 3);
  }
  if (!desired.size) return team;
  // If a stage fields a second copy, only upgrade the main copy.
  const mainCopies = new Map<string, Piece>();
  for (const piece of team.pieces) {
    if (!desired.has(piece.unitId)) continue;
    const existing = mainCopies.get(piece.unitId);
    if (!existing || piece.stars > existing.stars || (piece.stars === existing.stars && piece.items.length > existing.items.length)) {
      mainCopies.set(piece.unitId, piece);
    }
  }
  if (![...mainCopies].some(([id, piece]) => piece.stars !== desired.get(id))) return team;
  return { ...team, pieces: team.pieces.map(piece => {
    const stars = desired.get(piece.unitId);
    return stars && mainCopies.get(piece.unitId) === piece && piece.stars !== stars ? { ...piece, stars } : piece;
  }) };
}
