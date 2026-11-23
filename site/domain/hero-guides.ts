import type { Section } from "./document";
import type { Piece, Season, Team } from "./types";
import { boardNeighbors } from "./board-layout.ts";
import { readableSection, sectionTeams } from "./document-flow.ts";
import { guideBoardName, isEditorialSection, primaryFirst, readingNotes } from "./guide-reading.ts";
import { isVersionUpdate } from "./version-updates.ts";
import { guideBoardKind } from "./team.ts";
import { heroAugmentForGuide, heroAugmentForUnit } from "./hero-augments.ts";

export const heroGuideGroups = ["主C、主坦", "副C、副坦与功能装", "过渡", "其他上阵"] as const;
type GuideGroup = typeof heroGuideGroups[number];
type BoardExample = Pick<Piece, "position" | "stars" | "items"> & { positioning?: string };
type HeroGuide = { id: string; title: string; board: string; boardId: string; role?: string; augmentId?: string; group: GuideGroup; example: BoardExample };
export type HeroGuideIndex = Record<string, HeroGuide[]>;

function boardRoles(section: Section, team: Team, data: Season, transition: boolean) {
  const roles = readingNotes(section, team, data).roles;
  const examples = new Map<string, Piece>();
  for (const piece of team.pieces) {
    const current = examples.get(piece.unitId);
    if (!current || piece.items.length > current.items.length ||
        (piece.items.length === current.items.length && piece.stars > current.stars)) examples.set(piece.unitId, piece);
  }
  return Array.from(examples, ([id, piece]) => {
    const labels = roles.filter(role => role.units.includes(id)).map(role => role.label);
    const main = labels.find(label => ["主C", "主输出", "主坦"].includes(label));
    const secondary = labels.find(label => ["副C", "前期输出", "后期输出", "物理输出", "副坦", "功能装"].includes(label));
    const role = main === "主输出" ? "主C" : main ?? secondary;
    const group = heroGuideGroups[transition ? 2 : main ? 0 : secondary ? 1 : 3];
    const { position, stars, items } = piece;
    const nearby = id === "amumu" && role === "主坦" && position < 7 ? boardNeighbors(position) : undefined;
    const positioning = nearby && !team.pieces.some(other => nearby.includes(other.position))
      ? "前排单顶，开战时身边六格留空。"
      : undefined;
    return { id, role, group, example: { position, stars, items, positioning } };
  });
}

export function heroGuideIndex(sections: Section[], season: Season): HeroGuideIndex {
  const index: HeroGuideIndex = {};
  for (const section of sections) {
    if (!readableSection(section) || isEditorialSection(section) || isVersionUpdate(section)) continue;
    const edition = section.gameData ?? season;
    const augment = heroAugmentForGuide(section);
    const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
    const best = new Map<string, HeroGuide>();
    for (const team of teams) {
      const transition = guideBoardKind(section, team, teams[0]) === "过渡" ||
        section.reroll?.stages.some(stage => stage.teamId === team.id && !stage.boardRole);
      for (const { id, role, group, example } of boardRoles(section, team, edition, Boolean(transition))) {
        const current = best.get(id);
        if (current && heroGuideGroups.indexOf(current.group) <= heroGuideGroups.indexOf(group)) continue;
        const augmentId = augment?.unitId === id ? heroAugmentForUnit(id, edition.id)?.id : undefined;
        best.set(id, { id: section.id, title: section.title, board: guideBoardName(team), boardId: team.id, role, augmentId, group, example });
      }
    }
    for (const [id, guide] of best) (index[id] ??= []).push(guide);
  }
  for (const rows of Object.values(index)) {
    rows.sort((a, b) => heroGuideGroups.indexOf(a.group) - heroGuideGroups.indexOf(b.group));
  }
  return index;
}
