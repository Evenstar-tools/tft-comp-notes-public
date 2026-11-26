import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptsOwnerCode,
  checkOwnerLoginRateLimit,
  clearOwnerLoginFailures,
  newOwnerSession,
  ownerLoginConfigured,
  recordOwnerLoginFailure,
  validOwnerSession,
} from "../server/owner-session.ts";

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
