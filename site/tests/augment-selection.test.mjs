import test from "node:test";
import assert from "node:assert/strict";
import { augmentCardId, augmentTableRows, compareAugmentRows, currentSelectionSnapshot, matchSelectionEntry, selectionSnapshots, validAugmentReturn } from "../domain/augment-library.ts";

test("a guide can return to the selected augment without accepting another path", () => {
  const id = "DA_Kennen19_HeroAugment";
  const target = `/augments?q=%E5%87%AF%E5%8D%97&id=${id}&kind=hero#${augmentCardId(id)}`;
  assert.equal(validAugmentReturn(target), target);
  for (const invalid of ["//elsewhere.test/augments", "/augments/../manage", "/augments#other", "/augments\\anything"]) {
    assert.equal(validAugmentReturn(invalid), undefined);
  }
});

test("live, PBE and legacy season-only figures never fill another patch", () => {
  const row = { name: "暴击符文", rarity: "银色", apiName: "DA_CritQuintessence", mean: 4.3 };
  const live = { season: 19, realm: "live", patch: "19.1", date: "2026-11-20", rows: [row] };
  const pbe = { ...live, realm: "pbe", patch: "19.10" };
  const historic = { ...live, season: 18, patch: undefined };
  const snapshots = selectionSnapshots({ 18: historic, "19:live:19.1": live, "19:pbe:19.10": pbe });
  assert.equal(currentSelectionSnapshot(snapshots, 19, "pbe", "19.1"), undefined);
  assert.equal(currentSelectionSnapshot(snapshots, 19, "live", "19.1"), live);
  assert.equal(currentSelectionSnapshot(snapshots, 19, "pbe", "19.10"), pbe);
  assert.equal(currentSelectionSnapshot(snapshots, 18, "live", "18.7"), undefined);
  assert.equal(currentSelectionSnapshot([{ ...live, rows: [{ ...row, mean: undefined, grade: "S" }] }], 19, "live", "19.1"), undefined);
  assert.equal(currentSelectionSnapshot([{ ...live, rows: [{ ...row, games: 0 }] }], 19, "live", "19.1"), undefined);
});

test("same-API variants, same-name separate augments and unknown IDs do not share results", () => {
  const base = { id: "DA_Crit--normal", apiName: "DA_Crit", rarity: "银色", name: "暴击符文", english: "Crit" };
  const plus = { ...base, id: "DA_Crit--plus", name: "暴击符文+", english: "Crit+" };
  const another = { ...plus, id: "DA_Another", apiName: "DA_Another" };
  const entries = [base, plus, another];
  const legacy = { apiName: base.apiName, rarity: "银色", name: "暴击符文+" };
  assert.equal(matchSelectionEntry(legacy, entries), plus);
  assert.equal(matchSelectionEntry({ ...legacy, id: "missing" }, entries), undefined);
  assert.equal(matchSelectionEntry({ ...legacy, id: another.id }, entries), undefined);
  assert.equal(matchSelectionEntry(legacy, [...entries, { ...plus, id: "ambiguous" }]), undefined);
});

test("full table keeps each variant and puts only verified overall and round metrics on its row", () => {
  const regular = { id: "A1", apiName: "A", rarity: "银色", name: "强化", english: "Augment" };
  const plus = { ...regular, id: "A2", name: "强化+", english: "Augment+" };
  const missing = { ...regular, apiName: "B", id: "B", name: "其他", english: "Another" };
  const entries = [regular, plus, missing];
  const rows = [
    { ...regular, round: "2-1", mean: 4.01, games: 50 },
    { ...regular, round: "all", mean: 4.12, games: 100, top4: 51, win: 0 },
    { ...plus, round: "3-2", mean: 4.24, games: 75, win: 12 },
    { ...regular, id: "unknown", round: "4-2", mean: 3.99 },
  ];
  const [first, second, empty] = augmentTableRows(entries, {rows});
  assert.deepEqual([first.mean, first.games, first.top4, first.win, first["2-1"], first["4-2"]], [4.12, 100, 51, 0, 4.01, undefined]);
  assert.deepEqual([second.english, second["3-2"], second.mean, second.games, second.win], ["Augment+", 4.24, undefined, undefined, undefined]);
  assert.equal(empty.id, "B");
  assert.equal(augmentTableRows(entries).length, 3);
  const historical = augmentTableRows(undefined, {rows: rows.slice(0, 3)});
  assert.deepEqual(historical.map(row => [row.id, row.english, row.mean]), [["A1", "Augment", 4.12], ["A2", "Augment+", undefined]]);
  const secondPick = augmentTableRows(entries, {rows}, "3-2");
  assert.deepEqual(secondPick.map(row => [row.id, row.mean, row.games, row.win, row["2-1"]]), [["A2", 4.24, 75, 12, undefined]]);
});

test("sorting both ways keeps missing values last, real zero and numeric order intact", () => {
  const rows = [{id: "missing"}, {id: "two", games: 2}, {id: "many", games: 100}, {id: "zero", games: 0}];
  const ids = descending => [...rows].sort((a,b) => compareAugmentRows(a,b,"games",descending)).map(row => row.id);
  assert.deepEqual(ids(false), ["zero","two","many","missing"]);
  assert.deepEqual(ids(true), ["many","two","zero","missing"]);
});

test("identically named variants identify their real selection rounds in the same table column", () => {
  const box = { name: "盲盒", english: "Blind Box", rarity: "银色", apiName: "Box" };
  const boxes = ["2-1","3-2","4-2"].map(round => ({...box, id: round, rounds: [round]}));
  assert.deepEqual(augmentTableRows(boxes).map(row => row.variantLabel), ["2-1 可选","3-2 可选","4-2 可选"]);
});
