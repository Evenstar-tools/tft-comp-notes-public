import { ownerContentMutation, ownerContentTarget } from "@/domain/owner-content";
import { apiError, ApiError, requireDatabase, requireOwner } from "@/server/access";
import { readOwnerContent, saveOwnerContent } from "@/server/owner-content";
import { ownerContentBasePublication } from "@/server/publication";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    requireDatabase();
    const params = new URL(request.url).searchParams;
    const target = ownerContentTarget.safeParse(params.get("home") === "1" ? { home: true } : {
      sectionId: params.get("section"), teamId: params.get("team"),
    });
    if (!target.success) throw new ApiError(400, "编辑目标无效");
    return Response.json(await readOwnerContent(await ownerContentBasePublication(), target.data), { headers });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireOwner(request);
    requireDatabase();
    const input = ownerContentMutation.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new ApiError(400, "编辑内容或区块顺序无效");
    return Response.json(await saveOwnerContent(await ownerContentBasePublication(), input.data), { headers });
  } catch (error) {
    return apiError(error);
  }
}
