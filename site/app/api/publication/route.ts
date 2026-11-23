import {
  apiError,
  ApiError,
  database,
  requireOwner,
  setSetting,
} from "@/server/access";
import {
  draftDocument,
  editGuidePreview,
  livePublication,
  publishSections,
  synchronizeDocument,
} from "@/server/publication";
import { z } from "zod";
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("preview"), draftId: z.string().uuid(), sectionId: z.string().max(100), primaryTeamId: z.string().uuid(), summaryBlockId: z.string().max(100).optional(), stageTeamIds: z.array(z.string().uuid()).max(100).optional() }),
  z.object({
    action: z.literal("publish"),
    draftId: z.string().uuid(),
    sectionIds: z.array(z.string().max(100)).max(500),
    removeIds: z.array(z.string().max(100)).max(500).default([]),
  }),
  z.object({ action: z.literal("rollback"), id: z.string().uuid() }),
]);
export async function GET() {
  try {
    await requireOwner();
    const history = await database()
      .prepare(
        "SELECT id,created_at FROM snapshots ORDER BY created_at DESC LIMIT 20",
      )
      .all();
    const jobs = await database()
      .prepare(
        "SELECT id,kind,status,updated_at FROM sync_jobs ORDER BY updated_at DESC LIMIT 8",
      )
      .all();
    return Response.json(
      {
        draft: await draftDocument(),
        live: await livePublication(),
        history: history.results,
        jobs: jobs.results,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireOwner(request);
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "请求格式错误");
    const body = parsed.data;
    if (body.action === "sync")
      return Response.json({ draft: await synchronizeDocument() });
    if (body.action === "preview") {
      await editGuidePreview(body.draftId, body.sectionId, body.primaryTeamId, body.summaryBlockId, body.stageTeamIds);
      return Response.json({ saved: true });
    }
    if (body.action === "publish") {
      if (
        !Array.isArray(body.sectionIds) ||
        !Array.isArray(body.removeIds ?? [])
      )
        throw new ApiError(400, "章节选择格式错误");
      return Response.json({
        live: await publishSections(
          body.draftId,
          body.sectionIds,
          body.removeIds ?? [],
        ),
      });
    }
    if (body.action === "rollback") {
      const row = await database()
        .prepare("SELECT id FROM snapshots WHERE id=?")
        .bind(String(body.id))
        .first();
      if (!row) throw new ApiError(404, "发布版本不存在");
      await setSetting("published_id", String(body.id));
      return Response.json({ live: await livePublication() });
    }
    throw new ApiError(400, "未知操作");
  } catch (error) {
    return apiError(error);
  }
}
