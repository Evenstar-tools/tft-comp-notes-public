import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { preflightReason, readPublishedFamily, verifyRefreshChanges } from "./check-auto-refresh.mjs";
import { checkUpstream } from "./check-refresh-alerts.mjs";
import { automaticRefreshModules } from "./run-data-refresh.mjs";

const repository = "Evenstar-tools/tft-comp-notes-public";
const remoteHome = `https://github.com/${repository}`;
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const ciPath = "checks.yml";
const requiredCheck = "domain-tests";
const prFields = [
  "state", "isCrossRepository", "isDraft", "headRefName", "headRefOid", "baseRefName",
  "mergeStateStatus", "statusCheckRollup", "mergedAt", "mergeCommit",
].join(",");

function invoke(command, args, timeout = 45_000) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", GH_DEBUG: "" },
    timeout,
  });
}

function run(command, args) {
  const result = invoke(command, args);
  if (result.status !== 0) {
    const code = result.error?.code ?? result.signal ?? result.status;
    throw new Error(`${command} ${args.slice(0, 2).join(" ")} 执行失败（${code}）`);
  }
  return result.stdout;
}

const git = (...args) => run("git", args);
const gh = (...args) => run("gh", [...args, "--repo", `github.com/${repository}`]);
const pullRequest = url => JSON.parse(gh("pr", "view", url, "--json", prFields));

function verifyRemote() {
  const allowed = new Set([`${remoteHome}.git`, remoteHome, `git@github.com:${repository}.git`]);
  const fetchUrls = git("remote", "get-url", "--all", "origin").trim().split(/\r?\n/);
  const pushUrls = git("remote", "get-url", "--push", "--all", "origin").trim().split(/\r?\n/);
  if (fetchUrls.length !== 1 || pushUrls.length !== 1 ||
      ![...fetchUrls, ...pushUrls].every(url => allowed.has(url))) {
    throw new Error("当前检出的 origin 与允许自动发布的公开仓库不符");
  }
}

function requireCurrentMain(base) {
  const [main] = git("ls-remote", "--exit-code", "origin", "refs/heads/main").trim().split(/\s+/);
  if (main !== base) throw new Error("公开 main 已变化，请用新基线重新采集和校验");
}

function validatedPaths(profile, receipt) {
  return verifyRefreshChanges(profile, receipt);
}

function assertCandidate(pull, branch, head) {
  if (pull.state !== "OPEN" || pull.isCrossRepository || pull.isDraft ||
      pull.baseRefName !== "main" || pull.headRefName !== branch || pull.headRefOid !== head) {
    throw new Error("候选 PR 状态或提交已变化，停止自动合并");
  }
}

export function hasSuccessfulRequiredCheck(pull, run, head) {
  if (pull.headRefOid !== head || run?.headSha !== head || run.event !== "pull_request" ||
      run.status !== "completed" || run.conclusion !== "success" || !run.url) return false;
  return pull.statusCheckRollup?.some(check => check.name === requiredCheck &&
    check.status === "COMPLETED" && check.conclusion === "SUCCESS" &&
    check.detailsUrl?.startsWith(`${run.url}/job/`)) ?? false;
}

async function waitForChecks(url, branch, head) {
  const deadline = Date.now() + 12 * 60 * 1000;
  do {
    const pull = pullRequest(url);
    assertCandidate(pull, branch, head);
    const runs = JSON.parse(gh("run", "list", "--workflow", ciPath, "--event", "pull_request",
      "--branch", branch, "--commit", head, "--limit", "5",
      "--json", "headSha,headBranch,event,status,conclusion,url"));
    const ci = runs.find(run => run.headSha === head && run.headBranch === branch &&
      run.event === "pull_request");
    if (ci?.status === "completed" && ci.conclusion !== "success") {
      throw new Error(`候选 PR 检查未通过。 ${ci.url}`);
    }
    if (hasSuccessfulRequiredCheck(pull, ci, head) && pull.mergeStateStatus === "CLEAN") return;
    await delay(10_000);
  } while (Date.now() < deadline);
  throw new Error("候选 PR 未在等待时间内获得所需检查和合并状态");
}

async function confirmMerge(url, head) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const pull = pullRequest(url);
    if (pull.state === "MERGED" && pull.headRefOid === head && pull.baseRefName === "main" &&
        pull.mergedAt && pull.mergeCommit?.oid) return pull.mergeCommit.oid;
    await delay(1500);
  }
  throw new Error("GitHub 尚未读回这笔合并");
}

async function waitForProduction(merge) {
  const verifier = fileURLToPath(new URL("./verify-live-guides.mjs", import.meta.url));
  const deadline = Date.now() + 7 * 60 * 1000;
  let result;
  do {
    result = invoke(process.execPath, [verifier, "--data-at", "candidate"], 35_000);
    if (result.status === 0) {
      process.stdout.write(result.stdout);
      return;
    }
    const [main] = git("ls-remote", "--exit-code", "origin", "refs/heads/main").trim().split(/\s+/);
    if (main !== merge) throw new Error("本批已合并，公开 main 已切到更新的提交，按新提交继续生产读回");
    await delay(15_000);
  } while (Date.now() < deadline);
  if (result?.stdout) process.stdout.write(result.stdout);
  if (result?.stderr) process.stderr.write(result.stderr);
  throw new Error("本批已合并，EdgeOne 正式域名在等待时间内未读回本批目录和数据时间");
}

async function main() {
  const { values: { profile, receipt } } = parseArgs({ options: {
    profile: { type: "string" }, receipt: { type: "string" },
  } });
  automaticRefreshModules(profile);
  if (!receipt) throw new Error("自动发布须提供本次采集回执 --receipt");
  const changes = validatedPaths(profile, receipt);
  if (!changes.length) return;
  verifyRemote();
  const base = git("rev-parse", "HEAD").trim();
  requireCurrentMain(base);

  const branch = `automation/data-refresh-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const timestamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format();
  const title = `chore(data): 刷新 ${profile} 战绩（${timestamp}）`;
  git("switch", "--create", branch);
  git("add", "--", ...changes.map(({ path }) => path));
  git("diff", "--cached", "--check");
  git("commit", "-m", title);
  const head = git("rev-parse", "HEAD").trim();
  const committed = git("diff", "--name-status", "--no-renames", "-z", base, head).split("\0");
  committed.pop();
  if (committed.length !== 2 * changes.length || changes.some(({ path, change }) => {
    const index = committed.indexOf(path);
    return index % 2 !== 1 || committed[index - 1] !== change;
  })) {
    throw new Error("提交包含未经校验的路径或变更类型，已停止推送");
  }
  git("push", "origin", `HEAD:refs/heads/${branch}`);
  console.log(`已推送候选分支 ${remoteHome}/tree/${branch}`);

  const url = gh("pr", "create", "--base", "main", "--head", branch, "--title", title,
    "--body", "本批仅更新已校验的战绩数据。候选提交通过现有 PR 检查后自动合并。").trim();
  if (!url.startsWith(`${remoteHome}/pull/`) || !/^\d+$/.test(url.slice(`${remoteHome}/pull/`.length))) {
    throw new Error("创建 PR 后未读到公开仓库的有效入口");
  }
  console.log(`已创建候选 PR ${url}`);
  await waitForChecks(url, branch, head);
  const current = JSON.parse(await readFile(new URL("../data/current-patch.json", import.meta.url), "utf8"));
  const publishedFamily = readPublishedFamily(base);
  const reason = preflightReason(current, publishedFamily, { upstream: await checkUpstream(current, publishedFamily) });
  if (reason) throw new Error(`候选 PR 已保留，合并前来源条件变化。 ${reason}`);
  requireCurrentMain(base);
  gh("pr", "merge", url, "--squash", "--match-head-commit", head);
  const merge = await confirmMerge(url, head);
  console.log(`已合并到公开 main ${merge} · ${url}，等待正式域名读回`);
  await waitForProduction(merge);
  console.log(`EdgeOne 正式域名已读回本批数据 · ${url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
