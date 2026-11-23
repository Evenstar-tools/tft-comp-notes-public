import { z } from "zod";
import { mixedForms } from "@/domain/team";
import { boardStages } from "@/domain/team-stages";
import type { BoardSetup } from "@/domain/types";
import { season } from "@/data";
import { ApiError } from "./access";

const boardPosition = z.number().int().min(0).max(27);
const board = z.object({
  instrumentPositions: z.object({ maracas: boardPosition.optional(), rainstick: boardPosition.optional() }).strict().optional(),
  pieces: z
    .array(
      z.object({
        instanceId: z.string().uuid(),
        unitId: z.string(),
        position: boardPosition,
        stars: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        items: z.array(z.string()).max(3),
      }),
    )
    .max(28),
}).strict();
const schema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  category: z.string().max(50),
  notes: z.string().max(10000),
  revision: z.number().int().min(0),
  updatedAt: z.string(),
  sectionId: z.string().max(100).optional(),
  posterFormat: z.enum(["full", "quick"]).optional(),
  boardRole: z.enum(["variant", "stage"]).optional(),
  mainStage: z.enum(boardStages).optional(),
  stages: z.object({ early: board.optional(), mid: board.optional() }).strict().optional(),
  ...board.shape,
});
const unitIds = new Set(season.units.map((unit) => unit.id));
const itemIds = new Set(season.items.map((item) => item.id));

function validateBoard({ pieces }: BoardSetup) {
  if (
    new Set(pieces.map((piece) => piece.position)).size !== pieces.length ||
    new Set(pieces.map((piece) => piece.instanceId)).size !== pieces.length
  )
    throw new ApiError(400, "棋盘格或棋子实例重复");
  if (
    pieces.some(
      (piece) =>
        !unitIds.has(piece.unitId) ||
        piece.items.some((id) => !itemIds.has(id)),
    )
  )
    throw new ApiError(400, "阵容含当前资料版本中不存在的英雄或装备");
  if (mixedForms(pieces)) throw new ApiError(400, "阿卡丽只能使用一种形态，请在棋盘选择保留的形态");
}

export function validateTeam(input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(400, "阵容格式不完整，请检查名称与棋盘");
  const team = result.data;
  validateBoard(team);
  const latest = team.mainStage ?? "late";
  for (const stage of ["early", "mid"] as const) {
    const snapshot = team.stages?.[stage];
    if (!snapshot) continue;
    if (!team.pieces.length || !snapshot.pieces.length || boardStages.indexOf(stage) >= boardStages.indexOf(latest)) {
      throw new ApiError(400, "阶段棋盘顺序不正确，请保留每个阶段各一套棋盘");
    }
    validateBoard(snapshot);
  }
  return team;
}
