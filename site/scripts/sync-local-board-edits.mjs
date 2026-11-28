import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { sectionTeams } from "../domain/document-flow.ts";
import { canonicalGuidePath } from "../domain/guide-slugs.ts";
import { boardContentVersion, publishedBoardContent } from "../domain/published-board-layout.ts";
import { sameEdition } from "../domain/version-updates.ts";
import { migrateS19GuideSnapshot } from "../server/s19-guide-cleanup.ts";
import { currentGuideSeason, prepareFamilyPublication } from "./export-family-catalog.mjs";

const boardKey = ({ sectionId, teamId }) => JSON.stringify([sectionId, teamId]);

export function readLocalBoardEdits(databasePath) {
  const database = new DatabaseSync(resolve(databasePath), { readOnly: true });
  try {
    database.exec("PRAGMA busy_timeout=3000; BEGIN");
    const revision = database.prepare(`
      SELECT settings.value AS id, snapshots.body
      FROM settings LEFT JOIN snapshots ON snapshots.id = settings.value
      WHERE settings.key = 'published_id'
    `).get();
    const drafts = database.prepare(`
      SELECT id, revision, updated_at AS updatedAt,
        CASE WHEN json_valid(body) THEN json_array_length(body, '$.pieces') END AS pieceCount,
        CASE WHEN json_valid(body) THEN length(coalesce(json_extract(body, '$.notes'), '')) > 0 ELSE 0 END AS hasNotes
      FROM teams ORDER BY updated_at DESC, id
    `).all().map(row => ({ ...row, hasNotes: !!row.hasNotes }));
    if (!revision) return { revision: null, overrides: [], drafts };
    const record = JSON.parse(revision.body ?? "null");
    if (record?.kind !== "repository-board-revision" || record.id !== revision.id || !Array.isArray(record.boardOverrides)) {
      throw new Error("本地库的当前版本不是可同步的公开仓棋盘修订，请保留数据库并核对来源。");
    }
    return { revision: revision.id, overrides: record.boardOverrides, drafts };
  } finally {
    database.close();
  }
}

function findBoard(publication, sectionId, teamId) {
  const section = publication.sections.find(entry => entry.id === sectionId);
  return section && { section, board: sectionTeams(section).find(team => team.id === teamId) };
}

function nonPositionContent(board) {
  const { pieces, conditions } = publishedBoardContent(board);
  return JSON.stringify({
    pieces: pieces.map(({ position, ...piece }) => piece).sort((a, b) => a.instanceId.localeCompare(b.instanceId)),
    conditions,
  });
}

export function planLocalBoardEdits(snapshot, overrides) {
  const raw = migrateS19GuideSnapshot(snapshot);
  const rendered = prepareFamilyPublication(snapshot);
  const seen = new Set();
  const changes = [];
  const report = { ready: [], already: [], conflicts: [] };

  for (const override of overrides) {
    const { sectionId, teamId, edition, source, content } = override;
    const key = boardKey(override);
    const original = findBoard(raw, sectionId, teamId);
    const current = findBoard(rendered, sectionId, teamId);
    const entry = { sectionId, teamId, href: canonicalGuidePath(sectionId, teamId) };
    if (seen.has(key)) {
      report.conflicts.push({ ...entry, reason: "本地修订有重复棋盘" });
      continue;
    }
    seen.add(key);
    if (!original?.board || !current?.board ||
        !sameEdition(edition, currentGuideSeason.id) ||
        !sameEdition(edition, current.section.gameData?.id ?? rendered.season.id)) {
      report.conflicts.push({ ...entry, reason: "原棋盘不存在或赛季不符" });
      continue;
    }
    const currentVersion = boardContentVersion(current.board);
    if (currentVersion === boardContentVersion(content)) {
      report.already.push(entry);
      continue;
    }
    if (currentVersion !== boardContentVersion(source)) {
      report.conflicts.push({ ...entry, reason: "公开候选的同一棋盘已有其他修改，需逐盘核对" });
      continue;
    }
    changes.push({ sectionId, teamId, source: publishedBoardContent(original.board), content: publishedBoardContent(content) });
    report.ready.push({ ...entry, kind: nonPositionContent(source) === nonPositionContent(content) ? "站位" : "阵容配置" });
  }

  if (report.conflicts.length || !changes.length) return { ...report, snapshot };
  const touched = new Set(changes.map(boardKey));
  const candidate = {
    ...snapshot,
    boardEdits: [...(snapshot.boardEdits ?? []).filter(entry => !touched.has(boardKey(entry))), ...changes],
  };
  for (const field of ["boardLayouts", "boardOverrides"]) {
    if (!candidate[field]) continue;
    candidate[field] = candidate[field].filter(entry => !touched.has(boardKey(entry)));
    if (!candidate[field].length) delete candidate[field];
  }
  const next = prepareFamilyPublication(candidate);
  for (const edit of changes) {
    const updated = findBoard(next, edit.sectionId, edit.teamId)?.board;
    if (!updated || boardContentVersion(updated) !== boardContentVersion(edit.content)) {
      report.conflicts.push({
        sectionId: edit.sectionId, teamId: edit.teamId, href: canonicalGuidePath(edit.sectionId, edit.teamId),
        reason: "候选渲染与本地保存的棋盘不同",
      });
    }
  }
  return { ...report, snapshot: report.conflicts.length ? snapshot : candidate };
}

function writeSnapshot(path, original, snapshot) {
  const newline = original.endsWith("\r\n") ? "\r\n" : "\n";
  const indent = original.match(/^\{\r?\n([\t ]+)"/)?.[1];
  const serialized = JSON.stringify(snapshot, null, indent).replaceAll("\n", newline) +
    (original.endsWith("\n") ? newline : "");
  const temporary = path + ".tmp-" + randomUUID();
  try {
    writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx" });
    if (readFileSync(path, "utf8") !== original) throw new Error("候选快照在同步期间发生变化，请重新预检。");
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function main() {
  const { values } = parseArgs({ options: {
    database: { type: "string" }, apply: { type: "boolean" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("node scripts/sync-local-board-edits.mjs --database <本地 SQLite 路径> [--apply]");
    return;
  }
  if (!values.database) throw new Error("请用 --database 指定本地 SQLite 文件。");
  const path = fileURLToPath(new URL("../data/public-preview.json", import.meta.url));
  const original = readFileSync(path, "utf8");
  const { revision, overrides, drafts } = readLocalBoardEdits(values.database);
  const { snapshot, ready, already, conflicts } = planLocalBoardEdits(JSON.parse(original), overrides);
  const applied = !!values.apply && !conflicts.length && ready.length > 0;
  if (applied) writeSnapshot(path, original, snapshot);
  console.log(JSON.stringify({
    revision, applied, ready, already, conflicts, drafts,
    ...(ready.some(entry => entry.kind === "阵容配置") ? { needsReview: "阵容配置变动需核对攻略正文、一图流与固定战绩。" } : {}),
  }, null, 2));
  if (conflicts.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
