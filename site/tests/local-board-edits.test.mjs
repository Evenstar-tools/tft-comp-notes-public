import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { boardContentVersion, publishedBoardContent } from "../domain/published-board-layout.ts";
import { sectionTeams } from "../domain/document-flow.ts";
import { currentGuideSeason, prepareFamilyPublication } from "../scripts/export-family-catalog.mjs";
import { planLocalBoardEdits, readLocalBoardEdits } from "../scripts/sync-local-board-edits.mjs";

const preview = JSON.parse(readFileSync(new URL("../data/public-preview.json", import.meta.url), "utf8"));
const sectionId = "sample-block-0251";
const teamId = "00000000-0000-4000-8000-000000000075";
const otherId = "00000000-0000-4000-8000-000000000076";

function renderedBoard(snapshot, id = teamId) {
  const section = prepareFamilyPublication(snapshot).sections.find(entry => entry.id === sectionId);
  return sectionTeams(section).find(board => board.id === id);
}

function movedBoard(board, index = 0) {
  const content = structuredClone(publishedBoardContent(board));
  const occupied = new Set([...content.pieces.map(piece => piece.position), ...Object.values(content.instrumentPositions ?? {})]);
  content.pieces[index].position = Array.from({ length: 28 }, (_, position) => position).find(position => !occupied.has(position));
  return content;
}

function override(source, content, id = teamId) {
  return { sectionId, teamId: id, edition: currentGuideSeason.id, source: publishedBoardContent(source), content };
}

test("imports a saved original board, preserves its link and unrelated boards, and accepts the next edit", () => {
  const before = renderedBoard(preview);
  const content = movedBoard(before);
  const { ready, conflicts, snapshot } = planLocalBoardEdits(preview, [override(before, content)]);
  assert.deepEqual(conflicts, []);
  assert.equal(ready[0].kind, "站位");
  assert.match(ready[0].href, /^\/guides\/ocean-graves\?team=/);
  assert.deepEqual(snapshot.sections, preview.sections);
  assert.deepEqual(snapshot.boardEdits.slice(0, -1), preview.boardEdits);
  assert.deepEqual(renderedBoard(snapshot, otherId), renderedBoard(preview, otherId));
  assert.equal(boardContentVersion(renderedBoard(snapshot)), boardContentVersion(content));
  assert.equal(planLocalBoardEdits(snapshot, [override(before, content)]).already.length, 1);

  const current = renderedBoard(snapshot);
  const next = structuredClone(publishedBoardContent(current));
  next.pieces[0].stars = next.pieces[0].stars === 3 ? 2 : 3;
  const replacement = planLocalBoardEdits(snapshot, [override(current, next)]);
  assert.deepEqual(replacement.conflicts, []);
  assert.equal(replacement.ready[0].kind, "阵容配置");
  assert.equal(replacement.snapshot.boardEdits.length, snapshot.boardEdits.length);
  assert.equal(boardContentVersion(renderedBoard(replacement.snapshot)), boardContentVersion(next));
});

test("imports and updates an original board generated from a guide stage", () => {
  const sectionId = "sample-block-0338";
  const teamId = "00000000-0000-4000-8000-000000001283";
  const findSection = snapshot => prepareFamilyPublication(snapshot).sections.find(section => section.id === sectionId);
  const section = findSection(preview);
  const team = sectionTeams(section).find(board => board.id === teamId);
  assert.equal(team.pieces.length, 8);
  assert.equal(section.reroll.stages.find(stage => stage.teamId === teamId).parentTeamId, "00000000-0000-4000-8000-000000000078");
  assert.ok(section.reroll.added.includes(teamId));
  const content = movedBoard(team);
  const firstEdit = {
    sectionId, teamId, edition: currentGuideSeason.id, source: publishedBoardContent(team), content,
  };
  const result = planLocalBoardEdits(preview, [firstEdit]);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.ready, [{ sectionId, teamId, href: "/guides/rock-vayne?team=lv8", kind: "站位" }]);
  assert.deepEqual(result.snapshot.sections, preview.sections);
  const updated = findSection(result.snapshot);
  const updatedBoard = sectionTeams(updated).find(board => board.id === teamId);
  assert.equal(boardContentVersion(updatedBoard), boardContentVersion(content));
  assert.deepEqual(updatedBoard.instrumentPositions, { infernalIdol: 4 });
  assert.deepEqual(sectionTeams(updated).filter(board => board.id !== teamId), sectionTeams(section).filter(board => board.id !== teamId));
  assert.equal(planLocalBoardEdits(result.snapshot, [firstEdit]).already.length, 1);

  const next = structuredClone(content);
  next.pieces.find(piece => piece.unitId === "vayne").stars = 3;
  const nextEdit = { ...firstEdit, source: publishedBoardContent(updatedBoard), content: next };
  const replacement = planLocalBoardEdits(result.snapshot, [nextEdit]);
  assert.deepEqual(replacement.conflicts, []);
  assert.equal(replacement.ready[0].kind, "阵容配置");
  assert.equal(replacement.snapshot.boardEdits.length, result.snapshot.boardEdits.length);
  assert.deepEqual(replacement.snapshot.boardEdits.find(edit => edit.teamId === teamId).source, firstEdit.source);
  assert.equal(boardContentVersion(sectionTeams(findSection(replacement.snapshot)).find(board => board.id === teamId)), boardContentVersion(next));
  assert.equal(planLocalBoardEdits(result.snapshot, [{ ...firstEdit, content: next }]).conflicts.length, 1);
});

test("a conflicting or missing board leaves the entire candidate unchanged", () => {
  const before = renderedBoard(preview);
  const changed = planLocalBoardEdits(preview, [override(before, movedBoard(before))]).snapshot;
  const other = renderedBoard(preview, otherId);
  const local = [
    override(before, movedBoard(before, 1)),
    override(other, movedBoard(other), otherId),
    override(before, movedBoard(before), "nonexistent"),
  ];
  const result = planLocalBoardEdits(changed, local);
  assert.equal(result.conflicts.length, 2);
  assert.equal(result.ready.length, 1);
  assert.equal(result.snapshot, changed);
});

test("reads the active local revision while keeping notes and draft content out of the export inventory", t => {
  const directory = mkdtempSync(join(tmpdir(), "tft-local-board-edit-"));
  const path = join(directory, "local.sqlite");
  t.after(() => {
    unlinkSync(path);
    rmdirSync(directory);
  });
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE snapshots (id TEXT PRIMARY KEY, body TEXT);
    CREATE TABLE teams (id TEXT PRIMARY KEY, body TEXT, revision INT, updated_at TEXT);
  `);
  database.prepare("INSERT INTO settings VALUES (?, ?)").run("published_id", "active-revision");
  const current = renderedBoard(preview);
  const edit = override(current, movedBoard(current));
  database.prepare("INSERT INTO snapshots VALUES (?, ?)").run("older-revision", "{}");
  database.prepare("INSERT INTO snapshots VALUES (?, ?)").run("active-revision",
    JSON.stringify({ kind: "repository-board-revision", id: "active-revision", boardOverrides: [edit] }));
  database.prepare("INSERT INTO teams VALUES (?, ?, ?, ?)").run("draft-id",
    JSON.stringify({ name: "private name", notes: "private notes", pieces: [current.pieces[0]] }), 4, "2026-11-28T00:00:00.000Z");
  database.close();

  const bytes = readFileSync(path);
  const report = readLocalBoardEdits(path);
  assert.equal(report.revision, "active-revision");
  assert.equal(boardContentVersion(report.overrides[0].content), boardContentVersion(edit.content));
  assert.deepEqual(report.drafts, [{
    id: "draft-id", revision: 4, updatedAt: "2026-11-28T00:00:00.000Z", pieceCount: 1, hasNotes: true,
  }]);
  assert.deepEqual(readFileSync(path), bytes);
});
