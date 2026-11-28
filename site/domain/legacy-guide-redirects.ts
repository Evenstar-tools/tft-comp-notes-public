import type { Section } from "./document";
import { sectionTeams } from "./document-flow.ts";
import { AD_GRAVES_BOARD_IDS, DRAVEN_VIEGO_BOARD_ID, GUIDE_SECTION_IDS, PYKE_GRAVES_BOARD_ID } from "./guide-identities.ts";
import { boardPublicSlug, canonicalGuidePath, guidePublicSlug, resolveBoardTeamId, resolveGuideSectionId } from "./guide-slugs.ts";

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
  "swiftstriker-locke": {
    sectionId: GUIDE_SECTION_IDS.pentakillKayle,
    teamId: "19b143ef-e315-4b8e-8081-31e13a6ec3f0",
    teams: {
      "lv8": "19b143ef-e315-4b8e-8081-31e13a6ec3f0",
      "lv9": "7f18bb65-1662-403f-b1e2-fff9634c755f",
      "19b143ef-e315-4b8e-8081-31e13a6ec3f0": "19b143ef-e315-4b8e-8081-31e13a6ec3f0",
      "7f18bb65-1662-403f-b1e2-fff9634c755f": "7f18bb65-1662-403f-b1e2-fff9634c755f",
    },
  },
};

export const mergedGuideIds = Object.keys(legacyGuideRedirects);

export function legacyGuideDestination(id: string, teamId: string | undefined, sections: Section[]) {
  const key = /^\d{4}$/.test(id) ? "sample-block-" + id : id;
  if (!Object.hasOwn(legacyGuideRedirects, key)) return;
  const legacy = legacyGuideRedirects[key];
  const target = sections.find(section => section.id === legacy.sectionId);
  const board = (teamId && legacy.teams?.[teamId]) || legacy.teamId;
  if (target && sectionTeams(target).some(team => team.id === board)) {
    return { sectionId: legacy.sectionId, teamId: board };
  }
}

export function resolveGuideRequest(id: string, rawTeam: string | undefined, sections: Section[], params?: Record<string, string | undefined>) {
  const legacy = legacyGuideDestination(id, rawTeam, sections);
  if (legacy) return { redirectTo: canonicalGuidePath(legacy.sectionId, legacy.teamId, params) };

  const sectionId = resolveGuideSectionId(id);
  if (sectionId === GUIDE_SECTION_IDS.showoffDraven && (rawTeam === "lv7-viego" || rawTeam === DRAVEN_VIEGO_BOARD_ID)) {
    const target = sections.find(entry => entry.id === GUIDE_SECTION_IDS.choreographerDravenViego);
    if (target && sectionTeams(target).some(board => board.id === DRAVEN_VIEGO_BOARD_ID)) {
      return { redirectTo: canonicalGuidePath(target.id, DRAVEN_VIEGO_BOARD_ID, params) };
    }
  }
  const section = sections.find(entry => entry.id === sectionId);
  if (!section) return;
  const teamId = resolveBoardTeamId(sectionId, rawTeam);
  if (id !== guidePublicSlug(sectionId) || (teamId !== undefined && rawTeam !== boardPublicSlug(sectionId, teamId))) {
    return { redirectTo: canonicalGuidePath(sectionId, teamId, params) };
  }
  return { section, teamId };
}
