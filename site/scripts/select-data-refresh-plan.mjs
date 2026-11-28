import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refreshCohort } from "./refresh-cohort.mjs";

const hour = 60 * 60 * 1000;
const launchCron = "37 * * * *";
const regularSchedules = new Map([
  ...[1, 7, 13, 19].map(at => [`17 ${at} * * *`, "fast"]),
  ["53 2 * * *", "daily"],
]);

export function selectDataRefreshPlan({ event, schedule, dispatchProfile, current, family, now = Date.now() }) {
  if (event === "workflow_dispatch") {
    if (!["fast", "daily", "all"].includes(dispatchProfile)) throw new Error("未知采集配置");
    return { profile: dispatchProfile };
  }
  const regular = regularSchedules.get(schedule);
  if (event !== "schedule" || (!regular && schedule !== launchCron)) throw new Error("未知定时任务入口");
  const effective = Date.parse(current.effectiveAt);
  const hoursSinceLaunch = (now - effective) / hour;
  if (current.launchTransition !== true || !(hoursSinceLaunch >= 0 && hoursSinceLaunch < 16)) {
    return regular ? { profile: regular } : {};
  }
  const cohort = refreshCohort(current);
  if (cohort.pbe || cohort.bPatch) return regular ? { profile: regular } : {};
  if (hoursSinceLaunch < 4) return {};
  const offset = hoursSinceLaunch < 8 ? 4 : hoursSinceLaunch < 12 ? 8 : 12;
  if (family.sampleStatus === "pending" || !cohort.queueMatches(family.queue) || family.set !== cohort.set ||
      !Number.isSafeInteger(family.model)) {
    return { reason: `+${offset}h 等待人工验收首批正式服体系与模型基线` };
  }
  return {
    profile: offset === 12 ? "daily" : "fast",
    launchKey: `${current.seasonId}/${cohort.version}/${cohort.build}/${new Date(effective).toISOString()}/+${offset}h`,
    windowStart: effective + offset * hour,
  };
}

const completionName = key => `Verified launch data ${key}`;

export async function completedLaunchWindow(plan, { repository, token, fetcher = fetch }) {
  if (!plan.launchKey) return false;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) throw new Error("缺少读取 GitHub Actions 的权限");
  const endpoint = `https://api.github.com/repos/${repository}/actions`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` };
  async function read(url) {
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`读取 GitHub Actions 记录失败（${response.status}）`);
    return response.json();
  }
  const runs = await read(`${endpoint}/workflows/data-refresh.yml/runs?event=schedule&branch=main&status=completed&per_page=40`);
  for (const run of runs.workflow_runs) {
    if (Date.parse(run.updated_at) < plan.windowStart) continue;
    const jobs = await read(`${endpoint}/runs/${run.id}/jobs?filter=all&per_page=100`);
    if (jobs.jobs.some(job => job.steps?.some(step => step.name === completionName(plan.launchKey) &&
        step.conclusion === "success" && Date.parse(step.completed_at) >= plan.windowStart))) return true;
  }
  return false;
}

async function main() {
  const read = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
  const { GITHUB_EVENT_NAME, SCHEDULE, DISPATCH_PROFILE, GITHUB_REPOSITORY, LAUNCH_READ_TOKEN, GITHUB_OUTPUT } = process.env;
  const plan = selectDataRefreshPlan({ event: GITHUB_EVENT_NAME, schedule: SCHEDULE, dispatchProfile: DISPATCH_PROFILE,
    current: read("current-patch"), family: read("guide-family-stats") });
  if (plan.reason) console.log(plan.reason);
  if (!plan.profile) return;
  if (await completedLaunchWindow(plan, { repository: GITHUB_REPOSITORY, token: LAUNCH_READ_TOKEN })) {
    console.log(`本次开服窗口已完成采集与验收 ${plan.launchKey}`);
    return;
  }
  appendFileSync(GITHUB_OUTPUT, `profile=${plan.profile}\n` +
    (plan.launchKey ? `launch_marker=${completionName(plan.launchKey)}\n` : ""), "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
