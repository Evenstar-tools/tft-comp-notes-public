import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ownerCookieName = "tft_owner_session";
export const ownerSessionSeconds = 7 * 24 * 60 * 60;
export const defaultOwnerId = "edgeone-owner";
export const minOwnerCodeLength = 6;
const maxFailedAttempts = 5;
const lockoutWindowMs = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

function ownerCode() {
  const code = process.env.OWNER_ACCESS_CODE?.trim();
  return code && code.length >= minOwnerCodeLength && code.length <= 256 ? code : null;
}

function sessionSecret(code: string) {
  const secret = process.env.OWNER_SESSION_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : code;
}

export function ownerLoginConfigured() {
  return ownerCode() !== null;
}

export function checkOwnerLoginRateLimit(key: string, now = Date.now()) {
  const entry = failedAttempts.get(key);
  if (!entry) return { allowed: true, retryAfterSeconds: 0 };
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) failedAttempts.delete(key);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordOwnerLoginFailure(key: string, now = Date.now()) {
  const prev = failedAttempts.get(key);
  const count = prev && prev.lockedUntil <= now ? prev.count + 1 : 1;
  const lockedUntil = count >= maxFailedAttempts ? now + lockoutWindowMs : 0;
  failedAttempts.set(key, { count, lockedUntil });
}

export function clearOwnerLoginFailures(key?: string) {
  if (key === undefined) failedAttempts.clear();
  else failedAttempts.delete(key);
}

function equal(first: string, second: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(first), digest(second));
}

export function acceptsOwnerCode(value: unknown) {
  const code = ownerCode();
  return code !== null && typeof value === "string" && value.length <= 256 && equal(code, value.trim());
}

function signature(payload: string, code: string) {
  return createHmac("sha256", sessionSecret(code)).update("tft-owner-session/v1:").update(payload).digest("base64url");
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
  const { cookies } = await import("next/headers");
  return validOwnerSession((await cookies()).get(ownerCookieName)?.value);
}

export function ownerCookieOptions(request: Request) {
  const origin = new URL(process.env.SITE_ORIGIN || request.url);
  const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  return { httpOnly: true, sameSite: "lax" as const, secure: !localHttp, path: "/", maxAge: ownerSessionSeconds };
}
