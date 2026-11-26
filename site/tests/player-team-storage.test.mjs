import test from "node:test";
import assert from "node:assert/strict";
import {
  exportPlayerTeams, findPlayerGuideTeam, importPlayerTeams, readPlayerEditorDraft, readPlayerTeams,
  resetPlayerGuideBoard, samePlayerBoard, savePlayerTeam, writePlayerEditorDraft,
} from "../components/player-team-storage.ts";
import { guideBoardTransferKey, readGuideBoardTransfer } from "../components/guide-board-transfer.ts";

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

function useStorage(t) {
  const localStorage = memoryStorage();
  globalThis.window = { localStorage, navigator: {} };
  globalThis.sessionStorage = memoryStorage();
  t.after(() => { delete globalThis.window; delete globalThis.sessionStorage; });
  return localStorage;
}

const sourceGuide = { sectionId: "guide", teamId: "board", href: "/guides/guide?team=board", title: "攻略 · 主阵" };
const piece = { unitId: "teemo", instanceId: "official-piece", position: 4, stars: 2, items: ["item"] };
const team = {
  id: "local", name: sourceGuide.title, category: "待分类", notes: "", pieces: [piece],
  revision: 0, updatedAt: "2026-11-26T00:00:00.000Z",
};

test("guest guide metadata survives transfer, local saves and backup round-trips", async t => {
  useStorage(t);
  sessionStorage.setItem(guideBoardTransferKey, JSON.stringify({ id: "transfer", team, ...sourceGuide, sourceGuide }));
  assert.deepEqual(readGuideBoardTransfer("transfer").sourceGuide, sourceGuide);
  const saved = await savePlayerTeam({ ...team, sourceGuide });
  const legacy = await savePlayerTeam({ ...team, id: "legacy" });
  const malformed = await savePlayerTeam({ ...team, id: "malformed", sourceGuide: { ...sourceGuide, href: "//foreign.test" } });
  assert.deepEqual(readPlayerTeams().find(entry => entry.id === saved.id).sourceGuide, sourceGuide);
  assert.equal(readPlayerTeams().find(entry => entry.id === legacy.id).sourceGuide, undefined);
  assert.equal(malformed.sourceGuide, undefined);
  assert.deepEqual(await importPlayerTeams(exportPlayerTeams(), saved.id, () => true), { added: 3, copies: 3 });
  assert.equal(readPlayerTeams().filter(entry => entry.sourceGuide?.teamId === "board").length, 2);
});

test("the guest draft restores an unsaved board, the active stage, and its guide source", t => {
  const storage = useStorage(t);
  assert.equal(readPlayerEditorDraft(), null);
  const draft = { ...team, pieces: [{ ...piece, position: 12 }], sourceGuide };
  const guideBoardSource = {
    draftId: draft.id, title: sourceGuide.title, href: sourceGuide.href, sourceGuide,
    officialBoard: { pieces: [piece] }, restoredPlayerTeam: true, sharedConditions: [],
  };
  writePlayerEditorDraft({ team: draft, stage: "mid", guideBoardSource });
  assert.deepEqual(readPlayerEditorDraft(), { team: draft, stage: "mid", guideBoardSource });
  const cleared = { ...draft, pieces: [] };
  writePlayerEditorDraft({ team: cleared, stage: "late", guideBoardSource });
  assert.deepEqual(readPlayerEditorDraft().team.pieces, []);
  writePlayerEditorDraft({ team: { ...cleared, id: "new" }, stage: "late", guideBoardSource: null });
  assert.equal(readPlayerEditorDraft().guideBoardSource, null);
  storage.setItem("tft-player-editor-draft-v1", "{");
  assert.equal(readPlayerEditorDraft(), null);
});

test("reimport chooses the latest matching source ahead of a legacy name and keeps its revision on reset", () => {
  const legacy = { ...team, id: "legacy", revision: 1 };
  const differentGuide = { ...team, id: "other", sourceGuide: { ...sourceGuide, teamId: "other" } };
  const otherStage = { ...team, id: "early", sourceGuide: { ...sourceGuide, href: sourceGuide.href + "&stage=early" } };
  const edited = { ...team, name: "调整过名字", sourceGuide, revision: 4, notes: "我的备注",
    instrumentPositions: { maracas: 7 }, pieces: [{ ...piece, position: 12, items: ["other-item"] }] };
  const older = { ...edited, id: "older", revision: 2 };
  const restored = findPlayerGuideTeam([legacy, otherStage, differentGuide, edited, older],
    { ...sourceGuide, href: sourceGuide.href + "&from=%2F" });
  assert.equal(restored, edited);
  assert.equal(findPlayerGuideTeam([differentGuide, legacy, { ...legacy, id: "older-legacy" }], sourceGuide), legacy);
  assert.equal(findPlayerGuideTeam([otherStage], sourceGuide), undefined);
  assert.equal(samePlayerBoard(edited, team), false);
  const reset = resetPlayerGuideBoard(restored, team);
  assert.equal(reset.id, edited.id);
  assert.equal(reset.revision, 4);
  assert.equal(reset.notes, edited.notes);
  assert.notEqual(reset.pieces[0].instanceId, piece.instanceId);
  assert.equal(samePlayerBoard(reset, team), true);
  assert.equal(samePlayerBoard({ pieces: [{ ...piece, alternate: piece }] }, team), false);
});
