import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { getDatabaseClient } from "../server/runtime-db.ts";
import { mediaStore } from "../server/runtime-media.ts";

class ArchiveError extends Error {}
const reject = (message) => { throw new ArchiveError(message); };
const imageKey = /^media\/[a-zA-Z0-9_-]{1,256}$/;
const allowedMimes = /^image\/(?:png|jpeg|webp|gif|avif)$/;
const columns = {
  settings: ["key", "value"],
  snapshots: ["id", "body", "created_at"],
  teams: ["id", "owner_id", "body", "revision", "updated_at"],
  sync_jobs: ["id", "kind", "status", "detail", "updated_at"],
};

function readJson(value, error) {
  try {
    return JSON.parse(value.replace(/^\uFEFF/, ""));
  } catch {
    reject(error);
  }
}

function imageTokens(value, tokens) {
  if (Array.isArray(value)) {
    for (const entry of value) imageTokens(entry, tokens);
  } else if (value && typeof value === "object") {
    if (typeof value.imageToken === "string") tokens.add("media/" + value.imageToken);
    if (Array.isArray(value.media)) {
      for (const token of value.media) {
        if (typeof token === "string") tokens.add("media/" + token);
      }
    }
    for (const entry of Object.values(value)) imageTokens(entry, tokens);
  }
}

function validate(archive) {
  if (archive?.version !== 1 || !["public-only", "full"].includes(archive.kind) ||
      !archive.tables || !Array.isArray(archive.media)) reject("备份格式或版本无效。");
  const identities = new Set();
  const tokens = new Set();
  for (const [table, fields] of Object.entries(columns)) {
    const rows = archive.tables[table];
    if (!Array.isArray(rows)) reject("备份缺少数据表 " + table + "。");
    for (const row of rows) {
      if (!row || !fields.every(key =>
        key === "revision" ? Number.isSafeInteger(row[key]) && row[key] >= 1 : typeof row[key] === "string")) {
        reject("备份数据表字段无效：" + table + "。");
      }
      const identity = table + ":" + row[fields[0]];
      if (!row[fields[0]] || identities.has(identity)) reject("备份数据表含空标识或重复行：" + table + "。");
      identities.add(identity);
      if (table === "teams" || table === "snapshots") {
        const value = readJson(row.body, "备份中的棋盘或发布内容无法解析。");
        if (!value || value.id !== row.id) reject("备份中的内容标识与数据表不一致。");
        if (table === "teams" && !Array.isArray(value.pieces)) reject("备份中的棋盘缺少棋子列表。");
        if (table === "snapshots") {
          if (!Array.isArray(value.sections) || !value.season) reject("备份中的发布快照结构不完整。");
          imageTokens(value, tokens);
        }
      }
    }
  }
  const settings = new Map(archive.tables.settings.map(({key, value}) => [key, value]));
  const owner = settings.get("owner_id");
  if (archive.tables.teams.length && !owner) reject("含棋盘的备份需要保留站主标识。");
  if (archive.kind === "public-only" && (owner !== "edgeone-owner" || archive.tables.sync_jobs.length ||
      archive.tables.snapshots.length !== 1 || settings.size !== 3 ||
      archive.tables.teams.some(row => row.owner_id !== owner))) reject("公开预置包含非公开版本的状态。");
  if (settings.has("edgeone_import_mode") && settings.get("edgeone_import_mode") !== archive.kind)
    reject("备份声明与数据库迁移标记不一致。");
  if (settings.has("published_id") && !identities.has("snapshots:" + settings.get("published_id"))) {
    reject("备份中的当前发布版本未包含在快照中。");
  }
  const draft = settings.get("document_draft");
  if (draft) imageTokens(readJson(draft, "备份中的未发布草稿无法解析。"), tokens);
  const media = new Set();
  for (const object of archive.media) {
    if (!object || !imageKey.test(object.key) || object.file !== object.key ||
        !allowedMimes.test(object.contentType) || media.has(object.key))
      reject("备份中的图片清单无效。");
    media.add(object.key);
  }
  const missing = [...tokens].filter(key => !media.has(key)).length;
  if (missing) reject("备份缺少 " + missing + " 个被引用的图片对象。");
}

function imageType(data) {
  if (data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (data.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(data.toString("ascii", 0, 6))) return "image/gif";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (data.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(data.toString("ascii", 8, 12))) return "image/avif";
  return "";
}

async function mediaFile(root, object) {
  const path = resolve(root, object.file);
  const stat = await lstat(path).catch(() => null);
  if (!stat?.isFile()) reject("备份目录里缺少一张有效的图片。");
  const actual = await realpath(path);
  const actualRelative = relative(root, actual);
  if (!actualRelative || actualRelative === ".." || actualRelative.startsWith(".." + sep) || isAbsolute(actualRelative))
    reject("备份图片路径不在备份目录内。");
  const data = await readFile(actual);
  if (imageType(data) !== object.contentType) reject("备份中一张图片的内容与声明的格式不一致。");
  return data;
}

async function assertTarget(client, requireEmpty = true) {
  const { rows } = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  for (const { name } of rows) {
    if (!Object.hasOwn(columns, name) && name !== "__drizzle_migrations") reject("目标数据库不是该站点的专用数据库。");
    if (!requireEmpty || !Object.hasOwn(columns, name)) continue;
    const present = await client.execute("SELECT 1 FROM " + name + " LIMIT 1");
    if (present.rows.length) reject("目标数据库已有站主或业务状态。请使用全新的目标数据库导入。");
  }
}

async function applySchema(db) {
  const file = await readFile(new URL("../drizzle/0000_slippery_firelord.sql", import.meta.url), "utf8");
  await db.batch(file.split("--> statement-breakpoint").map(sql =>
    sql.trim().replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")).filter(Boolean), "write");
}

async function copyMedia(archive, root, media) {
  for (const object of archive.media) {
    const data = await mediaFile(root, object);
    const existing = await media.get(object.key);
    if (existing) {
      const current = Buffer.from(await new Response(existing.body).arrayBuffer());
      if (!data.equals(current)) reject("目标图片存储已有不同内容的同名对象。");
      continue;
    }
    const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    await media.put(object.key, bytes, object.contentType);
  }
}

async function writeTables(db, archive) {
  const transaction = await db.transaction("write");
  try {
    await assertTarget(transaction);
    for (const [table, fields] of Object.entries(columns)) {
      const sql = "INSERT INTO " + table + " (" + fields.join(",") + ") VALUES (" +
        fields.map(() => "?").join(",") + ")";
      let batch = [];
      let size = 0;
      for (const row of archive.tables[table]) {
        const args = fields.map(field => row[field]);
        const rowSize = args.reduce((sum, value) => sum +
          (typeof value === "string" ? Buffer.byteLength(value) : 16), 0);
        if (batch.length && (batch.length >= 25 || size + rowSize > 3_000_000)) {
          await transaction.batch(batch);
          batch = [];
          size = 0;
        }
        batch.push({ sql, args });
        size += rowSize;
      }
      if (batch.length) await transaction.batch(batch);
    }
    if (!archive.tables.settings.some(row => row.key === "edgeone_import_mode")) {
      await transaction.execute({
        sql: "INSERT INTO settings(key,value) VALUES ('edgeone_import_mode',?)",
        args: [archive.kind],
      });
    }
    await transaction.commit();
  } catch (error) {
    if (!transaction.closed) await transaction.rollback().catch(() => {});
    throw error;
  } finally {
    transaction.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: { archive: { type: "string" }, check: { type: "boolean" }, init: { type: "boolean" } },
  });
  if (values.init) {
    if (values.archive || values.check) reject("--init 必须单独运行。");
    const db = await getDatabaseClient();
    try {
      await assertTarget(db, false);
      await applySchema(db);
    } finally {
      db.close();
    }
    console.log(JSON.stringify({ initialized: true }));
    return;
  }
  if (!values.archive) reject("用法：node scripts/import-edgeone-archive.mjs --archive /path/archive.json [--check] 或 --init");
  const path = await realpath(resolve(values.archive)).catch(() => reject("备份文件不存在。"));
  const root = dirname(path);
  const archive = readJson(await readFile(path, "utf8"), "无法解析备份 JSON。");
  validate(archive);
  const media = !values.check && archive.media.length ? mediaStore() : undefined;
  for (const object of archive.media) {
    const data = await mediaFile(root, object);
    if (media?.maxObjectBytes && data.byteLength > media.maxObjectBytes)
      reject(`图片 ${object.key} 超过 Makers Blob 单张 4 MiB 的响应上限，请检查归档。`);
  }

  if (!values.check) {
    const db = await getDatabaseClient();
    try {
      await assertTarget(db);
      if (media) await copyMedia(archive, root, media);
      await applySchema(db);
      await writeTables(db, archive);
    } finally {
      db.close();
    }
  }
  console.log(JSON.stringify({
    mode: archive.kind, checkedOnly: !!values.check, snapshots: archive.tables.snapshots.length,
    teams: archive.tables.teams.length, media: archive.media.length,
  }));
}

try {
  await main();
} catch (error) {
  const detail = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? "（" + error.code + "）" : "";
  console.error(error instanceof ArchiveError ? error.message : "备份恢复未完成，请核对数据库与媒体存储配置并重试" + detail + "。");
  process.exitCode = 1;
}
