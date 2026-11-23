import { NextResponse } from "next/server";
import { apiError, assertSameOrigin, database, ApiError } from "@/server/access";
import {
  acceptsOwnerCode, defaultOwnerId, hasOwnerSession, newOwnerSession, ownerCookieName,
  ownerCookieOptions, ownerLoginConfigured,
} from "@/server/owner-session";

const headers = { "Cache-Control": "no-store" };

function isOwner(signedIn: boolean) {
  return { signedIn, isOwner: signedIn, loginConfigured: ownerLoginConfigured() };
}

export async function GET() {
  return NextResponse.json(isOwner(await hasOwnerSession()), { headers });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!ownerLoginConfigured()) throw new ApiError(503, "站主口令尚未配置");
    if (Number(request.headers.get("content-length")) > 4096) throw new ApiError(413, "请求内容过长");
    const body = await request.json().catch(() => null) as { code?: unknown } | null;
    if (!acceptsOwnerCode(body?.code)) throw new ApiError(401, "站主口令不正确");

    // Imported sites keep their existing owner id so current drafts stay editable.
    await database().prepare(
      "INSERT INTO settings (key,value) VALUES ('owner_id',?) ON CONFLICT(key) DO NOTHING",
    ).bind(defaultOwnerId).run();
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
