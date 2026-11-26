import type { ContentBlock, Section } from "./document";
import { sectionTeams } from "./document-flow.ts";
import type { BoardSetup, Season, Team } from "./types";
import { sameEdition } from "./version-updates.ts";

function previewBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.map(({ elements: _elements, children, ...block }) =>
    children?.length ? { ...block, children: previewBlocks(children) } : block);
}

// The list and quick-view board only need keys local to a read-only preview.
// Guide links keep their original section and team IDs.
function previewBoard<T extends BoardSetup>(board: T): T {
  return {
    ...board,
    pieces: board.pieces.map((piece, index) => ({
      ...piece,
      instanceId: String(index),
      ...(piece.alternate && { alternate: { ...piece.alternate, instanceId: index + "-alt" } }),
    })),
  };
}

function previewTeam(team: Team): Team {
  const preview = previewBoard(team);
  if (team.stages?.early) preview.stages = { ...preview.stages, early: previewBoard(team.stages.early) };
  if (team.stages?.mid) preview.stages = { ...preview.stages, mid: previewBoard(team.stages.mid) };
  return preview;
}

export function homeGuidePreview(section: Section, season: Season): Section {
  const { gameData, team: _team, teams: _teams, blocks, ...rest } = section;
  const boards = sectionTeams(section);
  return {
    ...rest,
    ...(gameData && !sameEdition(gameData.id, season.id) && { gameData }),
    ...(boards.length && { teams: boards.map(previewTeam) }),
    blocks: previewBlocks(blocks),
  };
}
