import { spawnSync } from "node:child_process";
import { mkdtempSync, rmdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { automaticRefreshModules } from "./run-data-refresh.mjs";

const site = fileURLToPath(new URL("../", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const defaultProfile = new Date().getUTCHours() < 12 ? "daily" : "fast";

function run(command, args, { cwd = site, allowSkip = false } = {}) {
  // npm.cmd needs cmd.exe on Windows. Its arguments below are fixed literals.
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" && command === npm,
  });
  if (result.error) throw result.error;
  if (allowSkip && result.status === 2) return false;
  if (result.status !== 0) throw new Error(command + " 执行失败（退出状态 " + result.status + "）");
  return true;
}

function requireCleanCheckout() {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: repo,
    encoding: "utf8",
  });
  if (result.status !== 0 || result.stdout.trim()) {
    throw new Error("自动更新需要干净的独立检出，已停止");
  }
}

function main() {
  const { values } = parseArgs({ options: {
    profile: { type: "string", default: defaultProfile },
    "dry-run": { type: "boolean" },
    archive: { type: "boolean" },
  } });
  const { profile } = values;
  const archive = values.archive || profile === "daily";
  automaticRefreshModules(profile, { archive });
  if (!values["dry-run"]) requireCleanCheckout();

  const tempDir = mkdtempSync(join(tmpdir(), "tft-refresh-"));
  const reportPath = join(tempDir, "upstream.json");
  const receipt = join(tempDir, "collected.json");
  const upstreamIsAligned = () => {
    run(process.execPath, ["scripts/check-refresh-alerts.mjs", "--check-upstream", "--dot", "--json-out", reportPath]);
    return run(process.execPath, ["scripts/check-auto-refresh.mjs", "preflight", "--report", reportPath], { allowSkip: true });
  };
  try {
    const aligned = upstreamIsAligned();
    const refresh = ["scripts/run-data-refresh.mjs", "--profile", profile, ...(archive ? ["--archive"] : [])];
    if (values["dry-run"]) {
      run(process.execPath, [...refresh, "--dry-run"]);
      console.log(aligned ? "结果：采集计划预览完成" : "结果：采集计划预览完成，上游条件待核，本轮未采集");
      return;
    }
    if (!aligned) {
      console.log("结果：上游条件待核，本轮未采集");
      return;
    }

    run(npm, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
    run(process.execPath, ["scripts/export-family-catalog.mjs"]);
    run(process.execPath, [...refresh, "--receipt", receipt]);
    if (!run(process.execPath, ["scripts/check-auto-refresh.mjs", "verify", "--profile", profile, "--receipt", receipt], { allowSkip: true })) {
      console.log("结果：所选模块已采集和核验，本轮快照未变化");
      return;
    }
    run(npm, ["run", "verify:public"]);
    run(npm, ["run", "data:verify"]);
    if (!upstreamIsAligned()) {
      console.log("结果：已完成采集，上游条件变化，本轮保留生产批次");
      return;
    }
    run(process.execPath, ["scripts/publish-auto-refresh.mjs", "--profile", profile, "--receipt", receipt]);
  } finally {
    rmSync(reportPath, { force: true });
    rmSync(receipt, { force: true });
    rmdirSync(tempDir);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
