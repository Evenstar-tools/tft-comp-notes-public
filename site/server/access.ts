import { database } from "./runtime-db";
import { defaultOwnerId, hasOwnerSession } from "./owner-session";

export { database };
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
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
export function requireDatabase() {
  if (!databaseConfigured()) throw new ApiError(503, "云端数据库尚未配置，暂无法读写云端数据");
}
async function ownerIdentity() {
  const userId = databaseConfigured() ? await setting("owner_id") || defaultOwnerId : defaultOwnerId;
  return { userId, displayName: "站主" };
}
export async function requireOwner(request?: Request) {
  if (request && !["GET", "HEAD"].includes(request.method)) assertSameOrigin(request);
  if (!(await hasOwnerSession())) throw new ApiError(401, "请先登录站主账号");
  return ownerIdentity();
}
export async function currentOwner() {
  try {
    return await hasOwnerSession() ? await ownerIdentity() : null;
  } catch {
    return null;
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new Set<string>([new URL(request.url).origin]);
  for (const item of (process.env.SITE_ORIGIN || "").split(",")) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    try { allowed.add(new URL(trimmed).origin); } catch {}
  }
  if (!origin || !allowed.has(origin)) throw new ApiError(403, "请求来源不匹配");
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
