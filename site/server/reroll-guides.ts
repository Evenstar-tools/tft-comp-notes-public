import data from "@/data/s19-reroll-boards.json";
import { sectionTeams } from "@/domain/document-flow";
import { guideBoardName } from "@/domain/guide-reading";
import { boardInstruments } from "@/domain/board-instruments";
import { editionScope } from "@/domain/version-updates";
import { correctRerollStars } from "./reroll-stars";
import type { ContentBlock, Publication } from "@/domain/document";
import type { BoardInstrumentId, Piece, Season, Team } from "@/domain/types";

type Stage = NonNullable<Publication["sections"][number]["reroll"]>["stages"][number] & {
  pieces?: Omit<Piece, "instanceId">[];
  instrumentPositions?: Team["instrumentPositions"];
};
type BoardEdit = {
  teamId: string;
  name?: string;
  originalName?: string;
  notes?: string;
  positions?: Record<string, number>;
  originalPositions?: Record<string, number | number[]>;
  items?: Record<string, string[]>;
  replacements?: Record<string, Pick<Piece, "unitId" | "stars" | "items">>;
  originalItems?: Record<string, string[]>;
  stoneplateHolder?: string;
  originalInstruments?: Partial<Record<BoardInstrumentId, number>>;
  instrumentMoves?: Record<string, number>;
  wording?: { before: string; after: string };
};
type Guide = {
  sectionId: string;
  entryTeamId?: string;
  stages: Stage[];
  edits?: BoardEdit[];
  wording?: NonNullable<BoardEdit["wording"]>[];
  hiddenLegacy?: { id: string; prefix: string }[];
};
const guides = new Map((data as Guide[]).map(guide => [guide.sectionId, guide]));

function replaceWording(block: ContentBlock, edits: NonNullable<BoardEdit["wording"]>[]): ContentBlock {
  const children = block.children?.map(child => replaceWording(child, edits));
  if (block.type !== "text" || !block.text) return children ? { ...block, children } : block;
  let { text, elements } = block;
  for (const { before, after } of edits) {
    if (after.includes(before) && text.includes(after)) continue;
    if (!text.includes(before) || (elements?.length && !elements.some(element => element.text_run?.content.includes(before)))) continue;
    text = text.replace(before, after);
    elements = elements?.map(element => element.text_run?.content.includes(before)
      ? { ...element, text_run: { ...element.text_run, content: element.text_run.content.replace(before, after) } }
      : element);
  }
  return { ...block, text, elements, children };
}

function editBoard(team: Team, edit: BoardEdit, data: Season) {
  if (edit.originalName && guideBoardName(team) !== edit.originalName) return team;
  if (edit.stoneplateHolder && !team.pieces.some(piece =>
    piece.unitId === edit.stoneplateHolder && piece.items.includes("TFT_Item_GargoyleStoneplate"))) return team;
  if (Object.entries(edit.originalPositions ?? {}).some(([id, accepted]) => {
    const position = team.pieces.find(piece => piece.unitId === id)?.position;
    return position === undefined || (Array.isArray(accepted) ? !accepted.includes(position) : position !== accepted);
  })) return team;
  if (Object.entries(edit.originalItems ?? {}).some(([id, expected]) => {
    const items = team.pieces.find(piece => piece.unitId === id)?.items;
    return !items || items.length !== expected.length || items.some((item, i) => item !== expected[i]);
  })) return team;
  if (edit.originalInstruments) {
    const instruments = boardInstruments(team.pieces, data, team.instrumentPositions);
    if (Object.entries(edit.originalInstruments).some(([id, position]) => instruments.get(position)?.id !== id)) return team;
  }

  if (Object.entries(edit.replacements ?? {}).some(([id, replacement]) =>
    team.pieces.filter(piece => piece.unitId === id).length !== 1 ||
    !data.units.some(unit => unit.id === replacement.unitId))) return team;
  const pieces = edit.positions || edit.items || edit.replacements ? team.pieces.map(piece => {
    const next = edit.replacements?.[piece.unitId] ? { ...piece, ...edit.replacements[piece.unitId] } : piece;
    return {
      ...next, position: edit.positions?.[next.unitId] ?? next.position,
      items: edit.items?.[next.unitId] ?? next.items,
    };
  }) : team.pieces;
  const instrumentPositions = edit.instrumentMoves ? { ...team.instrumentPositions, ...edit.instrumentMoves } : team.instrumentPositions;
  const positions = [...pieces.map(piece => piece.position), ...Object.values(instrumentPositions ?? {})];
  if (new Set(positions).size !== positions.length || positions.some(position => position < 0 || position > 27)) return team;
  if (pieces === team.pieces && !edit.instrumentMoves && !edit.name && !edit.notes) return team;
  return { ...team, pieces, instrumentPositions, webTitle: edit.name ?? team.webTitle };
}

// Keep these site-authored boards out of the synchronized document and stored snapshots.
export function includeRerollBoards(snapshot: Publication, current: Season): Publication {
  if (editionScope(current.id) !== "s19-pbe") return snapshot;
  const sections = snapshot.sections.map(section => {
    const guide = guides.get(section.id);
    const base = section.gameData ?? snapshot.season;
    const originals = sectionTeams(section);
    if (!guide || editionScope(base.id) !== "s19-pbe" || !originals.length) return section;
    const teams = new Map(originals.map(team => [team.id, team]));
    const advice: Record<string, string> = {};
    const added: string[] = [];
    const corrected: string[] = [];
    const wording: NonNullable<BoardEdit["wording"]>[] = [...(guide.wording ?? [])];
    const stages = guide.stages.flatMap(({ pieces, instrumentPositions, ...stage }) => {
      if (stage.parentTeamId && !teams.has(stage.parentTeamId)) return [];
      if (!teams.has(stage.teamId)) {
        if (!pieces?.length) return [];
        const parent = (stage.parentTeamId && teams.get(stage.parentTeamId)) || originals[0];
        teams.set(stage.teamId, {
          id: stage.teamId, name: stage.name, notes: stage.notes, boardRole: stage.boardRole ?? "stage",
          ...(instrumentPositions && { instrumentPositions }),
          pieces: pieces.map((piece, i) => ({ ...piece, instanceId: stage.teamId.slice(0, -2) + i.toString(16).padStart(2, "0") })),
          sectionId: section.id, category: parent.category, revision: 0, updatedAt: snapshot.publishedAt,
        });
        added.push(stage.teamId);
      } else if (pieces) {
        // A board with this ID has been saved by the editor. Its authored copy wins.
        return [];
      }
      return [stage];
    });
    for (const edit of guide.edits ?? []) {
      const original = teams.get(edit.teamId);
      if (!original) continue;
      const next = editBoard(original, edit, current);
      if (next === original) continue;
      teams.set(edit.teamId, next);
      if (edit.notes) advice[edit.teamId] = edit.notes;
      if (edit.positions || edit.items || edit.replacements || edit.instrumentMoves) corrected.push(edit.teamId);
      if (edit.wording) wording.push(edit.wording);
    }
    for (const [id, team] of teams) {
      const parentTeamId = stages.find(stage => stage.teamId === id)?.parentTeamId;
      const isAdded = added.includes(id);
      const updated = correctRerollStars(team, current.units, section.id, parentTeamId, isAdded);
      if (updated === team) continue;
      teams.set(id, updated);
      if (!isAdded && !corrected.includes(id)) corrected.push(id);
    }
    const stageTeamIds = [...new Set([...(section.stageTeamIds ?? originals.filter(team => team.boardRole === "stage").map(team => team.id)),
      ...stages.filter(stage => stage.boardRole !== "variant").map(stage => stage.teamId)])];
    const units = new Set([...teams.values()].flatMap(team => team.pieces.map(piece => piece.unitId)));
    const items = new Set([...teams.values()].flatMap(team => team.pieces.flatMap(piece => piece.items)));
    for (const item of current.items) if (items.has(item.id)) for (const part of item.components ?? []) items.add(part);
    return {
      ...section, team: section.team && teams.get(section.team.id), teams: [...teams.values()], stageTeamIds,
      blocks: section.blocks.flatMap(block => {
        if (guide.hiddenLegacy?.some(entry => entry.id === block.id && block.text?.startsWith(entry.prefix))) return [];
        return wording.length ? [replaceWording(block, wording)] : [block];
      }),
      reroll: { entryTeamId: guide.entryTeamId && teams.has(guide.entryTeamId) ? guide.entryTeamId : undefined, stages, advice, added, corrected },
      gameData: {
        ...base,
        units: [...base.units, ...current.units.filter(unit => units.has(unit.id) && !base.units.some(entry => entry.id === unit.id))],
        items: [...base.items, ...current.items.filter(item => items.has(item.id) && !base.items.some(entry => entry.id === item.id))],
      },
    };
  });
  return { ...snapshot, sections };
}
