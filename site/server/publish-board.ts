import { season } from "@/data";
import { sectionTeams } from "@/domain/document-flow";
import { isEditorialSection } from "@/domain/guide-reading";
import { applyBoardLayout, boardLayout, publishedBoardLayouts, sameBoardLayout } from "@/domain/published-board-layout";
import { sameEdition } from "@/domain/version-updates";
import type { BoardSetup, PieceLoadout } from "@/domain/types";
import { ApiError } from "./access";
import { installPublication, publishedSnapshot } from "./publication";
import { includeRerollBoards } from "./reroll-guides";

export async function editablePublishedBoard(publicationId: string, sectionId: string, teamId: string) {
  const publication = await publishedSnapshot();
  if (!publication || publication.id !== publicationId) throw new ApiError(409, "公开棋盘已有新版本，请返回攻略后重新打开");
  const section = publication.sections.find(entry => entry.id === sectionId);
  const source = section && sectionTeams(section).find(team => team.id === teamId);
  if (!section || !source || !source.pieces.length || isEditorialSection(section))
    throw new ApiError(404, "此章节没有对应的可发布棋盘");
  if (!sameEdition((section.gameData ?? publication.season).id, season.id))
    throw new ApiError(409, "该棋盘与当前编辑器赛季不同");
  const renderedSection = includeRerollBoards(publication, season).sections.find(entry => entry.id === sectionId);
  const team = renderedSection && sectionTeams(renderedSection).find(entry => entry.id === teamId);
  if (!team) throw new ApiError(404, "此章节没有对应的可发布棋盘");
  return { publication, source, team };
}

function sameLoadout(first: PieceLoadout, second: PieceLoadout) {
  return first.instanceId === second.instanceId && first.unitId === second.unitId && first.stars === second.stars &&
    first.items.length === second.items.length && first.items.every((item, index) => item === second.items[index]);
}

export async function publishBoardPositions(publicationId: string, sectionId: string, submitted: BoardSetup & { id: string }) {
  const { publication, source, team } = await editablePublishedBoard(publicationId, sectionId, submitted.id);
  const layout = boardLayout(submitted);
  const positions = [...layout.pieces.map(piece => piece.position), ...Object.values(layout.instrumentPositions ?? {})];
  if (new Set(positions).size !== positions.length) throw new ApiError(400, "棋子或乐器占用了同一格");
  const previousPieces = new Map(team.pieces.map(piece => [piece.instanceId, piece]));
  if (new Set(layout.pieces.map(piece => piece.instanceId)).size !== previousPieces.size ||
      submitted.pieces.length !== previousPieces.size || submitted.pieces.some((piece) => {
        const previous = previousPieces.get(piece.instanceId);
        if (!previous || !sameLoadout(piece, previous)) return true;
        if (!piece.alternate || !previous.alternate) return !!piece.alternate !== !!previous.alternate;
        return !sameLoadout(piece.alternate, previous.alternate);
      })) throw new ApiError(400, "单棋盘发布只支持修改站位，棋子、星级与配装必须一致");
  if (sameBoardLayout(layout, boardLayout(team))) return { publicationId, team };
  const layouts = publishedBoardLayouts(publication.sections, publication.boardLayouts)
    .filter(edit => edit.sectionId !== sectionId || edit.teamId !== team.id);
  const next = {
    ...publication,
    id: crypto.randomUUID(),
    previousId: publication.id,
    publishedAt: new Date().toISOString(),
    boardLayouts: [...layouts, { sectionId, teamId: team.id, source: boardLayout(source), layout }],
  };
  await installPublication(next);
  return { publicationId: next.id, team: applyBoardLayout(team, layout) };
}
