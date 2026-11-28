import type { Section } from "./document";
import { sectionTeams } from "./document-flow.ts";
import { currentFamilyBatch, currentRecommendationEvidence, familyBoardIds, familyRosterMatches, recommendationTier, type GuideFamilyBatch, type GuideFamilyStat } from "./guide-family-stats.ts";
import { fixedBoardPlacementDetail, placementEvidenceKind, type PlacementBatch, type PlacementRating } from "./guide-placement.ts";
import { guideBoardName, primaryFirst } from "./guide-reading.ts";
import { heroAugmentForGuide, heroAugmentCategory } from "./hero-augments.ts";
import { authoredDirectoryRoutes, isArchivedRerollBoard, rerollEntryTeamId } from "./reroll-stages.ts";
import { usedPopulation } from "./team.ts";
import type { Team } from "./types";
import { isLiveLaunchTransition } from "./version-updates.ts";

export type GuideSystem = { sectionId: string; teamId: string; boardIds: string[]; title: string; stat?: GuideFamilyStat; change?: string };
type Group = { anchor: Team; boards: Team[]; row?: GuideFamilyStat };
type Thresholds = Pick<PlacementBatch, "minGames" | "greenThrough" | "redFrom">;
type Phase = { team?: Team; label: string; text: string; detail?: string };
const frequency = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const population = (board: Team) => usedPopulation(board.pieces);

function addedSeats(a: Team, b: Team) {
  const delta = population(b) - population(a);
  if (delta < 1 || delta > 2) return Infinity;
  const roster = b.pieces.map(piece => piece.unitId);
  for (const piece of a.pieces) {
    const index = roster.indexOf(piece.unitId);
    if (index < 0) return Infinity;
    roster.splice(index, 1);
  }
  return delta;
}

export function rankGuideSystems(systems: GuideSystem[]) {
  return [...systems].sort((a, b) => (a.stat?.mean ?? Infinity) - (b.stat?.mean ?? Infinity) ||
    (b.stat?.games ?? 0) - (a.stat?.games ?? 0));
}

type GuidePatch = NonNullable<Parameters<typeof currentRecommendationEvidence>[2]> & { launchTransition?: boolean };

export function currentLaunchGuideFamily(batch: GuideFamilyBatch, edition: string, patch?: GuidePatch) {
  return !!patch?.build && batch.build === patch.build && !batch.spansBuilds && currentFamilyBatch(batch, edition, patch);
}

export function guideSystems(section: Section, batch: GuideFamilyBatch, edition: string,
  patch: GuidePatch | undefined, minGames: number, reviewedRollingPatch?: string): GuideSystem[] {
  const launch = isLiveLaunchTransition(patch);
  const validBatch = launch ? currentLaunchGuideFamily(batch, edition, patch)
    : currentRecommendationEvidence(batch, edition, patch, reviewedRollingPatch);
  const teams = primaryFirst(sectionTeams(section).filter(board => !isArchivedRerollBoard(section, board.id)), section.primaryTeamId);
  const primary = teams[0];
  if (!primary) return [];
  const byId = new Map(teams.map(board => [board.id, board]));
  const hero = !!heroAugmentForGuide(section) || section.category === heroAugmentCategory;
  const directoryRoutes = authoredDirectoryRoutes(section);
  const sameGuide = (row: Pick<GuideFamilyStat, "sectionId" | "heroAugment" | "teamId">) =>
    (!launch || validBatch) && batch.seasonId === edition && row.sectionId === section.id && !!row.heroAugment === hero &&
    (!directoryRoutes.length || directoryRoutes.some(route => route.teamId === (row.teamId ?? primary.id)));
  const rows = batch.rows.filter(row => sameGuide(row) && recommendationTier(row) !== "review" && row.games >= minGames &&
    Number.isFinite(row.winRate) && Number.isFinite(row.topFourRate) && row.winRate >= 0 &&
    row.winRate <= row.topFourRate && row.topFourRate <= 1);
  const owners = new Map<string, Group>();
  const groups: Group[] = [];
  function add(group: Group, board: Team | undefined) {
    if (!board || owners.has(board.id)) return;
    group.boards.push(board);
    owners.set(board.id, group);
  }
  function create(anchor: Team, row?: GuideFamilyStat) {
    const group: Group = { anchor, boards: [], row };
    groups.push(group);
    add(group, anchor);
  }
  // Reserve independent cluster anchors before assigning their landing and shared boards.
  for (const row of rows) {
    const board = byId.get(row.teamId ?? primary.id);
    if (board && familyRosterMatches(row, board) && !owners.has(board.id)) create(board, row);
  }
  for (const group of groups) {
    for (const id of familyBoardIds(group.row!, group.anchor.id)) {
      const board = id && byId.get(id);
      if (board && familyRosterMatches(group.row!, board)) add(group, board);
    }
  }

  const authored = new Map(section.reroll?.stages.map(stage => [stage.teamId, stage]));
  const parents = new Map<string, string>();
  for (const board of teams) {
    const stage = authored.get(board.id);
    const parent = stage?.parentTeamId ?? primary.id;
    if (board.id !== parent && byId.has(parent) && (stage ? stage.boardRole !== "variant"
      : section.stageTeamIds?.includes(board.id) || board.boardRole === "stage")) parents.set(board.id, parent);
  }
  function attachStages() {
    let previous: number;
    do {
      previous = owners.size;
      const parentClaims = new Map<string, Set<Group>>();
      for (const [id, parent] of parents) {
        const group = owners.get(parent);
        if (group) {
          add(group, byId.get(id));
          continue;
        }
        // The native cluster may measure an upgrade of the authored entry board.
        const childGroup = owners.get(id);
        const stage = authored.get(id);
        if (!childGroup?.row || stage?.boardRole !== "stage" || stage.parentTeamId !== parent) continue;
        const claims = parentClaims.get(parent) ?? new Set<Group>();
        claims.add(childGroup);
        parentClaims.set(parent, claims);
      }
      for (const [parent, claims] of parentClaims) {
        const [group, other] = claims;
        if (group && !other) add(group, byId.get(parent));
      }
    } while (owners.size > previous);
  }
  attachStages();
  // Separate authored entrances take precedence over merely sharing units with another route.
  const routeAnchors = teams.filter(board => rerollEntryTeamId(section, board.id));
  if (routeAnchors.length > 1) {
    for (const board of routeAnchors) if (!owners.has(board.id)) create(board);
    attachStages();
  }
  // A count-only sample can identify its own board, but the authored route still owns its stages.
  for (const row of (batch.smallSamples ?? []).filter(sameGuide)) {
    const board = row.teamId && byId.get(row.teamId);
    if (board && !parents.has(board.id) && !owners.has(board.id)) create(board);
  }
  function assign(board: Team) {
    if (owners.has(board.id)) return;
    const matches = groups.map(group => ({ group, distance: Math.min(...group.boards.map(member =>
      Math.min(addedSeats(board, member), addedSeats(member, board)))) }))
      .filter(match => Number.isFinite(match.distance)).sort((a, b) => a.distance - b.distance);
    if (matches.length && matches[0].distance !== matches[1]?.distance) add(matches[0].group, board);
    else create(board);
  }
  assign(primary);
  attachStages();
  for (const board of [...teams].sort((a, b) => population(a) - population(b))) {
    if (parents.has(board.id)) continue;
    assign(board);
    attachStages();
  }
  for (const board of teams) assign(board);

  return rankGuideSystems(groups.map(({ anchor, boards, row }) => {
    const preferred = [rerollEntryTeamId(section, anchor.id), rerollEntryTeamId(section, primary.id),
      row?.landingTeamId, primary.id, anchor.id];
    const entry = preferred.map(id => boards.find(board => board.id === id)).find(Boolean) ?? anchor;
    const name = guideBoardName(anchor);
    const branch = name.replace(/^[一二三四五六七八九十\d]+(?:级|人口)(?:上限|成型|稳血)?\s*(?:[·｜]\s*)?/, "");
    const title = directoryRoutes.find(route => route.teamId === entry.id)?.directoryTitle ??
      (row?.name || branch || (anchor.id === primary.id ? section.title : name));
    const stat = validBatch ? row : undefined;
    return { sectionId: section.id, teamId: entry.id, boardIds: boards.map(board => board.id), title, ...(stat && { stat }) };
  }));
}

export function guideSystemDisplayBoards(section: Section, boards: Team[], current: Team) {
  const ids = new Set(boards.map(board => board.id));
  const equivalents = new Map(section.reroll?.stages.flatMap(stage =>
    stage.boardRole !== "variant" && stage.equivalentStageId && ids.has(stage.equivalentStageId)
      ? [[stage.teamId, stage.equivalentStageId] as const] : []));
  // An existing legacy link still shows that board in place of its canonical stage.
  const replaced = equivalents.get(current.id);
  return boards.filter(board => board.id === current.id || (board.id !== replaced && !equivalents.has(board.id)));
}

export function guideSameLevelSwaps(section: Section, boards: Team[]) {
  const byId = new Map(boards.map(board => [board.id, board]));
  return (section.reroll?.stages ?? []).flatMap(stage => {
    if (stage.boardRole !== "stage" || !stage.parentTeamId) return [];
    const board = byId.get(stage.teamId);
    const parent = byId.get(stage.parentTeamId);
    return board && parent && board !== parent && population(board) === population(parent) ? [{ board, parent }] : [];
  });
}

export function guideSystemPhases(boards: Team[], entry: Team, current: Team, authored: Phase[]) {
  const ids = new Set(boards.map(board => board.id));
  const linked = authored.filter(step => step.team);
  const useAdvice = !linked.length || linked.some(step => ids.has(step.team!.id));
  const phases = authored.filter(step => step.team ? ids.has(step.team.id) : useAdvice);
  if (boards.length < 2 && !phases.some(step => !step.team)) return [];
  const levels = [...new Set(boards.map(population))].sort((a, b) => a - b);
  const comparisonFloor = levels.at(-2) ?? levels[0];
  const steps = levels.flatMap(level => {
    const atLevel = boards.filter(board => population(board) === level);
    const preferred = [current, ...phases.flatMap(step => step.team ?? []), entry].find(board => population(board) === level) ?? atLevel[0];
    // Lower stages can include several authored openers. The final two levels offer choices below the board.
    const visible = level < comparisonFloor ? primaryFirst(atLevel, preferred.id) : [preferred];
    return visible.map(board => phases.find(step => step.team?.id === board.id) ?? { team: board, label: guideBoardName(board), text: "" });
  });
  // Keep authored advice-only steps in their relative position before the following board.
  for (const [i, step] of phases.entries()) {
    if (step.team) continue;
    const next = phases.slice(i + 1).find(option => option.team)?.team;
    const index = next && steps.findIndex(option => option.team && population(option.team) === population(next));
    steps.splice(index === undefined || index < 0 ? steps.length : index, 0, step);
  }
  return steps;
}

export function systemMeanTone(mean: number | undefined) {
  return mean === undefined ? "limited" : mean < 4 ? "strong" : mean > 4.5 ? "weak" : "middle";
}

export function guideSystemSample(stat: Pick<PlacementRating, "mean" | "topFourRate" | "games"> | undefined) {
  if (!stat || stat.mean === undefined) return { mean: "—", tone: "limited", sample: "暂无体系数据" };
  const topFour = stat.topFourRate === undefined ? [] : [`前四 ${percent.format(stat.topFourRate)}`];
  return { mean: stat.mean.toFixed(2), tone: systemMeanTone(stat.mean),
    sample: [...topFour, `${frequency.format(stat.games)}场`].join(" · ") };
}

function boardSample(rating: PlacementRating | undefined) {
  if (!rating?.games) return;
  const kind = placementEvidenceKind(rating);
  if (kind === "fixed" || (kind === "augment" && rating.conditions?.kind !== "core")) return fixedBoardPlacementDetail(rating);
}

export function guideHeaderCoreSample(
  boards: Team[],
  rateCore: (board: Team) => PlacementRating | undefined,
  minGames: number,
): PlacementRating | undefined {
  for (const board of boards) {
    const sample = rateCore(board);
    if (!sample || sample.sourcePeriod || sample.games < minGames || sample.mean === undefined) continue;
    const kind = placementEvidenceKind(sample);
    if (kind === "core" || kind === "lineup") return sample;
  }
  return undefined;
}

export function guidePromotionRows(boards: Team[], rate: (board: Team) => PlacementRating | undefined, batch: Thresholds) {
  const levels = [...new Set(boards.map(population))].sort((a, b) => b - a).slice(0, 2);
  if (boards.length < 2) return [];
  const rows = boards.filter(board => levels.includes(population(board))).map(board => {
    const level = population(board);
    const stop = level < levels[0];
    const sample = boardSample(rate(board));
    const mean = sample && sample.games > 50 ? sample.mean : undefined;
    const small = !!sample && sample.games < batch.minGames;
    const topFour = sample && mean !== undefined && sample.topFourRate !== undefined && !sample.referencesAugment;
    const details = sample ? [topFour && `前四 ${percent.format(sample.topFourRate!)}`, `${frequency.format(sample.games)}场`, small && "少量样本"]
      .filter(Boolean).join(" · ") : "暂无数据";
    return { board, level, stop, label: stop ? `停在${level}级` : `${level}级补卡`,
      stat: { mean: mean?.toFixed(2) ?? "—", tone: stop || small ? "limited" : systemMeanTone(mean), sample: details },
      mean, games: sample?.games, source: sample && [sample.referencesAugment ? "同装样本" : "固定结算", sample.patch, sample.window, sample.sampleScope].filter(Boolean).join(" · "),
      scope: sample?.sourcePeriod ? "历史" : sample?.referencesAugment ? "同装" : undefined,
      note: sample?.sampleNote };
  }).sort((a, b) => b.level - a.level || (a.mean ?? Infinity) - (b.mean ?? Infinity));
  return rows;
}
