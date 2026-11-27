import assert from "node:assert/strict";
import test from "node:test";
import { readOwnerDraft, writeOwnerDraft } from "../components/owner-draft-storage.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

const oldKey = "tft-s19-unsynced-team-v1";
const first = {
  id: "team-a", name: "跨端阵容", category: "待分类", notes: "初稿",
  revision: 1, updatedAt: "2026-11-27T00:00:00Z", pieces: [],
};
const latest = { ...first, notes: "云端修改", revision: 2, updatedAt: "2026-11-27T00:01:00Z" };

test("reopening a saved team follows the latest cloud version", () => {
  const storage = memoryStorage();
  writeOwnerDraft(storage, first, false);
  assert.deepEqual(readOwnerDraft(storage, [latest]).resume, latest);
  assert.equal(readOwnerDraft(storage, [latest]).restore, undefined);
});

test("real edits survive a newer cloud save, unless the content already matches", () => {
  const storage = memoryStorage();
  const local = { ...first, notes: "本机未保存" };
  writeOwnerDraft(storage, local, true);
  assert.deepEqual(readOwnerDraft(storage, [latest]).restore, local);
  assert.deepEqual(readOwnerDraft(storage, null).restore, local);
  const matching = { ...latest, notes: local.notes };
  assert.deepEqual(readOwnerDraft(storage, [matching]).resume, matching);
});

test("legacy local edits at the current revision still prompt", () => {
  const storage = memoryStorage();
  const unsaved = { ...first, notes: "旧格式未保存" };
  storage.setItem(oldKey, JSON.stringify(unsaved));
  assert.deepEqual(readOwnerDraft(storage, [first]).restore, unsaved);
});

test("legacy versions open the latest cloud team and keep the older content available", () => {
  const storage = memoryStorage();
  storage.setItem(oldKey, JSON.stringify(first));
  assert.deepEqual(readOwnerDraft(storage, null), {});
  assert.deepEqual(readOwnerDraft(storage, [latest]), { resume: latest, legacy: first });
  writeOwnerDraft(storage, latest, false);
  assert.deepEqual(readOwnerDraft(storage, [latest]), { resume: latest, legacy: first });
});
