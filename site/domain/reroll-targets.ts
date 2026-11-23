import targetData from "../data/guide-reroll-targets.json" with { type: "json" };

type Targets = { targets: string[]; boards?: Record<string, string[]> };
const guides: Record<string, Targets> = targetData;

export function guideRerollTargets(sectionId: string, teamId: string, parentTeamId?: string) {
  const guide = guides[sectionId];
  return guide?.boards?.[teamId] ?? (parentTeamId ? guide?.boards?.[parentTeamId] : undefined) ?? guide?.targets ?? [];
}
