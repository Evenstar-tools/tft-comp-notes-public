import type { Section } from "./document";
import type { Season } from "./types";
import { readableSection, sectionTeams } from "./document-flow";
import { guideBoardKind } from "./team";
import { guideBoardName, guideFacets, guideRollLevel, primaryFirst, readingNotes } from "./guide-reading";
import { heroAugmentCategory, heroAugmentForGuide } from "./hero-augments";

export function guideCatalog(sections: Section[], season: Season) {
  return sections.filter(readableSection).flatMap(section => {
    const data = section.gameData ?? season;
    const augment = heroAugmentForGuide(section);
    const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
    return teams.map(team => {
      const kind = guideBoardKind(section, team, teams[0]);
      const { roles } = readingNotes(section, team, data);
      const emblems = team.pieces.flatMap(piece => piece.items.flatMap(id =>
        data.items.some(item => item.id === id && item.traitId) ? [{ unitId:piece.unitId, itemId:id }] : []));
      return {
        guide:section.title, sectionId:section.id, teamId:team.id, board:guideBoardName(team),
        edition:data.id, kind, stage:kind === "过渡",
        units:team.pieces.map(piece => piece.unitId), roles:roles.map(({label, units}) => ({ label, units })),
        style:guideFacets(section, team, data).style, rollLevel:guideRollLevel(section, team) ?? null,
        special:section.category === heroAugmentCategory ? "英雄强化" : section.category === "纹章阵容" || emblems.length ? "转职" : null,
        augment:augment?.name, emblems,
      };
    });
  });
}
