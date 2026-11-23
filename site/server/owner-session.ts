import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ownerCookieName = "tft_owner_session";
export const ownerSessionSeconds = 7 * 24 * 60 * 60;
export const defaultOwnerId = "edgeone-owner";

function ownerCode() {
  const code = process.env.OWNER_ACCESS_CODE;
  return code && code.length >= 16 && code.length <= 256 ? code : null;
}

export function ownerLoginConfigured() {
  return ownerCode() !== null;
}

function equal(first: string, second: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(first), digest(second));
}

export function acceptsOwnerCode(value: unknown) {
  const code = ownerCode();
  return code !== null && typeof value === "string" && value.length <= 256 && equal(code, value);
}

function signature(payload: string, code: string) {
  return createHmac("sha256", code).update("tft-owner-session/v1:").update(payload).digest("base64url");
}

export function newOwnerSession(now = Date.now()) {
  const code = ownerCode();
  if (!code) throw new Error("站主口令尚未配置");
  const bound = Math.floor(now / 1000) + ownerSessionSeconds;
  const payload = `v1.${bound}.${randomBytes(18).toString("base64url")}`;
  return `${payload}.${signature(payload, code)}`;
}

export function validOwnerSession(value: string | undefined, now = Date.now()) {
  const code = ownerCode();
  const parts = value && /^v1\.(\d{10,12})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!code || !parts) return false;
  const [, expires, nonce, received] = parts;
  const remaining = Number(expires) - Math.floor(now / 1000);
  return remaining > 0 && remaining <= ownerSessionSeconds &&
    equal(signature(`v1.${expires}.${nonce}`, code), received);
}

export async function hasOwnerSession() {
  return validOwnerSession((await cookies()).get(ownerCookieName)?.value);
}

export function ownerCookieOptions(request: Request) {
  const origin = new URL(process.env.SITE_ORIGIN || request.url);
  const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  return { httpOnly: true, sameSite: "lax" as const, secure: !localHttp, path: "/", maxAge: ownerSessionSeconds };
}
