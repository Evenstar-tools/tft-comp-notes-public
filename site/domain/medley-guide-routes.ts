import type { Section } from "./document";
import { readableSection, sectionTeams } from "./document-flow.ts";
import { reviewedGuidePhases } from "./guide-execution.ts";
import { boardTitle } from "./guide-families.ts";
import { guideBoardName, guideLink, guidePlaystyle, guideRoute, isEditorialSection, primaryFirst, readingNotes } from "./guide-reading.ts";
import { heroAugmentCategory } from "./hero-augments.ts";
import type { MedleyRoute } from "./medley-fit";
import { guideBoardKind, usedPopulation } from "./team.ts";
import { readTeamStage, stageLabels } from "./team-stages.ts";
import type { Season, Team } from "./types";
import { isVersionUpdate, sameEdition } from "./version-updates.ts";

const carryRole = /^(主C|主输出|前期输出|后期输出|物理输出|法系输出)$/;
const requiredCondition = (team: Team) => team.conditions?.some(condition => condition.kind === "required");

function carryIds(section: Section, team: Team, data: Season) {
  return readingNotes(section, team, data).roles.filter(role => carryRole.test(role.label)).flatMap(role => role.units);
}

export function medleyGuideRoutes(sections: Section[], publicationSeason: Season, currentSeason: Season): MedleyRoute[] {
  return sections.flatMap(section => {
    const data = section.gameData ?? publicationSeason;
    if (!sameEdition(data.id, currentSeason.id) || !readableSection(section) || isEditorialSection(section) || isVersionUpdate(section) ||
        section.category === heroAugmentCategory || section.category === "纹章阵容") return [];
    const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
    const primary = teams[0];
    if (!primary) return [];
    const reviewed = reviewedGuidePhases(section.id, teams, data);
    const carries = new Map<string, string[]>();
    const cachedCarryIds = (team: Team) => {
      if (!carries.has(team.id)) carries.set(team.id, carryIds(section, team, data));
      return carries.get(team.id) ?? [];
    };
    return teams.flatMap(final => {
      if (requiredCondition(final) || (final.mainStage ?? "late") !== "late") return [];
      const population = usedPopulation(final.pieces);
      const phases = reviewed ?? guideRoute(section, teams, final)?.phases;
      const phaseIndex = phases?.findIndex(phase => phase.team?.id === final.id) ?? -1;
      const kind = guideBoardKind(section, final, primary);
      if (kind === "过渡" && !(population === 8 && phaseIndex > 0 && guidePlaystyle(section, final) === "84")) return [];
      const finalHref = guideLink(section.id, final.id);
      const openingBoards = new Map<string, { team: Team; label: string }>();
      // A parallel variant's stages belong to that variant. A stage from another branch never supplies its opening.
      if (phases && phaseIndex > 0) {
        for (const phase of phases.slice(0, phaseIndex)) if (phase.team)
          openingBoards.set(guideLink(section.id, phase.team.id), { team: phase.team, label: phase.label });
      } else if (!phases && final === primary) {
        for (const team of teams) if (guideBoardKind(section, team, primary) === "过渡" &&
          !section.reroll?.stages.some(stage => stage.teamId === team.id && stage.parentTeamId && stage.parentTeamId !== final.id))
          openingBoards.set(guideLink(section.id, team.id), { team, label: guideBoardName(team) });
      }
      for (const stage of ["early", "mid"] as const) {
        if (!final.stages?.[stage]?.pieces.length) continue;
        // Distinguish the copy projected for this stage when resolving equipped carry roles.
        const team = { ...readTeamStage(final, stage), id: final.id + "-" + stage };
        openingBoards.set(finalHref + "&stage=" + stage, { team, label: stageLabels[stage] + " · " + usedPopulation(team.pieces) + "人口" });
      }
      return [...openingBoards].flatMap(([stageHref, { team: opening, label: stageLabel }]) => {
        const openingCount = usedPopulation(opening.pieces);
        if (openingCount < 3 || openingCount > 8 || openingCount >= population || requiredCondition(opening)) return [];
        return [{
          sectionId: section.id, teamId: final.id, title: boardTitle(section, final), stageLabel, stageHref, finalHref,
          opening: opening.pieces, final: final.pieces,
          openingCarryIds: cachedCarryIds(opening), finalCarryIds: cachedCarryIds(final),
        }];
      });
    });
  });
}
