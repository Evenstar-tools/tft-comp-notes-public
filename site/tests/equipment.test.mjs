import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { equipItem, indexRecipes, transferEquipment, wornCombinations } from "../domain/equipment.ts";
import { planCarousel, thirdItems } from "../domain/guide-equipment.ts";
import { conditionalGearCohorts, conditionalGearRows } from "../domain/conditional-gear.ts";
import { compareGearWearerSamples, gearSampleMinimum, gearWearerMatches, gearWearerStats } from "../domain/gear-wearer.ts";
import { itemGuideOrigin, itemLink } from "../domain/links.ts";

const { items, units } = JSON.parse(readFileSync(new URL("../data/season.json", import.meta.url), "utf8"));
const catalog = new Map(items.map(item => [item.id, item]));
const recipes = indexRecipes(items);
const sword = "TFT_Item_BFSword";
const bow = "TFT_Item_RecurveBow";
const spatula = "TFT_Item_Spatula";
const slayer = "TFT_Item_MadredsBloodrazor";
const blade = "TFT_Item_Deathblade";
const pick = (worn, id) => equipItem(worn, catalog.get(id), recipes);

test("equipment transfers between same-name pieces without losing the source on a failed drop", () => {
  const from = { instanceId: "first", unitId: "elise", position: 0, stars: 1, items: [sword, sword, blade] };
  const to = { instanceId: "second", unitId: "elise", position: 1, stars: 1, items: [bow, blade, slayer] };
  const board = [from, to];
  const transfer = (index, id, target) => transferEquipment(board, from.instanceId, index, catalog.get(id), target, recipes);
  assert.equal(transfer(2, blade, to.instanceId), board, "full target without a recipe");
  assert.equal(transfer(1, sword, from.instanceId), board, "same piece");
  assert.equal(transfer(2, sword, to.instanceId), board, "stale item slot");
  assert.equal(transfer(0, sword, "missing"), board, "empty or removed target");
  const crafted = transfer(1, sword, to.instanceId);
  assert.deepEqual(crafted.map(piece => piece.items), [[sword, blade], [slayer, blade, slayer]]);
  assert.deepEqual(board.map(piece => piece.items), [[sword, sword, blade], [bow, blade, slayer]]);
});

test("wearer search finds aliases and pinyin and preserves ambiguous champion forms", () => {
  const matches = query => gearWearerMatches(units, query).map(({ unit, rank }) => [unit.id, rank]);
  assert.deepEqual(matches("奥巴马"), [["lucian", 3]]);
  assert.deepEqual(matches("GLFS"), [["graves", 3]]);
  assert.deepEqual(matches("格雷"), [["graves", 2]]);
  assert.deepEqual(matches("阿卡丽"), [["akali-kda", 3], ["akali-true-damage", 3]]);
  assert.deepEqual(matches("K/DA阿卡丽"), [["akali-kda", 3]]);
  assert.deepEqual(matches("羊刀"), []);
});

test("wearer comparisons use the individual sample and hide both rates under 100 games", () => {
  const rare = { games: 99, mean: 1.7, winRate: 0.9 };
  const common = { games: 200, mean: 3.9, winRate: 0.17 };
  const strong = { games: 100, mean: 3.5, winRate: 0.21 };
  assert.deepEqual(gearWearerStats(rare, 100), { games: 99 });
  assert.deepEqual(gearWearerStats(strong, 100), strong);
  const order = key => [rare, common, strong].sort((a, b) => compareGearWearerSamples(a, b, key, 100));
  assert.deepEqual(order("mean"), [strong, common, rare]);
  assert.deepEqual(order("wins"), [strong, common, rare]);
  assert.deepEqual(order("games"), [common, strong, rare]);
});

test("PBE shows sparse radiant, emblem and artifact results without changing other data", () => {
  const sparse = { games: 18, mean: 3.44, winRate: 0.11 };
  for (const category of ["radiant", "emblem", "artifact"]) {
    const minGames = gearSampleMinimum(category, true, 100);
    assert.deepEqual(gearWearerStats(sparse, minGames), sparse);
    assert.deepEqual(gearWearerStats({ games: 0 }, minGames), { games: 0 });
    assert.equal(gearSampleMinimum(category, false, 100), 100);
  }
  assert.equal(gearSampleMinimum("completed", true, 100), 100);
  assert.equal(gearSampleMinimum("support", true, 100), 100);
});

test("carousel counts duplicate parts and carries an inherited item only once on the next board", () => {
  const early = [{ owner: "莎弥拉", item: catalog.get(blade) }];
  const next = [{ owner: "烬", item: catalog.get(blade) }, { owner: "烬", item: catalog.get(slayer) }];
  assert.equal(planCarousel(early, { [sword]: 1 }, {}).picks[0].completes, true);
  assert.equal(planCarousel(early, { [sword]: 2 }, {}).ready.length, 1);
  const afterTransfer = planCarousel(next, { [bow]: 1 }, { [blade]: 1 });
  assert.deepEqual(afterTransfer.needs, [{ id: sword, count: 1 }]);
  assert.equal(afterTransfer.picks[0].goal.owner, "烬");
  assert.equal(afterTransfer.picks[0].goal.item.id, slayer);
});

test("third item matches both locked copies in any order within the selected sample", () => {
  const rows = [{ items: ["a", "b", "a"], games: 113, mean: 4.39 }, { items: ["b", "a", "c"], games: 320, mean: 4.16 }];
  assert.deepEqual(thirdItems(rows, "a", "a"), [{ id: "b", games: 113, mean: 4.39 }]);
  assert.deepEqual(thirdItems(rows, "b", "a").map(row => row.id), ["c", "a"]);
  assert.deepEqual(thirdItems(rows, "c", "c"), []);
});

test("holding an item keeps conditional builds in their real hero, star and trait cohorts", () => {
  const rageblade = "TFT_Item_GuinsoosRageblade";
  const cohorts = conditionalGearCohorts("s19-pbe-19.1.0.5973071", [rageblade]);
  const kayle = cohorts.find(cohort => cohort.unitId === "kayle");
  assert.ok(kayle);
  assert.deepEqual([kayle.stars, kayle.level, kayle.traitId, kayle.tier], [2, 8, "pentakill", 7]);
  const mostUsed = kayle.builds.filter(build => build.items.includes(rageblade))
    .sort((a, b) => b.games - a.games)[0];
  const remaining = [...mostUsed.items];
  remaining.splice(remaining.indexOf(rageblade), 1);
  assert.deepEqual(conditionalGearRows(kayle, [rageblade])[0], {
    items: remaining, games: mostUsed.games, mean: mostUsed.mean,
  });
  assert.deepEqual(cohorts.filter(cohort => cohort.unitId === "jinx").map(cohort => cohort.level), [8, 9]);
  assert.deepEqual(conditionalGearCohorts("s19-live-19.1.0.5973071", [rageblade]), []);
  assert.deepEqual(conditionalGearCohorts("s19-pbe-19.10.0.5973071", [rageblade]), []);
  assert.deepEqual(conditionalGearCohorts("s19-pbe-19.1.0.5973071", [rageblade, "unknown"]), []);
});

test("conditional builds consume one held copy, retain small-sample means, and skip other builds", () => {
  const cohort = { builds: [
    { items: ["a", "b", "a"], games: 99, mean: 4.39 },
    { items: ["b", "a", "c"], games: 320, mean: 4.16 },
    { items: ["c", "b", "c"], games: 900, mean: 4.17 },
    { items: ["a", "b"], games: 1000, mean: 4.18 },
  ] };
  assert.deepEqual(conditionalGearRows(cohort, ["a"]), [
    { items: ["b", "c"], games: 320, mean: 4.16 },
    { items: ["b", "a"], games: 99, mean: 4.39 },
  ]);
  const thirdPieces = [
    { items: ["c"], games: 320, mean: 4.16 },
    { items: ["a"], games: 99, mean: 4.39 },
  ];
  assert.deepEqual(conditionalGearRows(cohort, ["a", "b"]), thirdPieces);
  assert.deepEqual(conditionalGearRows(cohort, ["b", "a"]), thirdPieces);
});

test("each listed recipe combines in one slot in either order, including two identical components", () => {
  assert.deepEqual(pick([], sword), { items: [sword] });
  assert.deepEqual(pick([sword], bow).items, [slayer]);
  for (const item of items.filter(item => item.components?.length === 2)) {
    const [a, b] = item.components;
    assert.deepEqual(pick([a], b), { items: [item.id], result: item }, item.name);
    assert.deepEqual(pick([b], a).items, [item.id], item.name);
  }
});

test("a full loadout accepts a matching component in place and preserves the other slots", () => {
  const worn = [slayer, sword, blade];
  assert.deepEqual(pick(worn, bow).items, [slayer, slayer, blade]);
  assert.deepEqual(worn, [slayer, sword, blade]);
  assert.equal(pick(worn, spatula), null);
  assert.equal(pick(worn, slayer), null);
  assert.equal(pick([slayer, slayer, blade], bow), null);
  assert.deepEqual(pick([sword], spatula).items, [sword, spatula]);
  assert.deepEqual(pick([sword], slayer).items, [sword, slayer]);
});

test("an existing draft offers distinct recipes without consuming items until one is chosen", () => {
  const worn = [sword, slayer, bow];
  assert.deepEqual(wornCombinations(worn, recipes).map(option => option.items), [[slayer, slayer]]);
  assert.deepEqual(worn, [sword, slayer, bow]);
  assert.deepEqual(wornCombinations([bow, sword, sword], recipes).map(option => option.items), [
    [slayer, sword], [bow, blade],
  ]);
  assert.deepEqual(wornCombinations([slayer, sword, spatula], recipes), []);
});

test("an ambiguous pair never consumes a component or fills a fourth slot", () => {
  const alternate = { ...catalog.get(slayer), id: "season-special" };
  const ambiguous = indexRecipes([...items, alternate]);
  assert.deepEqual(equipItem([sword], catalog.get(bow), ambiguous), { items: [sword, bow] });
  assert.equal(equipItem([sword, blade, blade], catalog.get(bow), ambiguous), null);
  assert.deepEqual(wornCombinations([sword, bow], ambiguous), []);
});

test("S19 Red Buff and Sunfire use different source records and preserve the saved recipe identities", () => {
  const { items: reference } = JSON.parse(readFileSync(new URL("../data/item-reference.json", import.meta.url), "utf8"));
  const { items: wearers } = JSON.parse(readFileSync(new URL("../data/item-wearers.json", import.meta.url), "utf8"));
  const red = "TFT_Item_RapidFireCannon", sunfire = "TFT_Item_RedBuff";
  assert.deepEqual(pick([bow], bow).items, [red]);
  assert.deepEqual(pick(["TFT_Item_ChainVest"], "TFT_Item_GiantsBelt").items, [sunfire]);
  assert.equal(reference[red].name, "红霸符");
  assert.equal(reference[sunfire].name, "日炎斗篷");
  assert.ok(wearers[red].url.includes("/DA_RedBuff?"));
  assert.ok(wearers[sunfire].url.includes("/DA_SunfireCape?"));
});

test("links from equipment return to the originating board and preserve its search context", () => {
  const sectionId = "doxcnGuide-1";
  const teamId = "00000000-0000-4000-8000-000000000068";
  const from = "/guides/" + sectionId + "?" + new URLSearchParams({ team: teamId, from: "/?q=七摇滚#guide-card-doxcnGuide-1" });
  const link = new URL(itemLink("TFT_Item_GuinsoosRageblade", "vayne", from), "https://tft.local");
  assert.deepEqual(itemGuideOrigin(link.searchParams.get("from")), { sectionId, teamId, href: from });
  assert.equal(itemGuideOrigin("//another.example/guides/guide?team=x"), undefined);
  assert.equal(itemGuideOrigin("/guides/guide?team=../x"), undefined);
  assert.equal(itemGuideOrigin("/guides/guide"), undefined);
  assert.equal(itemLink("emblem-rock", "vayne", from), "/emblems?trait=rock&unit=vayne");
});
