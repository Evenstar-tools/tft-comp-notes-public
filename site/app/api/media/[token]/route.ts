import { env } from "cloudflare:workers";
import { apiError, ApiError, requireOwner } from "@/server/access";
import { livePublication } from "@/server/publication";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!/^[a-zA-Z0-9_-]+$/.test(token)) throw new ApiError(404, "图片不存在");
    const live = await livePublication();
    if (!live?.media.includes(token)) await requireOwner();
    const object = await env.BUCKET?.get(`media/${token}`);
    if (!object) throw new ApiError(404, "图片尚未同步");
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
