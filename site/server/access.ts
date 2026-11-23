import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export function database() {
  if (!env.DB) throw new Error("站点数据库尚未连接");
  return env.DB;
}
export async function setting(key: string) {
  const row = await database()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}
export async function setSetting(key: string, value: string) {
  await database()
    .prepare(
      "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(key, value)
    .run();
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireOwner(request?: Request) {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "请先登录站主账号");
  const ownerId = await setting("owner_id");
  if (ownerId !== user.userId)
    throw new ApiError(
      403,
      ownerId ? "仅站主可以执行此操作" : "请先完成站主绑定",
    );
  if (request && !["GET", "HEAD"].includes(request.method))
    assertSameOrigin(request);
  return user;
}
/** Server-rendered owner pages may fall back to OwnerGate if identity/storage is unavailable. */
export async function currentOwner() {
  try {
    const user = await getChatGPTUser();
    if (!user || (await setting("owner_id")) !== user.userId) return null;
    return user;
  } catch {
    return null;
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new ApiError(403, "请求来源不匹配");
}
export function apiError(error: unknown) {
  if (error instanceof ApiError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "API failure",
    error instanceof Error ? error.message : "unknown",
  );
  return Response.json(
    { error: "操作未完成，请稍后重试；草稿仍保留。" },
    { status: 500 },
  );
}
