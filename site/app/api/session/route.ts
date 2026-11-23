import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  apiError,
  assertSameOrigin,
  database,
  setting,
  ApiError,
} from "@/server/access";

export async function GET() {
  try {
    const user = await getChatGPTUser();
    const ownerId = await setting("owner_id");
    return Response.json(
      {
        signedIn: !!user,
        isOwner: !!user && user.userId === ownerId,
        needsSetup: !ownerId,
        setupAllowed: env.ALLOW_OWNER_SETUP === "true",
        displayName: user?.displayName,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getChatGPTUser();
    if (!user) throw new ApiError(401, "请先登录");
    if (env.ALLOW_OWNER_SETUP !== "true")
      throw new ApiError(403, "站主绑定入口未启用");
    // One-time binding is only enabled while the hosting audience is owner-private.
    await database()
      .prepare(
        "INSERT INTO settings (key,value) VALUES ('owner_id',?) ON CONFLICT(key) DO NOTHING",
      )
      .bind(user.userId)
      .run();
    if ((await setting("owner_id")) !== user.userId)
      throw new ApiError(403, "此站点已绑定其他站主");
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
