import type { Section } from "./document";
import { sectionTeams } from "./document-flow.ts";
import type { Team } from "./types";

export function rerollEntryTeamId(section: Section, teamId: string) {
  const { reroll } = section;
  if (teamId === (section.primaryTeamId ?? sectionTeams(section)[0]?.id)) return reroll?.entryTeamId;
  return reroll?.stages.find(stage => stage.entry && stage.parentTeamId === teamId)?.teamId;
}

export function rerollRoute(section: Section, current: Team) {
  const guide = section.reroll;
  if (!guide) return;
  const teams = sectionTeams(section);
  const primary = teams.find(team => team.id === section.primaryTeamId) ?? teams[0];
  const selected = guide.stages.find(stage => stage.teamId === current.id);
  const finalId = selected ? selected.parentTeamId ?? primary?.id : current.id;
  const final = teams.find(team => team.id === finalId) ?? current;
  const branch = guide.stages.filter(stage => (stage.parentTeamId ?? primary?.id) === final.id)
    .flatMap(stage => {
      const team = teams.find(entry => entry.id === stage.teamId);
      return team ? [{ ...stage, team }] : [];
    });
  // A shared link can still select the older copy of a consolidated stage.
  const variants = branch.filter(stage => stage.boardRole === "variant");
  const stages = branch.filter(stage => stage.boardRole !== "variant" &&
    stage.teamId !== selected?.equivalentStageId &&
    (stage.teamId === current.id || !branch.some(other => other.teamId === stage.equivalentStageId)));
  return { stages, variants, final };
}
