import { spawnSync } from "node:child_process";
import { open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = new URL("../", import.meta.url);
const cwd = fileURLToPath(root);
const archiveModules = ["hero-stats", "item-wearers", "special-item-wearers"];
const defaultCatalog = "outputs/family-review/catalog.json";
const scripts = {
  "hero-stats": "prepare-hero-stats.mjs",
  "item-wearers": "prepare-ordinary-item-stats.mjs",
  "special-item-wearers": "prepare-special-item-stats.mjs",
  "emblem-stats": "prepare-emblem-stats.mjs",
  "guide-placement": "refresh-guide-distributions.py",
  "trait-stats": "refresh-trait-stats.py",
  "guide-family-stats": "refresh-guide-families.mjs",
  "guide-carry-stats": "refresh-guide-carries.py",
  "comp-trends": "refresh-comp-trends.mjs",
  "patch-recommendations": null,
  "patch-recommendation-stats": null,
};
const guides = ["guide-placement", "guide-family-stats", "guide-carry-stats",
  "comp-trends", "patch-recommendations", "patch-recommendation-stats"];
const profiles = {
  fast: ["guide-family-stats", "comp-trends"],
  daily: [...archiveModules, ...guides, "trait-stats"],
  catalog: [...archiveModules, "emblem-stats", "trait-stats"],
  guides,
  all: Object.keys(scripts),
};

function findPython() {
  const candidates = process.platform === "win32"
    ? [["py", "-3"], ["python"], ["python3"]]
    : [["python3"], ["python"]];
  for (const [command, ...flags] of candidates) {
    const prefix = [...flags, "-X", "utf8", "-B"];
    const probe = spawnSync(command, [...prefix, "-c", "import sys; sys.exit(sys.version_info.major != 3)"],
      { cwd, stdio: "ignore", timeout: 5000 });
    if (probe.status === 0) return { command, prefix };
  }
  throw new Error("找不到 Python 3（Windows 优先 py -3，其他平台优先 python3）");
}

function commandFor(script, args, python) {
  const isPython = script.endsWith(".py");
  return {
    bin: isPython ? python.command : process.execPath,
    display: isPython ? python.command : "node",
    args: [...(isPython ? python.prefix : []), `scripts/${script}`, ...args],
  };
}

function commandLine({ display, args }) {
  return `${display} ${args.map(arg => /^[\w./=:-]+$/.test(arg) ? arg : JSON.stringify(arg)).join(" ")}`;
}

function run(command, capture = false) {
  const result = spawnSync(command.bin, command.args, {
    cwd, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (!capture && result.status !== 0) {
    throw new Error(`${commandLine(command)} 执行失败（${result.status ?? result.signal}）`);
  }
  return result;
}

function status(verify, json) {
  const result = run(verify, true);
  if (!result.stdout) throw new Error("数据门禁没有返回状态摘要");
  const summary = JSON.parse(result.stdout);
  const modules = summary.modules.map(module => ({
    ...module, script: scripts[module.id] ? `scripts/${scripts[module.id]}` : null,
  }));
  if (json) {
    console.log(JSON.stringify({ ...summary, modules }, null, 2));
  } else {
    const { label, build } = summary.currentPatch;
    const states = { aligned: "已对齐", lagging: "独立批次", error: "错误", unchecked: "待核对" };
    console.log(`当前 ${label} / 构建 ${build}`);
    console.table(modules.map(row => ({
      模块: row.id, 文件: row.file, 刷新脚本: row.script ?? "人工维护",
      补丁: row.patch ?? "—", 构建: row.build ?? "—",
      "更新时间（UTC+8）": row.updatedAtUtc8 ?? (row.sampledAt ? `${row.sampledAt}（仅日期）` : "—"),
      记录数: row.records, 对齐: states[row.alignment],
    })));
    for (const warning of summary.warnings) console.warn(`警告 · ${warning}`);
    for (const error of summary.errors) console.error(`错误 · ${error}`);
  }
  process.exitCode = result.status ?? 1;
}

function planFor(options, verify, python) {
  const { profile, module: modules = [], archive, channel, patch, catalog } = options;
  if (profile && !Object.hasOwn(profiles, profile)) throw new Error(`未知维护配置 ${profile}`);
  if (profile && modules.length) throw new Error("--profile 与 --module 请选一种");
  if (!profile && !modules.length && !archive) throw new Error("请指定 --profile、--module 或 --archive");
  for (const id of modules) if (!Object.hasOwn(scripts, id)) throw new Error(`未知模块 ${id}`);
  if ((channel || patch) && !archive) throw new Error("--channel 和 --patch 用于归档，请搭配 --archive");
  if (channel && channel !== "pbe" && channel !== "ranked") throw new Error("--channel 仅接受 pbe 或 ranked");
  if (channel === "ranked" ? !/^\d+\.\d+[a-z]?$/.test(patch ?? "") : patch !== undefined) {
    throw new Error("正式服归档须指定 --channel ranked --patch <实际补丁>，PBE 使用当前补丁映射");
  }
  const selected = new Set(profile ? profiles[profile] : modules);
  if (archive && selected.size) {
    if (channel === "ranked") throw new Error("现有采集器面向 S19 PBE。请准备正式服数据后单独运行 --archive");
    for (const id of archiveModules) selected.add(id);
  }
  if (catalog !== undefined && !selected.has("guide-family-stats")) {
    throw new Error("--catalog 需要选中 guide-family-stats");
  }
  const catalogFile = selected.has("guide-family-stats") ? catalog ?? defaultCatalog : undefined;
  const steps = [];
  for (const [id, script] of Object.entries(scripts)) {
    if (!selected.has(id)) continue;
    if (!script) {
      steps.push({ ids: [id] });
      continue;
    }
    const ids = [id], args = [];
    // The family collector passes its same-batch review directly to the trend writer.
    if (id === "guide-family-stats") {
      ids.push("comp-trends");
      args.push("--catalog", catalogFile, "--trends", "data/comp-trends.json");
    } else if (id === "comp-trends") {
      if (selected.has("guide-family-stats")) continue;
      args.push("--patch", "data/current-patch.json");
    }
    steps.push({ ids, command: commandFor(script, args, python) });
  }
  steps.push({ ids: ["data:verify"], command: verify });
  if (archive) {
    const args = ["--channel", channel ?? "pbe", ...(patch ? ["--patch", patch] : [])];
    steps.push({ ids: ["archive"], command: commandFor("archive-stat-period.mjs", args, python) });
    steps.push({ ids: ["data:verify"], command: verify });
  }
  return { steps, catalogFile };
}

async function checkInputs(catalogFile, modules, channel) {
  const readJson = async file => JSON.parse(await readFile(new URL(file, root), "utf8"));
  const collectsPbe = modules.some(id => id !== "comp-trends");
  if (collectsPbe || channel) {
    const current = await readJson("data/current-patch.json");
    const expected = collectsPbe ? /^s19-pbe$/ : channel === "ranked" ? /^s\d+-live$/ : /^s\d+-pbe$/;
    if (!expected.test(current.seasonId)) throw new Error("当前赛季或队列与所选采集器或归档不一致");
  }
  if (catalogFile) {
    let catalog;
    try {
      catalog = JSON.parse(await readFile(resolve(cwd, catalogFile), "utf8"));
    } catch {
      throw new Error(`无法读取公开攻略目录 ${catalogFile}，请按数据更新规范导出同赛季目录`);
    }
    const season = await readJson("data/season.json");
    if (catalog?.seasonId !== season.id || !Array.isArray(catalog.boards) ||
        !catalog.boards.some(board => board?.edition === season.id)) {
      throw new Error("公开攻略目录与本地 season.json 不属于同一攻略版本");
    }
  }
}

async function execute(steps, catalogFile, options) {
  const byScript = steps.filter(step => step.command && Object.hasOwn(scripts, step.ids[0]));
  const modules = byScript.flatMap(step => step.ids);
  const lockFile = new URL("data/.data-refresh.lock", root);
  let lock;
  try {
    lock = await open(lockFile, "wx");
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("已有数据刷新在执行，请等待本轮完成");
    throw error;
  }
  try {
    await checkInputs(catalogFile, modules, options.archive ? options.channel ?? "pbe" : undefined);
    const baseline = await Promise.all(modules.map(async id => {
      const file = new URL(`data/${id}.json`, root);
      return { file, bytes: await readFile(file) };
    }));
    let archived = false;
    try {
      for (const { ids, command } of steps) {
        if (!command) {
          console.log(`${ids[0]} · 人工维护，本轮校验现有快照`);
          continue;
        }
        console.log(`${ids.join(" + ")} · ${commandLine(command)}`);
        run(command);
        if (ids[0] === "archive") archived = true;
      }
    } catch (error) {
      if (!archived) {
        const unrestored = [];
        for (const { file, bytes } of baseline) {
          const staged = new URL(file.href + `.${process.pid}.rollback`);
          try {
            const current = await readFile(file).catch(cause => {
              if (cause.code !== "ENOENT") throw cause;
            });
            if (current?.equals(bytes)) continue;
            await writeFile(staged, bytes, { flag: "wx" });
            await rename(staged, file);
          } catch (cause) {
            unrestored.push(`${file.pathname.split("/").at(-1)}（${cause.code}）`);
          }
        }
        if (unrestored.length) throw new Error(`${error.message}；恢复失败：${unrestored.join("、")}`);
      }
      throw error;
    }
  } finally {
    try {
      await lock.close();
    } finally {
      await rm(lockFile, { force: true });
    }
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    status: { type: "boolean" }, json: { type: "boolean" }, verify: { type: "boolean" },
    profile: { type: "string" }, module: { type: "string", multiple: true },
    archive: { type: "boolean" }, channel: { type: "string" }, patch: { type: "string" },
    catalog: { type: "string" }, "dry-run": { type: "boolean" }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) {
    console.log("node scripts/run-data-refresh.mjs --status [--json] | --verify");
    console.log("node scripts/run-data-refresh.mjs (--profile fast|daily|catalog|guides|all | --module <id> ...) [--catalog <file>] [--archive] [--dry-run]");
    console.log("node scripts/run-data-refresh.mjs --archive [--channel pbe | --channel ranked --patch <ver>] [--dry-run]");
    return;
  }
  if (values.status && Object.keys(values).some(key => !["status", "json"].includes(key)) ||
      values.verify && Object.keys(values).length > 1 || values.json && !values.status) {
    throw new Error("--status [--json] 和 --verify 分别独立使用");
  }
  const python = findPython();
  const verify = commandFor("verify-data-integrity.py", [], python);
  if (values.status) return status(verify, values.json);
  if (values.verify) return run(verify);
  const { steps, catalogFile } = planFor(values, verify, python);
  if (values["dry-run"]) {
    console.log("仅预览 · 工作目录 site/");
    for (const [index, { ids, command }] of steps.entries()) {
      console.log(`${index + 1}. ${ids.join(" + ")} · ${command ? commandLine(command) : "人工维护，本轮校验现有快照"}`);
    }
    return;
  }
  await execute(steps, catalogFile, values);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
