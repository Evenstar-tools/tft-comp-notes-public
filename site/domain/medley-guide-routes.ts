import type { Section } from "./document";
import { readableSection, sectionTeams } from "./document-flow.ts";
import { guideFlexPreview, guideOpeningGear, reviewedGuidePhases } from "./guide-execution.ts";
import { boardTitle } from "./guide-families.ts";
import { guideBoardName, guideLink, guidePlaystyle, guideRoute, isEditorialSection, primaryFirst, readingNotes } from "./guide-reading.ts";
import { heroAugmentCategory } from "./hero-augments.ts";
import { inferCarryIdsFromPieces, MEDLEY_OUTPUT_ITEMS, type MedleyRoute } from "./medley-fit.ts";
import { guideBoardKind, usedPopulation } from "./team.ts";
import { readTeamStage, stageLabels } from "./team-stages.ts";
import type { Season, Team } from "./types";
import { isVersionUpdate, sameEdition } from "./version-updates.ts";

const openingCarryRole = /^(主C|副C|主输出|前期输出|后期输出|物理输出|法系输出)$/;
const finalCarryRole = /^(主C|主输出|后期输出)$/;
const requiredCondition = (team: Team) => team.conditions?.some(condition => condition.kind === "required");

const reviewedTransitions = new Map([
  // Three-Sea/Shojin opening into seven-Sea Shojin. The Blue Buff and six-Mage boards remain independent.
  ["00000000-0000-4000-8000-000000001085", { openingId: "00000000-0000-4000-8000-000000001126", carryId: "zoe" }],
  // The eight-level Guardian Renata board leads to the nine-level Viego and Vi board.
  ["00000000-0000-4000-8000-000000000046", { openingId: "00000000-0000-4000-8000-000000000044", carryId: "renata-glasc" }],
]);

export function medleyEligibleGuideCount(sections: Section[], publicationSeason: Season, currentSeason: Season): number {
  return sections.filter(section => {
    const data = section.gameData ?? publicationSeason;
    return sameEdition(data.id, currentSeason.id) &&
      readableSection(section) &&
      !isEditorialSection(section) &&
      !isVersionUpdate(section) &&
      section.category !== heroAugmentCategory &&
      section.category !== "纹章阵容" &&
      sectionTeams(section).length > 0;
  }).length;
}

export function medleyGuideRoutes(sections: Section[], publicationSeason: Season, currentSeason: Season): MedleyRoute[] {
  const unitCosts = new Map(currentSeason.units.map(unit => [unit.id, unit.cost]));
  return sections.flatMap(section => {
    const data = section.gameData ?? publicationSeason;
    if (!sameEdition(data.id, currentSeason.id) || !readableSection(section) || isEditorialSection(section) || isVersionUpdate(section) ||
        section.category === heroAugmentCategory || section.category === "纹章阵容") return [];
    const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
    const primary = teams[0];
    if (!primary) return [];
    const reviewed = reviewedGuidePhases(section.id, teams, data);
    const rolesByTeam = new Map<string, ReturnType<typeof readingNotes>["roles"]>();
    const carryIds = (team: Team, rolePattern: RegExp) => {
      if (!rolesByTeam.has(team.id)) rolesByTeam.set(team.id, readingNotes(section, team, data).roles);
      const authored = (rolesByTeam.get(team.id) ?? []).filter(role => rolePattern.test(role.label)).flatMap(role => role.units);
      if (authored.length) return authored;
      // Auto-infer carries from equipped output items when a newly added or edited guide omits role labels.
      return inferCarryIdsFromPieces(team.pieces, unitCosts, MEDLEY_OUTPUT_ITEMS);
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
      const reviewedTransition = reviewedTransitions.get(final.id);
      const reviewedOpening = reviewedTransition ? teams.find(team => team.id === reviewedTransition.openingId) : undefined;
      if (reviewedOpening) openingBoards.set(guideLink(section.id, reviewedOpening.id), {
        team: reviewedOpening, label: guideBoardName(reviewedOpening),
      });
      const board = { sectionId: section.id, teamId: final.id, title: boardTitle(section, final), finalHref, final: final.pieces };
      const finalCarries = carryIds(final, finalCarryRole);
      const routes = [...openingBoards].flatMap(([stageHref, { team: opening, label: stageLabel }]) => {
        const openingCount = usedPopulation(opening.pieces);
        if (openingCount < 3 || openingCount > 8 || openingCount >= population || requiredCondition(opening)) return [];
        const reviewedCarry = opening === reviewedOpening ? reviewedTransition?.carryId : undefined;
        const route: MedleyRoute = {
          ...board, stageLabel, stageHref, opening: opening.pieces,
          openingCarryIds: reviewedCarry ? [reviewedCarry] : carryIds(opening, openingCarryRole),
          finalCarryIds: reviewedCarry ? [reviewedCarry] : finalCarries,
        };
        const flex = guideFlexPreview(section.id, opening, data);
        if (!flex) return [route];
        const guides = guideOpeningGear(section.id, opening, data)?.rows ?? [];
        const alternatives = guides.flatMap(gear => {
          if (gear.from.id !== flex.incoming.id || !route.finalCarryIds.includes(gear.to.id)) return [];
          const items = gear.items.map(item => item.id);
          const projection = flex.liveTeam.pieces.map(piece => {
            if (piece.unitId === gear.from.id) return { ...piece, items };
            if (piece.unitId === gear.to.id) return { ...piece, items: piece.items.filter(id => !items.includes(id)) };
            return piece;
          });
          return [{
            ...route, opening: projection, openingCarryIds: [gear.from.id], guideOpening: true,
            stageLabel: stageLabel + " · " + gear.from.name + "开装",
          }];
        });
        return [route, ...alternatives];
      });
      // A real terminal can prove the three-member check even without a reviewed opening.
      return [...routes, { ...board, opening: [], openingCarryIds: [], finalCarryIds: finalCarries }];
    });
  });
}
