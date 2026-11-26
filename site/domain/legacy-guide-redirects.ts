import type { Section } from "./document";
import { sectionTeams } from "./document-flow.ts";
import { AD_GRAVES_BOARD_IDS, GUIDE_SECTION_IDS, PYKE_GRAVES_BOARD_ID } from "./guide-identities.ts";

const [adGraves, adGravesTwistedFate] = AD_GRAVES_BOARD_IDS;

const legacyGuideRedirects: Record<string, { sectionId: string; teamId: string; teams?: Record<string, string> }> = {
  "sample-block-1055": {
    sectionId: GUIDE_SECTION_IDS.classicalJhin,
    teamId: "00000000-0000-4000-8000-000000001138",
    teams: { "00000000-0000-4000-8000-000000001091": "00000000-0000-4000-8000-000000000059" },
  },
  "sample-block-0394": {
    sectionId: GUIDE_SECTION_IDS.classicalJhin,
    teamId: "00000000-0000-4000-8000-000000000083",
  },
  "sample-block-0173": {
    sectionId: GUIDE_SECTION_IDS.classicalJhin,
    teamId: "00000000-0000-4000-8000-000000000006",
  },
  "sample-block-0468": {
    sectionId: GUIDE_SECTION_IDS.pentakillKayle,
    teamId: "00000000-0000-4000-8000-000000000106",
    teams: { "00000000-0000-4000-8000-000000000120": "00000000-0000-4000-8000-000000000120" },
  },
  "sample-block-1120": {
    sectionId: GUIDE_SECTION_IDS.oceanGraves,
    teamId: adGraves,
    teams: { [adGravesTwistedFate]: adGravesTwistedFate },
  },
  "sample-block-0452": {
    sectionId: GUIDE_SECTION_IDS.oceanGraves,
    teamId: adGraves,
    teams: { [PYKE_GRAVES_BOARD_ID]: PYKE_GRAVES_BOARD_ID, [adGraves]: adGraves, [adGravesTwistedFate]: adGravesTwistedFate },
  },
};

export const mergedGuideIds = Object.keys(legacyGuideRedirects);

export function legacyGuideDestination(id: string, teamId: string | undefined, sections: Section[]) {
  if (!Object.hasOwn(legacyGuideRedirects, id)) return;
  const legacy = legacyGuideRedirects[id];
  const target = sections.find(section => section.id === legacy.sectionId);
  const board = (teamId && legacy.teams?.[teamId]) || legacy.teamId;
  if (target && sectionTeams(target).some(team => team.id === board)) {
    return { sectionId: legacy.sectionId, teamId: board };
  }
}
