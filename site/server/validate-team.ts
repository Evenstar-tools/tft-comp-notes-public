import { z } from "zod";
import { mixedForms } from "@/domain/team";
import { boardStages } from "@/domain/team-stages";
import { conditionItemCategory, conditionKey } from "@/domain/guide-equipment-conditions";
import type { BoardSetup, Team } from "@/domain/types";
import { itemMap, season } from "@/data";
import augmentCatalog from "@/data/augment-catalog.json";
import { ApiError } from "./access";

const boardPosition = z.number().int().min(0).max(27);
const pieceLoadout = z.object({
  instanceId: z.string().uuid(),
  unitId: z.string(),
  stars: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  items: z.array(z.string()).max(3),
});
export const teamBoardSchema = z.object({
  instrumentPositions: z.object({
    maracas: boardPosition.optional(), rainstick: boardPosition.optional(), infernalIdol: boardPosition.optional(),
  }).strict().optional(),
  pieces: z
    .array(
      pieceLoadout.extend({
        position: boardPosition,
        alternate: pieceLoadout.optional(),
      }),
    )
    .max(28),
}).strict();
const conditionKind = z.enum(["required", "option"]);
const conditionId = z.string().min(1).max(180);
const condition = z.union([
  z.object({ kind: conditionKind, augmentId: conditionId }).strict(),
  z.object({ kind: conditionKind, itemId: conditionId, recipientId: conditionId, replaces: conditionId.optional() }).strict(),
]);
export const teamConditionsSchema = z.array(condition).optional();
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
  conditions: teamConditionsSchema,
  mainStage: z.enum(boardStages).optional(),
  stages: z.object({ early: teamBoardSchema.optional(), mid: teamBoardSchema.optional() }).strict().optional(),
  ...teamBoardSchema.shape,
});
const unitIds = new Set(season.units.map((unit) => unit.id));
const itemIds = new Set(season.items.map((item) => item.id));
const augmentIds = new Set(augmentCatalog.rows.map(augment => augment.id));

export function validateBoard({ pieces }: BoardSetup) {
  const loadouts = pieces.flatMap(piece => piece.alternate ? [piece, piece.alternate] : [piece]);
  if (
    new Set(pieces.map((piece) => piece.position)).size !== pieces.length ||
    new Set(loadouts.map((piece) => piece.instanceId)).size !== loadouts.length
  )
    throw new ApiError(400, "棋盘格或棋子实例重复");
  if (
    loadouts.some(
      (piece) =>
        !unitIds.has(piece.unitId) ||
        piece.items.some((id) => !itemIds.has(id)),
    )
  )
    throw new ApiError(400, "阵容含当前资料版本中不存在的英雄或装备");
  if (mixedForms(pieces)) throw new ApiError(400, "阿卡丽只能使用一种形态，请在棋盘选择保留的形态");
}

export function validateTeamConditions(conditions: Team["conditions"]) {
  if (conditions) {
    if (new Set(conditions.map(conditionKey)).size !== conditions.length) throw new ApiError(400, "定阵条件重复");
    if (conditions.some(rule => "augmentId" in rule ? !augmentIds.has(rule.augmentId) :
      !conditionItemCategory(itemMap.get(rule.itemId)) || !unitIds.has(rule.recipientId) ||
      (rule.replaces !== undefined && (!itemIds.has(rule.replaces) || rule.replaces === rule.itemId)))) {
      throw new ApiError(400, "定阵条件中的海克斯、装备或棋子无效");
    }
  }
}

export function validateTeam(input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(400, "阵容格式不完整，请检查名称与棋盘");
  const team = result.data;
  validateBoard(team);
  validateTeamConditions(team.conditions);
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
