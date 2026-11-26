import { season } from "@/data";
import { sectionTeams } from "@/domain/document-flow";
import { isEditorialSection } from "@/domain/guide-reading";
import { applyBoardLayout, boardLayout, publishedBoardContent, publishedBoardEdits, publishedBoardLayouts, sameBoardLayout, type PublishedBoardContent } from "@/domain/published-board-layout";
import { sameEdition } from "@/domain/version-updates";
import type { BoardSetup, PieceLoadout } from "@/domain/types";
import { ApiError } from "./access";
import { installPublication, publishedSnapshot } from "./publication";
import { includeRerollBoards } from "./reroll-guides";
import { migrateS19GuideSnapshot } from "./s19-guide-cleanup";
import { validateBoard, validateTeamConditions } from "./validate-team";

export async function editablePublishedBoard(publicationId: string, sectionId: string, teamId: string) {
  const snapshot = await publishedSnapshot();
  if (!snapshot || snapshot.id !== publicationId) throw new ApiError(409, "公开棋盘已有新版本，请返回攻略后重新打开");
  const migrated = migrateS19GuideSnapshot(snapshot);
  const section = migrated.sections.find(entry => entry.id === sectionId);
  const source = section && sectionTeams(section).find(team => team.id === teamId);
  if (!section || !source || !source.pieces.length || isEditorialSection(section))
    throw new ApiError(404, "此章节没有对应的可发布棋盘");
  if (!sameEdition((section.gameData ?? migrated.season).id, season.id))
    throw new ApiError(409, "该棋盘与当前编辑器赛季不同");
  const renderedSection = includeRerollBoards(migrated, season).sections.find(entry => entry.id === sectionId);
  const team = renderedSection && sectionTeams(renderedSection).find(entry => entry.id === teamId);
  if (!team) throw new ApiError(404, "此章节没有对应的可发布棋盘");
  const publication = snapshot.sections.includes(section) ? snapshot : migrated;
  return { publication, source, team };
}

function sameLoadout(first: PieceLoadout, second: PieceLoadout) {
  return first.instanceId === second.instanceId && first.unitId === second.unitId && first.stars === second.stars &&
    first.items.length === second.items.length && first.items.every((item, index) => item === second.items[index]);
}

function checkPositions({ pieces, instrumentPositions }: BoardSetup) {
  const positions = [...pieces.map(piece => piece.position), ...Object.values(instrumentPositions ?? {})];
  if (new Set(positions).size !== positions.length) throw new ApiError(400, "棋子或乐器占用了同一格");
}

export async function publishBoardPositions(publicationId: string, sectionId: string, submitted: BoardSetup & { id: string }) {
  const { publication, source, team } = await editablePublishedBoard(publicationId, sectionId, submitted.id);
  checkPositions(submitted);
  const layout = boardLayout(submitted);
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

export async function publishBoardFormation(publicationId: string, sectionId: string, submitted: PublishedBoardContent & { id: string }) {
  const { publication, source, team } = await editablePublishedBoard(publicationId, sectionId, submitted.id);
  if (!submitted.pieces.length) throw new ApiError(400, "棋盘至少需要一枚棋子");
  validateBoard(submitted);
  validateTeamConditions(submitted.conditions);
  checkPositions(submitted);
  const content = publishedBoardContent(submitted);
  if (JSON.stringify(content) === JSON.stringify(publishedBoardContent(team))) return { publicationId, team };
  const contents = publishedBoardEdits(publication.sections, publication.boardEdits)
    .filter(edit => edit.sectionId !== sectionId || edit.teamId !== team.id);
  const layouts = publishedBoardLayouts(publication.sections, publication.boardLayouts)
    .filter(edit => edit.sectionId !== sectionId || edit.teamId !== team.id);
  const next = {
    ...publication,
    id: crypto.randomUUID(),
    previousId: publication.id,
    publishedAt: new Date().toISOString(),
    boardLayouts: layouts,
    boardEdits: [...contents, { sectionId, teamId: team.id, source: publishedBoardContent(source), content }],
  };
  await installPublication(next);
  return { publicationId: next.id, team: { ...team, ...content } };
}
