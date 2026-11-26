import { NextResponse } from "next/server";
import { apiError, assertSameOrigin, database, databaseConfigured, ApiError } from "@/server/access";
import {
  acceptsOwnerCode, checkOwnerLoginRateLimit, clearOwnerLoginFailures, defaultOwnerId,
  hasOwnerSession, newOwnerSession, ownerCookieName, ownerCookieOptions, ownerLoginConfigured,
  recordOwnerLoginFailure,
} from "@/server/owner-session";

const headers = { "Cache-Control": "no-store" };

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "default";
}

function isOwner(signedIn: boolean) {
  return {
    signedIn,
    isOwner: signedIn,
    loginConfigured: ownerLoginConfigured(),
    databaseConfigured: databaseConfigured(),
  };
}

export async function GET() {
  return NextResponse.json(isOwner(await hasOwnerSession()), { headers });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!ownerLoginConfigured()) throw new ApiError(503, "站主口令尚未配置");
    const key = clientKey(request);
    const limit = checkOwnerLoginRateLimit(key);
    if (!limit.allowed) throw new ApiError(429, "口令尝试次数过多，请稍后再试");
    if (Number(request.headers.get("content-length")) > 4096) throw new ApiError(413, "请求内容过长");
    const body = await request.json().catch(() => null) as { code?: unknown } | null;
    if (!acceptsOwnerCode(body?.code)) {
      recordOwnerLoginFailure(key);
      throw new ApiError(401, "站主口令不正确");
    }
    clearOwnerLoginFailures(key);

    if (databaseConfigured()) {
      // Imported sites keep their existing owner id so current drafts stay editable.
      await database().prepare(
        "INSERT INTO settings (key,value) VALUES ('owner_id',?) ON CONFLICT(key) DO NOTHING",
      ).bind(defaultOwnerId).run();
    }
    const response = NextResponse.json(isOwner(true), { headers });
    response.cookies.set(ownerCookieName, newOwnerSession(), ownerCookieOptions(request));
    return response;
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json(isOwner(false), { headers });
    response.cookies.set(ownerCookieName, "", { ...ownerCookieOptions(request), maxAge: 0 });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
