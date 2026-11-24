import test from "node:test";
import assert from "node:assert/strict";
import { boardTraitLink, compatibleTraitBatch, tierPerformance, traitScopeKey } from "../domain/trait-performance.ts";

test("the placement distribution gives an exact mean, top four and first; missing buckets stay empty", () => {
  assert.deepEqual(tierPerformance([2, 1, 0, 2, 0, 1, 1, 1]), { games: 8, mean: 33 / 8, top4: 5 / 8, win: 2 / 8 });
  for (const value of [undefined, [], Array(8).fill(0), [-1, 3, 0, 0, 0, 1, 1, 1]]) assert.equal(tierPerformance(value), undefined);
});

test("comparing a board's trait retains population, exact unit equipment and any other pinned traits", () => {
  const url = "https://www.metatft.com/explorer?set=TFTSet19&level=8&unit=Renata-1_3_3&trait=Bodyguard_2&unit=Nasus-1&trait=KDA_4";
  assert.equal(traitScopeKey(url), "8,Nasus-1,Renata-1_3_3,Bodyguard_2,KDA_4");
  assert.equal(traitScopeKey(url, ["Bodyguard_2"]), "8,Nasus-1,Renata-1_3_3,KDA_4");
  const exact = url + "&tactician_item_count=0&emblem_count=0&duplicate_unit_count=0";
  assert.equal(traitScopeKey(exact, ["Bodyguard_2"]),
    "8,Nasus-1,Renata-1_3_3,KDA_4,duplicate_unit_count=0,emblem_count=0,tactician_item_count=0");
  assert.equal(traitScopeKey(url.replace("TFTSet19", "TFTSet18")), undefined);
  const query = new URL(boardTraitLink("bodyguard", 6, "guideA", "alternateB"), "https://example.org").searchParams;
  assert.deepEqual(Object.fromEntries(query), { trait: "bodyguard", tier: "6", guide: "guideA", team: "alternateB" });
});

test("a snapshot is visible only for the same queue, patch and season", () => {
  assert.equal(compatibleTraitBatch("s19-pbe-19.1.0.5973071", 19, "PBE", "19.1"), true);
  assert.equal(compatibleTraitBatch("s19-pbe-19.1.0.6018196", 19, "PBE", "19.1b"), true);
  assert.equal(compatibleTraitBatch("s19-pbe-19.1a", 19, "PBE", "19.1b"), false);
  for (const edition of ["s19-live-19.1", "s19-pbe-19.10.2", "s20-pbe-19.1"]) {
    assert.equal(compatibleTraitBatch(edition, 19, "PBE", "19.1"), false);
  }
});
