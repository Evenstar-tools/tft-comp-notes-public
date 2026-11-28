import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyRefreshChanges } from "./check-auto-refresh.mjs";
import { automaticRefreshModules } from "./run-data-refresh.mjs";

const site = fileURLToPath(new URL("../", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const defaultProfile = new Date().getUTCHours() < 12 ? "daily" : "fast";
const readData = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));

async function readPublicJson(path, fetcher) {
  const response = await fetcher(new URL(path, "https://tftnotes.com"), { signal: AbortSignal.timeout(8000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function publishedBoardQueries(current, fetcher = fetch) {
  try {
    const plan = await readPublicJson("/api/guides/board-query", fetcher);
    if (!plan) return null;
    if (!Array.isArray(plan.boards)) throw new Error("线上查询计划格式不符");
    if (plan.seasonId !== current.seasonId || plan.build !== current.build) {
      console.warn("线上棋盘的构建与本轮不同，等待版本对齐后重查");
      return null;
    }
    for (const row of plan.review ?? []) console.warn("棋盘有特殊限制，列入数据复核：" + row.sectionId + "/" + row.teamId);
    return plan.boards.length ? plan : null;
  } catch (error) {
    console.warn("本轮未能读取线上棋盘重查计划：" + error.message);
    return null;
  }
}

export async function publishedBoardCatalog(seasonId, build, fetcher = fetch) {
  try {
    const catalog = await readPublicJson("/api/guides/catalog", fetcher);
    if (catalog?.seasonId === seasonId && catalog.build === build &&
        Array.isArray(catalog.boards) && catalog.boards.some(board => board.edition === seasonId)) return catalog;
    console.warn("线上攻略目录与采集赛季或构建不符，沿用仓库目录");
  } catch (error) {
    console.warn("线上攻略目录读取失败，沿用仓库目录：" + error.message);
  }
  return null;
}

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

export function writeReviewCandidate({ profile, receipt, output, changes, cwd = repo }) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const directory = resolve(output);
  mkdirSync(directory, { recursive: true });
  if (readdirSync(directory).length) throw new Error("候选输出目录需要为空");
  const base = git("rev-parse", "HEAD").trim();
  git("add", "--", ...changes.map(({ path }) => path));
  git("diff", "--cached", "--check");
  const staged = git("diff", "--cached", "--name-status", "--no-renames", "-z").split("\0");
  staged.pop();
  if (staged.length !== 2 * changes.length || changes.some(({ path, change }) => {
    const index = staged.indexOf(path);
    return index % 2 !== 1 || staged[index - 1] !== change;
  })) throw new Error("暂存文件与采集回执核准的改动不符");

  git("diff", "--cached", "--no-ext-diff", "--no-textconv", "--no-renames", "--full-index", "--binary",
    "--output=" + join(directory, "candidate.patch"));
  writeFileSync(join(directory, "candidate.json"),
    JSON.stringify({ base, profile, collectedAt: new Date().toISOString(), changes }, null, 2) + "\n", "utf8");
  copyFileSync(receipt, join(directory, "receipt.json"));
  console.log("已生成本地验收候选：" + directory);
}

async function main() {
  const { values } = parseArgs({ options: {
    profile: { type: "string", default: defaultProfile },
    "dry-run": { type: "boolean" },
    archive: { type: "boolean" },
    output: { type: "string" },
  } });
  const { profile } = values;
  const archive = values.archive || profile === "daily";
  automaticRefreshModules(profile, { archive });
  if (!values["dry-run"]) requireCleanCheckout();

  const tempDir = mkdtempSync(join(tmpdir(), "tft-refresh-"));
  const reportPath = join(tempDir, "upstream.json");
  const receipt = join(tempDir, "collected.json");
  const boardQueryPath = join(tempDir, "board-queries.json");
  const catalogPath = join(tempDir, "catalog.json");
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
    const current = readData("current-patch");
    const [boardQueries, catalog] = await Promise.all([
      publishedBoardQueries(current),
      publishedBoardCatalog(readData("season").id, current.build),
    ]);
    if (boardQueries) {
      writeFileSync(boardQueryPath, JSON.stringify(boardQueries), "utf8");
      refresh.push("--board-queries", boardQueryPath);
    }
    if (catalog) {
      writeFileSync(catalogPath, JSON.stringify(catalog), "utf8");
      refresh.push("--catalog", catalogPath);
    } else {
      run(process.execPath, ["scripts/export-family-catalog.mjs"]);
    }
    run(process.execPath, [...refresh, "--receipt", receipt]);
    const changes = verifyRefreshChanges(profile, receipt);
    if (!changes.length) {
      console.log("结果：所选模块已采集和核验，本轮快照未变化");
      return "unchanged";
    }
    run(npm, ["run", "verify:public"]);
    run(npm, ["run", "data:verify"]);
    if (!upstreamIsAligned()) {
      console.log("结果：已完成采集，上游条件变化，本轮保留生产批次");
      return;
    }
    if (boardQueries) {
      const latest = await publishedBoardQueries(current);
      const signatures = new Map(latest?.boards.map(board => [board.teamId, board.signature]));
      if (boardQueries.boards.some(board => signatures.get(board.teamId) !== board.signature)) {
        console.log("结果：采集期间线上原盘已变化，本轮保留生产批次");
        return;
      }
    }
    const output = values.output ?? join(site, "outputs", "data-review", new Date().toISOString().replace(/[:.]/g, "-"));
    writeReviewCandidate({ profile, receipt, output, changes });
    return "candidate";
  } finally {
    rmSync(reportPath, { force: true });
    rmSync(receipt, { force: true });
    rmSync(boardQueryPath, { force: true });
    rmSync(catalogPath, { force: true });
    rmdirSync(tempDir);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(result => {
    if (result && process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `collected=true\ncandidate=${result === "candidate"}\n`, "utf8");
    }
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
