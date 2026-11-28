import type { Publication, Section } from "./document";
import { sectionTeams } from "./document-flow.ts";
import type { BoardSetup, Piece, PieceLoadout, Team } from "./types";
import { sameEdition } from "./version-updates.ts";
import { boardQuerySignature, supportsOrdinaryBoardQuery } from "./owner-board-query.ts";

export type BoardLayout = {
  pieces: Pick<Piece, "instanceId" | "unitId" | "position">[];
  instrumentPositions?: BoardSetup["instrumentPositions"];
};

export type PublishedBoardLayout = {
  sectionId: string;
  teamId: string;
  source: BoardLayout;
  layout: BoardLayout;
};

export type PublishedBoardContent = BoardSetup & Pick<Team, "conditions">;

export type PublishedBoardEdit = {
  sectionId: string;
  teamId: string;
  source: PublishedBoardContent;
  content: PublishedBoardContent;
};

export type PublishedBoardOverride = PublishedBoardEdit & { edition: string };

function loadout({ instanceId, unitId, stars, items }: PieceLoadout): PieceLoadout {
  return { instanceId, unitId, stars, items };
}

export function publishedBoardContent({ pieces, instrumentPositions, conditions }: PublishedBoardContent): PublishedBoardContent {
  return {
    pieces: pieces.map(piece => ({
      ...loadout(piece), position: piece.position, alternate: piece.alternate && loadout(piece.alternate),
    })).sort((a, b) => a.position - b.position),
    instrumentPositions: Object.keys(instrumentPositions ?? {}).length ? instrumentPositions : undefined,
    conditions,
  };
}

export function boardContentVersion(board: PublishedBoardContent): string {
  return JSON.stringify(publishedBoardContent(board));
}

export function publishedBoardEdits(sections: Section[], edits?: PublishedBoardEdit[], renderedSections?: Section[]) {
  return (edits ?? []).filter(({ sectionId, teamId, source }) => {
    const section = sections.find(entry => entry.id === sectionId);
    if (!section) return false;
    const original = sectionTeams(section).find(entry => entry.id === teamId);
    const generated = !original && renderedSections?.find(entry => entry.id === sectionId && entry.reroll?.added.includes(teamId));
    const team = original ?? (generated && sectionTeams(generated).find(entry => entry.id === teamId));
    return team && JSON.stringify(publishedBoardContent(team)) === JSON.stringify(source);
  });
}

export function applyPublishedBoardEdits(source: Publication, rendered: Publication): Publication {
  const edits = publishedBoardEdits(source.sections, source.boardEdits, rendered.sections);
  if (!edits.length) return rendered;
  return {
    ...rendered,
    sections: rendered.sections.map(section => {
      const byTeam = new Map(edits.filter(edit => edit.sectionId === section.id).map(edit => [edit.teamId, edit.content]));
      if (!byTeam.size) return section;
      const replace = (team: Team) => {
        const content = byTeam.get(team.id);
        return content ? { ...team, ...content, instrumentPositions: content.instrumentPositions, conditions: content.conditions } : team;
      };
      return { ...section, team: section.team && replace(section.team), teams: section.teams?.map(replace) };
    }),
  };
}

export function boardLayout({ pieces, instrumentPositions }: BoardSetup): BoardLayout {
  return {
    pieces: pieces.map(({ instanceId, unitId, position }) => ({ instanceId, unitId, position }))
      .sort((left, right) => left.instanceId.localeCompare(right.instanceId)),
    ...(Object.keys(instrumentPositions ?? {}).length ? { instrumentPositions } : {}),
  };
}

const instrumentNames = ["maracas", "rainstick", "infernalIdol"] as const;

export function sameBoardLayout(left: BoardLayout, right: BoardLayout) {
  return left.pieces.length === right.pieces.length &&
    left.pieces.every((piece, index) => {
      const other = right.pieces[index];
      return piece.instanceId === other.instanceId && piece.unitId === other.unitId && piece.position === other.position;
    }) && instrumentNames.every(id => left.instrumentPositions?.[id] === right.instrumentPositions?.[id]);
}

export function applyBoardLayout(team: Team, layout: BoardLayout): Team {
  const positions = new Map(layout.pieces.map(piece => [piece.instanceId, piece]));
  if (positions.size !== team.pieces.length || team.pieces.some(piece => positions.get(piece.instanceId)?.unitId !== piece.unitId)) return team;
  const result = {
    ...team,
    pieces: team.pieces.map(piece => ({ ...piece, position: positions.get(piece.instanceId)!.position })),
  };
  if (layout.instrumentPositions) result.instrumentPositions = layout.instrumentPositions;
  else delete result.instrumentPositions;
  return result;
}

export function publishedBoardLayouts(sections: Section[], layouts?: PublishedBoardLayout[]) {
  return (layouts ?? []).filter(({ sectionId, teamId, source }) => {
    const section = sections.find(entry => entry.id === sectionId);
    const board = section && sectionTeams(section).find(team => team.id === teamId);
    return board && sameBoardLayout(source, boardLayout(board));
  });
}

export function applyPublishedBoardLayouts(source: Publication, rendered: Publication): Publication {
  const layouts = publishedBoardLayouts(source.sections, source.boardLayouts);
  if (!layouts.length) return rendered;
  return {
    ...rendered,
    sections: rendered.sections.map(section => {
      const edits = layouts.filter(entry => entry.sectionId === section.id);
      if (!edits.length) return section;
      const replace = (team: Team) => {
        const edit = edits.find(entry => entry.teamId === team.id);
        return edit ? applyBoardLayout(team, edit.layout) : team;
      };
      return { ...section, team: section.team && replace(section.team), teams: section.teams?.map(replace) };
    }),
  };
}

export function applyBoardOverrides(publication: Publication): Publication {
  if (!publication.boardOverrides?.length) return publication;
  const overrides = publication.boardOverrides;
  return {
    ...publication,
    sections: publication.sections.map(section => {
      const edition = section.gameData?.id ?? publication.season.id;
      const boards = new Map(overrides.filter(edit => edit.sectionId === section.id && sameEdition(edit.edition, edition))
        .map(edit => [edit.teamId, edit]));
      if (!boards.size) return section;
      const replace = (team: Team) => {
        const edit = boards.get(team.id);
        if (!edit || boardContentVersion(team) !== boardContentVersion(edit.source)) return team;
        const publishedRosterChanged = boardQuerySignature(team.pieces) !== boardQuerySignature(edit.content.pieces);
        const updated = { ...team, ...edit.content, instrumentPositions: edit.content.instrumentPositions, conditions: edit.content.conditions };
        const data = section.gameData ?? publication.season;
        const needsReview = !supportsOrdinaryBoardQuery(section, updated, data) &&
          (publishedRosterChanged || supportsOrdinaryBoardQuery(section, team, data));
        return { ...updated, ...(publishedRosterChanged && { publishedRosterChanged: true as const }),
          ...(needsReview && { publishedRosterNeedsReview: true as const }) };
      };
      return { ...section, team: section.team && replace(section.team), teams: section.teams?.map(replace) };
    }),
  };
}
