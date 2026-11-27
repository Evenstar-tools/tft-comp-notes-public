import type { Section } from "./document";
import { sectionTeams } from "./document-flow";
import { guideBoardName, guideFacets, guideRollLevel, primaryFirst, readingNotes } from "./guide-reading";
import { heroAugmentForGuide, heroAugmentCategory } from "./hero-augments";
import type { PlacementRating } from "./guide-placement";
import { usedPopulation } from "./team";
import type { Season, Team } from "./types";

type Rate = (team: Team, section: Section) => PlacementRating | undefined;

function difference(left: string[], right: string[]) {
  const remaining = [...right];
  return left.filter(id => {
    const index = remaining.indexOf(id);
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
}

function unitNames(ids: string[], data: Season) {
  return ids.map(id => data.units.find(unit => unit.id === id)?.name ?? id).join("、");
}

export function boardRosterChange(from: Team, to: Team, fromData: Season, toData = fromData) {
  const oldRoster = from.pieces.map(piece => piece.unitId);
  const newRoster = to.pieces.map(piece => piece.unitId);
  const add = difference(newRoster, oldRoster), drop = difference(oldRoster, newRoster);
  const names = (ids: string[], data: Season, limit: number) => ids.length > limit
    ? `${unitNames(ids.slice(0, 1), data)}等${ids.length}人` : unitNames(ids, data);
  const describe = (limit = Infinity) => [drop.length && "下" + names(drop, fromData, limit),
    add.length && "上" + names(add, toData, limit)].filter(Boolean).join("，");
  return { add, drop, describe };
}

function profile(section: Section, team: Team, season: Season, rate: Rate) {
  const data = section.gameData ?? season;
  const notes = readingNotes(section, team, data);
  const ids = notes.roles.filter(role => role.label === "主C" || role.label === "主输出").flatMap(role => role.units);
  const carries = team.pieces.filter(piece => ids.includes(piece.unitId));
  const tanks = [...new Set(notes.roles.filter(role => role.label === "主坦").flatMap(role => role.units))].sort();
  const rollLevel = guideRollLevel(section, team);
  const style = guideFacets(section, team, data).style;
  const roster = team.pieces.map(piece => piece.unitId);
  return { section, team, data, carries, tanks, rollLevel, style, roster, population: usedPopulation(team.pieces),
    augment: heroAugmentForGuide(section)?.name, rating: rate(team, section) };
}
type Board = ReturnType<typeof profile>;

function compatible(a: Board, b: Board) {
  if (a.team.id === b.team.id && a.section.id === b.section.id) return true;
  const rosterChanges = difference(a.roster, b.roster).length;
  if (a.data.id !== b.data.id || a.data.sourceDate !== b.data.sourceDate || a.population !== b.population || a.roster.length !== b.roster.length ||
      rosterChanges > 2 || !a.style || a.style !== b.style) return false;
  if (a.section.id !== b.section.id && a.rollLevel && b.rollLevel && a.rollLevel !== b.rollLevel) return false;
  if (a.section.category === heroAugmentCategory || b.section.category === heroAugmentCategory) {
    if (!a.augment || a.augment !== b.augment) return false;
  }
  if (!a.carries.length || a.carries.length !== b.carries.length) return false;
  // The same nine can support two distinct guides by moving the damage or tank items.
  if (a.section.id !== b.section.id && !rosterChanges) {
    if (difference(a.carries.map(p => p.unitId), b.carries.map(p => p.unitId)).length) return false;
    if (a.tanks.length && b.tanks.length && a.tanks.join(",") !== b.tanks.join(",")) return false;
  }
  const available = [...b.carries];
  // Match identical carries first. A different carry must share two actual equipped items.
  const other = a.carries.filter(carry => {
    const at = available.findIndex(piece => piece.unitId === carry.unitId);
    if (at < 0) return true;
    available.splice(at, 1);
    return false;
  });
  function canTransfer(index: number, remaining: typeof available): boolean {
    if (index === other.length) return true;
    const carry = other[index];
    return remaining.some((next, i) => {
      if (/搜|赌/.test(a.style) && a.data.units.find(u => u.id === carry.unitId)?.cost !== b.data.units.find(u => u.id === next.unitId)?.cost) return false;
      const shared = carry.items.length - difference(carry.items, next.items).length;
      return shared >= 2 && canTransfer(index + 1, remaining.filter((_, j) => j !== i));
    });
  }
  return canTransfer(0, available);
}

export function boardTitle(section: Section, team: Team, distinguish = false) {
  if (team.id === "00000000-0000-4000-8000-000000000044") return "六护卫烈娜塔";
  // These variants transfer the main carry's items, while the parent guide keeps its own headliner.
  if (team.id === "00000000-0000-4000-8000-000000000049") return "双电子女枪";
  if (team.id === "00000000-0000-4000-8000-000000000090") return "五离子金克丝";
  const primary = section.primaryTeamId ?? sectionTeams(section)[0]?.id;
  if (team.id === primary && !distinguish) return section.title;
  const variant = guideBoardName(team).replace(/^[一二三四五六七八九十]+级\s*·\s*/, "");
  return variant && variant !== section.title ? section.title + " · " + variant : section.title;
}

export function recommendationBoardTitle(section: Section, team: Team, firstUnitName?: string) {
  const primary = section.primaryTeamId ?? sectionTeams(section)[0]?.id;
  const name = guideBoardName(team).replace(/^[一二三四五六七八九十\d]+(?:级|人口)\s*·\s*/, "");
  const carry = firstUnitName?.split(/[·・]/)[0].trim();
  return team.id !== primary && carry && name.includes(carry) ? name : boardTitle(section, team);
}

export type PosterVariant = { sectionId: string; teamId: string; title: string; change: string; rating?: PlacementRating; pooled: boolean };
export type GuideFamily = { sections: Section[]; boards: Board[]; lead: Board };

export function groupGuides(sections: Section[], season: Season, rate: Rate): GuideFamily[] {
  const groups: GuideFamily[] = [];
  for (const section of sections) {
    const [main, ...others] = primaryFirst(sectionTeams(section), section.primaryTeamId);
    if (!main) continue;
    const anchor = profile(section, main, season, rate);
    const boards = [anchor, ...others.filter(team => !section.stageTeamIds?.includes(team.id))
      .map(team => profile(section, team, season, rate)).filter(board => compatible(anchor, board))];
    // Require a direct match for every cross-guide pair. A chain of small swaps can otherwise merge unrelated builds.
    const existing = groups.find(group => boards.every(a => group.boards.every(b => compatible(a, b))));
    if (existing) { existing.sections.push(section); existing.boards.push(...boards); }
    else groups.push({ sections: [section], boards, lead: anchor });
  }
  return groups;
}

export function familyVariants(family: GuideFamily, teamId: string): PosterVariant[] {
  const current = family.boards.find(board => board.team.id === teamId);
  if (!current) return [];
  return family.boards.filter(board => board !== current).map(board => {
    const { add, drop, describe } = boardRosterChange(current.team, board.team, current.data, board.data);
    const oldC = current.carries.map(p => p.unitId), newC = board.carries.map(p => p.unitId);
    const incoming = board.carries.filter(piece => !oldC.includes(piece.unitId));
    const departing = current.carries.filter(piece => !newC.includes(piece.unitId));
    const handoff = incoming.map(piece => {
      const overlaps = departing.map(prev => piece.items.filter(item => prev.items.includes(item)));
      const shared = overlaps.sort((a,b) => b.length-a.length)[0] ?? [];
      const items = [...new Set(shared)].map(id => board.data.items.find(item => item.id === id)?.name ?? id);
      return (items.length ? items.join("、") : "输出装") + "改给" + unitNames([piece.unitId], board.data);
    }).join("，");
    return { sectionId: board.section.id, teamId: board.team.id, title: boardTitle(board.section, board.team, board.section.id === current.section.id),
      change: [describe(), handoff].filter(Boolean).join("，") || "同一套棋子，调整站位或配装", rating: board.rating,
      pooled: !add.length && !drop.length && !!board.rating && board.rating.url === current.rating?.url };
  });
}
