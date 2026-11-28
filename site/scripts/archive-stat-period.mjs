import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { archiveBatchId, refreshCohort } from "./refresh-cohort.mjs";

const dataDir = new URL("../data/", import.meta.url);
const archiveDir = new URL("../public/stats-history/", import.meta.url);
const manifestFile = new URL("stats-history.json", dataDir);
const lockFile = new URL(".stats-history.lock", dataDir);
const readJson = async file => JSON.parse(await readFile(file, "utf8"));
const shanghai = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function snapshotTime(snapshot, file) {
  const time = Date.parse(snapshot?.updatedAt);
  requireValue(Number.isFinite(time) && /(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot?.updatedAt),
    `${file} 缺少带时区的采样时间`);
  requireValue(snapshot.date === shanghai.format(time), `${file} 的日期与北京时间采样日期不一致`);
  return time;
}

async function stage(file, value) {
  const pending = new URL(file.href + `.${process.pid}.tmp`);
  const previous = await readFile(file).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
  const handle = await open(pending, "wx");
  try {
    try {
      await handle.writeFile(JSON.stringify(value) + "\n", "utf8");
    } finally {
      await handle.close();
    }
  } catch (error) {
    await rm(pending, { force: true });
    throw error;
  }
  return { file, pending, previous };
}

async function archive() {
  const { values: { channel: requestedChannel, patch: requestedPatch } } = parseArgs({ options: {
    channel: { type: "string" }, patch: { type: "string" },
  } });
  const files = ["hero-stats.json", "item-wearers.json", "special-item-wearers.json"];
  const [current, heroes, standard, special] = await Promise.all(["current-patch.json", ...files]
    .map(file => readJson(new URL(file, dataDir))));
  const snapshots = [heroes, standard, special];
  const cohort = refreshCohort(current);
  const { pbe, patch: basePatch, bPatch, version: patch } = cohort;
  const channel = pbe ? "pbe" : "ranked";
  requireValue(requestedChannel === undefined || requestedChannel === channel, "归档队列与本站当前赛季环境不一致");
  requireValue(requestedPatch === undefined || (!pbe && requestedPatch === patch), "归档补丁与当前已核验的正式服补丁不一致");
  const season = cohort.season.toLowerCase();
  const effectiveAt = Date.parse(current.effectiveAt);
  requireValue(Number.isFinite(effectiveAt), "缺少已核验的补丁生效时间");

  if (pbe) requireValue(/^\d+$/.test(current.build ?? ""), "缺少已核验的 PBE 构建号");
  const version = `${cohort.season} ${cohort.label} ${patch}`;

  const days = heroes.days;
  requireValue(Number.isInteger(days) && days > 0, "英雄战绩缺少滚动窗口天数");
  const times = snapshots.map((snapshot, i) => {
    const file = files[i];
    requireValue(snapshot.source === "MetaTFT" && snapshot.version === version,
      `${file} 的数据来源或补丁与 ${version} 不一致`);
    const time = snapshotTime(snapshot, file);
    requireValue(time >= effectiveAt && snapshot.date === heroes.date, `${file} 超出本次补丁或北京时间数据日`);
    const records = i === 0 ? snapshot.rows : snapshot.items;
    requireValue(records && typeof records === "object" && !Array.isArray(records) && Object.keys(records).length,
      `${file} 不含可归档战绩`);
    if (i > 0) requireValue(Number(snapshot.window?.match(/^(?:最近|近)\s*(\d+)\s*天$/)?.[1]) === days,
      `${file} 与英雄战绩的滚动窗口天数不一致`);
    return time;
  });

  const source = new URL(heroes.sourceUrl);
  const sourcePatch = source.searchParams.get("patch");
  const sourceHotfix = source.searchParams.get("b_patch") ?? "";
  requireValue(source.origin === "https://www.metatft.com" && sourcePatch === basePatch && sourceHotfix === bPatch &&
    source.searchParams.get("set") === cohort.set && source.searchParams.get("days") === String(days) &&
    source.searchParams.get("queue") === cohort.apiQueue && source.searchParams.get("rank") === (cohort.rank || null),
  "英雄战绩来源链接未锁定相同的赛季、补丁、队列和时间窗");

  const date = heroes.date;
  const lock = await open(lockFile, "wx");
  const pending = [];
  const installed = [];
  try {
    const history = await readJson(manifestFile);
    requireValue(Array.isArray(history) && new Set(history.map(row => row.id)).size === history.length,
      "历史批次清单有重复键或格式错误");
    const id = archiveBatchId(cohort, date, history);
    const entry = {
      id, channel, season, date,
      label: pbe ? `${date.slice(5).replace("-", "/")} · ${patch}${id.endsWith("-" + cohort.build) ? " · " + cohort.build : ""}` : `正式服 ${patch}`,
      description: `${date} 的${pbe ? "测试服" : "正式服排位"}${patch}快照，近 ${days} 天滚动窗口。`,
      ...(pbe && { build: cohort.build, metaTft: { patch: basePatch, bPatch } }),
    };
    const existing = history.find(row => row.id === id);
    requireValue(!existing || !pbe || String(existing.build) === cohort.build, `${id} 已关联另一实际构建`);

    const directory = new URL(`${id}/`, archiveDir);
    await mkdir(directory, { recursive: true });
    const heroesFile = new URL("heroes.json", directory);
    const equipmentFile = new URL("equipment.json", directory);
    if (existing) {
      const [priorHeroes, priorEquipment] = await Promise.all([readJson(heroesFile), readJson(equipmentFile)]);
      [priorHeroes, priorEquipment.standard, priorEquipment.special].forEach((snapshot, i) => {
        requireValue(times[i] >= snapshotTime(snapshot, files[i]), `${files[i]} 早于已归档的同批次数据`);
      });
    }
    const output = (existing ? history.map(row => row.id === id ? entry : row) : [entry, ...history])
      .sort((a, b) => b.date.localeCompare(a.date));
    pending.push(await stage(heroesFile, heroes));
    pending.push(await stage(equipmentFile, { standard, special }));
    pending.push(await stage(manifestFile, output));
    for (const change of pending) {
      await rename(change.pending, change.file);
      installed.push(change);
    }
    console.log(`已归档 ${id}`);
  } catch (error) {
    const rollback = await Promise.allSettled(installed.map(async ({ file, pending: staged, previous }) => {
      if (!previous) return rm(file, { force: true });
      await writeFile(staged, previous, { flag: "wx" });
      await rename(staged, file);
    }));
    if (rollback.some(result => result.status === "rejected")) {
      throw new Error(`归档失败，部分原文件无法恢复。${error.message}`);
    }
    throw error;
  } finally {
    try {
      await Promise.all(pending.map(({ pending: staged }) => rm(staged, { force: true })));
    } finally {
      await lock.close();
      await rm(lockFile, { force: true });
    }
  }
}

archive().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
