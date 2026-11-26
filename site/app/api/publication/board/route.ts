import { z } from "zod";
import { ApiError, apiError, requireDatabase, requireOwner } from "@/server/access";
import { editablePublishedBoard, publishBoardFormation, publishBoardPositions } from "@/server/publish-board";
import { teamBoardSchema, teamConditionsSchema } from "@/server/validate-team";

const position = z.number().int().min(0).max(27);
const identifier = z.string().min(1).max(100);
const loadout = z.object({
  instanceId: identifier,
  unitId: identifier,
  stars: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  items: z.array(identifier).max(3),
});
const target = z.object({ publication: identifier, section: identifier, team: identifier });
const submission = z.object({
  publicationId: identifier,
  sectionId: identifier,
  team: z.object({
    id: identifier,
    pieces: z.array(loadout.extend({ position, alternate: loadout.optional() })).min(1).max(28),
    instrumentPositions: z.object({
      maracas: position.optional(),
      rainstick: position.optional(),
      infernalIdol: position.optional(),
    }).strict().optional(),
  }),
});

const headers = { "Cache-Control": "no-store" };

const formation = submission.extend({
  team: teamBoardSchema.extend({ id: identifier, conditions: teamConditionsSchema }),
});

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const parsed = target.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApiError(400, "缺少发布版本、章节或棋盘");
    const { publication, section, team: id } = parsed.data;
    const { team } = await editablePublishedBoard(publication, section, id);
    return Response.json({ team }, { headers });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireOwner(request);
    requireDatabase();
    const parsed = submission.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "棋盘格式不正确");
    const { publicationId, sectionId, team } = parsed.data;
    return Response.json(await publishBoardPositions(publicationId, sectionId, team), { headers });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireOwner(request);
    requireDatabase();
    const parsed = formation.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "棋盘格式不正确");
    const { publicationId, sectionId, team } = parsed.data;
    return Response.json(await publishBoardFormation(publicationId, sectionId, team), { headers });
  } catch (error) {
    return apiError(error);
  }
}
