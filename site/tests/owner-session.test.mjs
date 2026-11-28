import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  acceptsOwnerCode,
  checkOwnerLoginRateLimit,
  clearOwnerLoginFailures,
  defaultOwnerId,
  newOwnerSession,
  ownerLoginConfigured,
  ownerCookieName,
  recordOwnerLoginFailure,
  validOwnerSession,
} from "../server/owner-session.ts";
import { database, getDatabaseClient } from "../server/runtime-db.ts";

test("authenticated owner resolves without a database and cloud access returns 503", async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousCode = process.env.OWNER_ACCESS_CODE;
  process.env.OWNER_ACCESS_CODE = "test-code";
  const token = newOwnerSession();
  const headers = "data:text/javascript," + encodeURIComponent(
    `export const cookies = () => new Map([[ "${ownerCookieName}", { value: "${token}" } ]]);`
  );
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "next/headers") return nextResolve(headers, context);
      if (["./runtime-db", "./owner-session"].includes(specifier)) return nextResolve(specifier + ".ts", context);
      return nextResolve(specifier, context);
    },
  });
  try {
    const { apiError, requireDatabase, requireOwner } = await import("../server/access.ts");
    for (const url of [undefined, "  "]) {
      if (url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = url;
      assert.deepEqual(await requireOwner(), { userId: defaultOwnerId, displayName: "站主" });
      assert.throws(requireDatabase, error => {
        assert.equal(apiError(error).status, 503);
        assert.equal(error.message, "云端数据库尚未配置，暂无法读写云端数据");
        return true;
      });
    }
  } finally {
    hooks.deregister();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousCode === undefined) delete process.env.OWNER_ACCESS_CODE;
    else process.env.OWNER_ACCESS_CODE = previousCode;
  }
});

test("owner session accepts 6-character passcodes and rejects shorter codes", () => {
  const prevCode = process.env.OWNER_ACCESS_CODE;
  const prevSecret = process.env.OWNER_SESSION_SECRET;
  try {
    delete process.env.OWNER_SESSION_SECRET;
    process.env.OWNER_ACCESS_CODE = "12345";
    assert.equal(ownerLoginConfigured(), false);
    assert.equal(acceptsOwnerCode("12345"), false);

    process.env.OWNER_ACCESS_CODE = "123456";
    assert.equal(ownerLoginConfigured(), true);
    assert.equal(acceptsOwnerCode("123456"), true);
    assert.equal(acceptsOwnerCode(" 123456 "), true);
    assert.equal(acceptsOwnerCode("654321"), false);

    const token = newOwnerSession(1_700_000_000_000);
    assert.equal(validOwnerSession(token, 1_700_000_001_000), true);
    assert.equal(validOwnerSession(token, 1_700_900_000_000), false);
  } finally {
    if (prevCode === undefined) delete process.env.OWNER_ACCESS_CODE;
    else process.env.OWNER_ACCESS_CODE = prevCode;
    if (prevSecret === undefined) delete process.env.OWNER_SESSION_SECRET;
    else process.env.OWNER_SESSION_SECRET = prevSecret;
  }
});

test("owner login rate limit locks after 5 consecutive failures and clears on success", () => {
  clearOwnerLoginFailures();
  const now = 1_700_000_000_000;
  for (let i = 0; i < 4; i++) {
    recordOwnerLoginFailure("1.2.3.4", now + i * 1000);
    assert.equal(checkOwnerLoginRateLimit("1.2.3.4", now + i * 1000).allowed, true);
  }
  recordOwnerLoginFailure("1.2.3.4", now + 5000);
  const blocked = checkOwnerLoginRateLimit("1.2.3.4", now + 6000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.equal(checkOwnerLoginRateLimit("1.2.3.4", now + 16 * 60 * 1000).allowed, true);

  clearOwnerLoginFailures("1.2.3.4");
  assert.equal(checkOwnerLoginRateLimit("1.2.3.4", now + 6000).allowed, true);
});

test("runtime-db auto-initializes schema on a brand-new database", async () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevToken = process.env.DATABASE_AUTH_TOKEN;
  let client;
  try {
    process.env.DATABASE_URL = "file::memory:";
    delete process.env.DATABASE_AUTH_TOKEN;
    client = await getDatabaseClient();
    const tables = await database()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all();
    assert.deepEqual(tables.results.map(row => row.name), ["owner_content", "settings", "snapshots", "sync_jobs", "teams"]);

    const inserted = await database()
      .prepare("INSERT INTO teams (id,owner_id,body,revision,updated_at) VALUES (?,?,?,?,?)")
      .bind("t-1", "edgeone-owner", JSON.stringify({ id: "t-1", name: "测试", pieces: [] }), 1, "2026-11-26T00:00:00Z")
      .run();
    assert.equal(inserted.meta.changes, 1);
    const saved = await database().prepare("SELECT body,revision FROM teams WHERE id=?").bind("t-1").first();
    assert.equal(saved.revision, 1);
    assert.equal(JSON.parse(saved.body).name, "测试");
  } finally {
    client?.close();
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
    if (prevToken === undefined) delete process.env.DATABASE_AUTH_TOKEN;
    else process.env.DATABASE_AUTH_TOKEN = prevToken;
  }
});
