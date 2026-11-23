import { apiError, ApiError, database, requireOwner } from "@/server/access";
import { writeTeam } from "@/server/writeback";
import { readPngSize } from "@/server/png-size";
import { readSavedTeam } from "@/server/teams";
export async function POST(request: Request) {
  try {
    const user = await requireOwner(request);
    const form = await request.formData();
    const image = form.get("image"),
      teamId = form.get("teamId"),
      sectionId = form.get("sectionId"),
      revision = Number(form.get("revision"));
    if (
      !(image instanceof Blob) ||
      image.type !== "image/png" ||
      image.size > 5 * 1024 * 1024 ||
      image.size < 8 ||
      typeof teamId !== "string" ||
      typeof sectionId !== "string"
    )
      throw new ApiError(400, "请选择章节并提供 5 MB 以内的阵容 PNG 图片");
    const size = await readPngSize(image);
    if (!size) throw new ApiError(400, "图片格式不正确");
    const row = await database()
      .prepare("SELECT body,revision FROM teams WHERE id=? AND owner_id=?")
      .bind(teamId, user.userId)
      .first<{ body: string; revision: number }>();
    if (!row || row.revision !== revision)
      throw new ApiError(409, "请先保存当前阵容，再更新飞书");
    return Response.json(
      await writeTeam(readSavedTeam(row), sectionId, image, size),
    );
  } catch (error) {
    return apiError(error);
  }
}
