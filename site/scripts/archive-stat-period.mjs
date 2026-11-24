import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const dataDir = new URL("../data/", import.meta.url);
const archiveDir = new URL("../public/stats-history/", import.meta.url);
const manifestFile = new URL("stats-history.json", dataDir);
const lockFile = new URL(".stats-history.lock", dataDir);
const readJson = async file => JSON.parse(await readFile(file, "utf8"));
const shanghai = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });
const patchFormat = /^\d+\.\d+[a-z]?$/;

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
  const { values: { channel = "pbe", patch: requestedPatch } } = parseArgs({ options: {
    channel: { type: "string" }, patch: { type: "string" },
  } });
  requireValue(channel === "pbe" || channel === "ranked", "--channel 仅接受 pbe 或 ranked");
  requireValue(channel === "ranked" || requestedPatch === undefined, "PBE 补丁由 current-patch.json 的已核验映射确定");

  const files = ["hero-stats.json", "item-wearers.json", "special-item-wearers.json"];
  const [current, heroes, standard, special] = await Promise.all(["current-patch.json", ...files]
    .map(file => readJson(new URL(file, dataDir))));
  const snapshots = [heroes, standard, special];
  const seasonMatch = current.seasonId?.match(/^(s\d+)-(pbe|live)(?:-|$)/);
  requireValue(seasonMatch && seasonMatch[2] === (channel === "pbe" ? "pbe" : "live"), "采样队列与本站当前赛季环境不一致");
  const season = seasonMatch[1];
  const effectiveAt = Date.parse(current.effectiveAt);
  requireValue(Number.isFinite(effectiveAt), "缺少已核验的补丁生效时间");

  const metaTft = current.metaTftPatch;
  const mappedPatch = metaTft?.patch && metaTft.patch + (metaTft.bPatch ?? "");
  if (channel === "pbe") {
    requireValue(/^\d+\.\d+$/.test(metaTft?.patch) && /^[a-z]?$/.test(metaTft?.bPatch) && /^\d+$/.test(current.build),
      "缺少已核验的 PBE 基础补丁、热补映射或实际构建号");
  } else {
    const livePatch = mappedPatch || current.label?.match(/\b(\d+\.\d+[a-z]?)\b/i)?.[1];
    requireValue(patchFormat.test(requestedPatch) && requestedPatch === livePatch,
      "--patch 必须明确指定当前已核验的正式服补丁，例如 --patch 19.1");
  }
  const patch = channel === "pbe" ? mappedPatch : requestedPatch;
  const version = `${season.toUpperCase()} ${channel === "pbe" ? "PBE" : "Ranked"} ${patch}`;

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
  const sourceVersion = channel === "pbe" ? sourcePatch === metaTft.patch && sourceHotfix === metaTft.bPatch
    : sourcePatch + sourceHotfix === patch;
  requireValue(source.origin === "https://www.metatft.com" && sourceVersion &&
    source.searchParams.get("set") === `TFTSet${season.slice(1)}` && source.searchParams.get("days") === String(days) &&
    source.searchParams.get("queue") === (channel === "pbe" ? "PBE" : "1100"),
  "英雄战绩来源链接未锁定相同的赛季、补丁、队列和时间窗");

  const date = heroes.date;
  const id = channel === "pbe" ? `pbe-${season}-${date}-${patch}` : `ranked-${season}-${patch}`;
  const entry = {
    id, channel, season, date,
    label: channel === "pbe" ? `${date.slice(5).replace("-", "/")} · ${patch}` : `正式服 ${patch}`,
    description: `${date} 的${channel === "pbe" ? "测试服" : "正式服排位"}${patch}快照，近 ${days} 天滚动窗口。`,
    ...(channel === "pbe" && { build: String(current.build), metaTft: { patch: metaTft.patch, bPatch: metaTft.bPatch } }),
  };

  const lock = await open(lockFile, "wx");
  const pending = [];
  const installed = [];
  try {
    const history = await readJson(manifestFile);
    requireValue(Array.isArray(history) && new Set(history.map(row => row.id)).size === history.length,
      "历史批次清单有重复键或格式错误");
    const existing = history.find(row => row.id === id);
    const previousBuild = existing?.build;
    requireValue(!previousBuild || channel !== "pbe" || previousBuild === entry.build, `${id} 已关联另一实际构建`);

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
    const output = [entry, ...history.filter(row => row.id !== id)].sort((a, b) => b.date.localeCompare(a.date));
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
