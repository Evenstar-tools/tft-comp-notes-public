import { mediaStore } from "@/server/runtime-media";
import { apiError, ApiError, database, requireOwner } from "@/server/access";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!/^[a-zA-Z0-9_-]+$/.test(token)) throw new ApiError(404, "图片不存在");
    const published = await database().prepare(
      `SELECT 1 AS allowed
       FROM snapshots, json_each(snapshots.body, '$.media') AS published_media
       WHERE snapshots.id=(SELECT value FROM settings WHERE key='published_id')
         AND json_type(snapshots.body, '$.media')='array' AND published_media.value=? LIMIT 1`,
    ).bind(token).first();
    if (!published) await requireOwner();
    const storage = mediaStore();
    const key = `media/${token}`;
    const object = await storage.get(key);
    if (!object) throw new ApiError(404, "图片尚未同步");
    if (object.size !== undefined && object.size > 5_500_000) {
      const download = await storage.signedReadUrl(key);
      if (download) {
        await object.body.cancel();
        return new Response(null, {
          status: 307,
          headers: { Location: download, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
        });
      }
    }
    return new Response(object.body, {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
