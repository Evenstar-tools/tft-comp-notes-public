import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const syncScript = path.join(siteRoot, "scripts", "sync-to-public.py");
const verifyScript = path.join(siteRoot, "scripts", "verify-public-release.py");

function runPython(args) {
  const candidates = process.platform === "win32"
    ? [["py", ["-3", "-X", "utf8", ...args]], ["python", ["-X", "utf8", ...args]], ["python3", ["-X", "utf8", ...args]]]
    : [["python3", ["-X", "utf8", ...args]], ["python", ["-X", "utf8", ...args]]];
  let lastError;
  for (const [cmd, cmdArgs] of candidates) {
    try {
      return execFileSync(cmd, cmdArgs, { cwd: siteRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      if (error?.code === "ENOENT") { lastError = error; continue; }
      throw error;
    }
  }
  throw lastError;
}

test("verify-public-release gate passes on the current public checkout", () => {
  const out = runPython([verifyScript]);
  const summary = JSON.parse(out);
  assert.equal(summary.ok, true);
  assert.equal(summary.missingAssets, 0);
  assert.deepEqual(summary.errors, []);
});

test("sync-to-public protects platform adapters, remaps IDs bidirectionally, and fails closed on leaks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tft-sync-test-"));
  try {
    const gptDir = path.join(tmp, "gpt");
    const pubDir = path.join(tmp, "pub");
    const aliasPath = path.join(tmp, "aliases.json");

    fs.mkdirSync(path.join(gptDir, "domain"), { recursive: true });
    fs.mkdirSync(path.join(gptDir, "server"), { recursive: true });
    fs.mkdirSync(path.join(pubDir, "domain"), { recursive: true });
    fs.mkdirSync(path.join(pubDir, "server"), { recursive: true });

    const privBlock = "doxcnAbCdEfGhIjKlMn123";
    const privTeam = "11111111-2222-4333-8444-555555555555";
    const pubBlock = "sample-block-0051";
    const pubTeam = "00000000-0000-4000-8000-000000000059";

    fs.writeFileSync(aliasPath, JSON.stringify({
      blocks: { [privBlock]: pubBlock },
      teams: { [privTeam]: pubTeam },
    }), "utf8");

    // Shared domain file in GPTsite uses private IDs + CRLF; platform adapter differs.
    fs.writeFileSync(
      path.join(gptDir, "domain", "guide-identities.ts"),
      `export const ID = "${privBlock}";\r\nexport const TEAM = "${privTeam}";\r\n`,
      "utf8",
    );
    fs.writeFileSync(path.join(gptDir, "server", "access.ts"), "// gptsite d1 access\n", "utf8");
    fs.writeFileSync(path.join(pubDir, "server", "access.ts"), "// edgeone libsql access\n", "utf8");

    // 1. Forward sync: gpt-to-public
    const fwdOut = runPython([
      syncScript, "--source", gptDir, "--target", pubDir,
      "--direction", "gpt-to-public", "--aliases", aliasPath,
    ]);
    const fwd = JSON.parse(fwdOut);
    assert.deepEqual(fwd.added, ["domain/guide-identities.ts"]);
    assert.equal(
      fs.readFileSync(path.join(pubDir, "domain", "guide-identities.ts"), "utf8"),
      `export const ID = "${pubBlock}";\nexport const TEAM = "${pubTeam}";\n`,
    );
    // Platform adapter in public checkout must remain untouched.
    assert.equal(fs.readFileSync(path.join(pubDir, "server", "access.ts"), "utf8"), "// edgeone libsql access\n");

    // 2. Reverse sync: public-to-gpt restores private IDs and still protects GPTsite adapter
    fs.writeFileSync(
      path.join(pubDir, "domain", "guide-identities.ts"),
      `export const ID = "${pubBlock}";\nexport const TEAM = "${pubTeam}";\nexport const EXTRA = 1;\n`,
      "utf8",
    );
    const revOut = runPython([
      syncScript, "--source", pubDir, "--target", gptDir,
      "--direction", "public-to-gpt", "--aliases", aliasPath,
    ]);
    const rev = JSON.parse(revOut);
    assert.deepEqual(rev.updated, ["domain/guide-identities.ts"]);
    assert.equal(
      fs.readFileSync(path.join(gptDir, "domain", "guide-identities.ts"), "utf8"),
      `export const ID = "${privBlock}";\nexport const TEAM = "${privTeam}";\nexport const EXTRA = 1;\n`,
    );
    assert.equal(fs.readFileSync(path.join(gptDir, "server", "access.ts"), "utf8"), "// gptsite d1 access\n");

    // 3. Fail-closed leak detection in gpt-to-public mode
    fs.writeFileSync(
      path.join(gptDir, "domain", "leaked.ts"),
      'export const url = "https://example.feishu.cn/docx/secret";\n',
      "utf8",
    );
    assert.throws(() => runPython([
      syncScript, "--source", gptDir, "--target", pubDir,
      "--direction", "gpt-to-public", "--aliases", aliasPath,
    ]));
    assert.equal(fs.existsSync(path.join(pubDir, "domain", "leaked.ts")), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
