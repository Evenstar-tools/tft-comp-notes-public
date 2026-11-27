import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { sectionTeams } from "../domain/document-flow.ts";
import { guidePromotionRows, guideSystemPhases, guideSystemSample, guideSystems, rankGuideSystems, systemMeanTone } from "../domain/guide-variant-strip.ts";
import { findPlacement, placementEvidenceKind } from "../domain/guide-placement.ts";
import { GUIDE_SECTION_IDS } from "../domain/guide-identities.ts";
import { traitCounts, usedPopulation } from "../domain/team.ts";

// Apply the same site-authored boards as the guide route, including those absent from the public snapshot.
const resolver = registerHooks({
  resolve(specifier, context, next) {
    const target = specifier.startsWith("@/") ? new URL("../" + specifier.slice(2), import.meta.url).href : specifier;
    try { return next(target, context); } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !target.startsWith(".") && !target.startsWith("file:")) throw error;
      return next(target + ".ts", context);
    }
  },
  load(url, context, next) {
    return next(url, url.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context);
  },
});
const { includeRerollBoards } = await import("../server/reroll-guides.ts");
const { migrateS19GuideSnapshot } = await import("../server/s19-guide-cleanup.ts");
resolver.deregister();

const read = name => JSON.parse(readFileSync(new URL("../data/" + name + ".json", import.meta.url), "utf8"));
const season = read("season");
const family = read("guide-family-stats");
const patch = read("current-patch");
const placement = read("guide-placement");
const fixed = { ...placement, records: placement.records.filter(row => placementEvidenceKind(row) === "fixed") };
const publication = includeRerollBoards(migrateS19GuideSnapshot(read("public-preview")), season);
const id = suffix => "00000000-0000-4000-8000-00000000" + suffix;

function guide(sectionId, batch = family) {
  const section = publication.sections.find(section => section.id === sectionId);
  assert.ok(section);
  const teams = sectionTeams(section);
  const data = section.gameData ?? publication.season;
  const systems = guideSystems(section, batch, data.id, patch, placement.minGames);
  const boards = system => teams.filter(board => system.boardIds.includes(board.id));
  const rate = board => findPlacement(fixed, board.pieces.map(piece => piece.unitId), usedPopulation(board.pieces), {
    edition: data.id, teamId: board.id, pieces: board.pieces, requireBoundFull: section.reroll?.added.includes(board.id),
    traitLevels: Object.fromEntries(traitCounts(board.pieces, data.units, data.traits, data.items).map(({ id, level }) => [id, level])),
  });
  return { systems, boards, rate, comparison: system => guidePromotionRows(boards(system), rate, placement) };
}

test("Graves ranks independent clusters and keeps Twisted Fate in the AD route", () => {
  const { systems, boards, comparison } = guide(GUIDE_SECTION_IDS.oceanGraves);
  assert.deepEqual(systems.map(system => guideSystemSample(system.stat).mean), ["4.15", "4.34", "4.38", "4.42", "—", "—"]);
  assert.deepEqual(systems.slice(0, 4).map(system => guideSystemSample(system.stat).tone), ["middle", "middle", "middle", "middle"]);
  assert.deepEqual(systems.slice(0, 4).map(system => system.teamId), ["0075", "1261", "0102", "0093"].map(id));
  assert(systems.some(system => system.teamId === id("0030")));
  assert(systems.some(system => system.teamId === id("0119")));
  assert(!systems.some(system => system.teamId === id("1262")));
  assert.deepEqual(comparison(systems[0]).map(row => row.board.id), ["0076", "0075"].map(id));
  assert.deepEqual(comparison(systems[1]).map(row => [row.board.id, row.label]), [
    [id("1262"), "9级补卡"], [id("1261"), "停在8级"],
  ]);
  const ad = boards(systems[1]);
  const ocean = boards(systems[0]);
  const phases = guideSystemPhases(ad, ad.find(board => board.id === id("1261")), ad.find(board => board.id === id("1262")),
    ocean.map(team => ({ team, label: team.name, text: "" })));
  assert.deepEqual(phases.map(step => step.team.id), ["1261", "1262"].map(id));
});

test("Jhin ranks three level-nine cards together and keeps Classical Jhin/Yuumi as a system without its own cluster", () => {
  const { systems, comparison } = guide(GUIDE_SECTION_IDS.classicalJhin);
  assert.deepEqual(systems.map(system => system.teamId), ["0059", "0006"].map(id));
  assert.deepEqual(guideSystemSample(systems[1].stat), { mean: "—", tone: "limited", sample: "暂无体系数据" });
  assert.equal(guideSystemSample(systems[0].stat).tone, "strong");
  assert.deepEqual(comparison(systems[0]).map(({ board, label, stat }) => [board.id, label, stat.mean]), [
    [id("1138"), "9级补卡", "2.93"], [id("0034"), "9级补卡", "3.99"],
    [id("0083"), "9级补卡", "3.99"], [id("0059"), "停在8级", "5.30"],
  ]);
  assert.equal(comparison(systems[0]).at(-1).stat.tone, "limited");
});

test("Jazz Jinx has one system and two level-nine additions with their own fixed settlement results", () => {
  const { systems, comparison } = guide(GUIDE_SECTION_IDS.jazzJinx);
  assert.equal(systems.length, 1);
  assert.equal(systems[0].teamId, id("1252"));
  assert.deepEqual(comparison(systems[0]).map(({ board, label, stat }) => [board.id, label, stat.mean]), [
    [id("1251"), "9级补卡", "4.04"], [id("1253"), "9级补卡", "4.40"], [id("1252"), "停在8级", "5.54"],
  ]);
});

test("other authored branches retain independent cores and choose the best valid cluster as the default", () => {
  const { systems: draven } = guide("sample-block-0407");
  assert.deepEqual(draven.map(system => [system.teamId, guideSystemSample(system.stat).mean, guideSystemSample(system.stat).tone]),
    [[id("1177"), "4.49", "middle"], [id("0013"), "4.63", "weak"]]);
  assert.deepEqual([3.99, 4.0, 4.34, 4.5, 4.51].map(systemMeanTone), ["strong", "middle", "middle", "middle", "weak"]);
  const { systems: zeri } = guide(GUIDE_SECTION_IDS.edmZeri);
  assert.deepEqual(zeri.map(system => system.teamId), ["0105", "0049", "1275"].map(id));
  assert(zeri[0].boardIds.includes(id("0003")));
  assert.match(zeri[1].title, /双电子.*女枪/);
  const { systems: ziggs } = guide(GUIDE_SECTION_IDS.hyperpopSeraphine);
  assert.deepEqual(ziggs.map(system => system.teamId), ["0089", "0096", "0098"].map(id));
  assert.match(ziggs[1].title, /五高能三编舞/);
  const { systems: renekton } = guide("sample-block-0171");
  assert.equal(renekton.find(system => system.teamId === id("0100"))?.stat, undefined);
  assert(renekton.some(system => system.teamId === id("0100") && system.boardIds.includes(id("0032"))));
  const { systems: kayle, comparison } = guide(GUIDE_SECTION_IDS.pentakillKayle);
  assert.deepEqual(kayle.map(system => system.teamId), ["0064", "0106"].map(id));
  assert.deepEqual(comparison(kayle[0]).map(row => row.board.id), ["0019", "0064"].map(id));
  const { systems: graves } = guide(GUIDE_SECTION_IDS.oceanGraves, { ...family, build: "stale" });
  assert(graves.every(system => !system.stat));
  assert(graves.find(system => system.teamId === id("1261")).boardIds.includes(id("1262")));
  const sister = { ...zeri[0], sectionId: "cross-guide", stat: { ...zeri[0].stat, mean: 3.7 } };
  assert.equal(rankGuideSystems([...zeri, sister])[0], sister);
});

test("promotion metrics reject core or lineup records, keep small samples gray and suppress unfit top-four rates", () => {
  const { systems, boards } = guide(GUIDE_SECTION_IDS.jazzJinx);
  const three = boards(systems[0]);
  const fixedSample = { population: 9, roster: ["zeri"], url: "https://www.metatft.com/explorer?tab=comps", games: 10,
    placementCounts: [0, 0, 0, 2, 0, 4, 2, 2], date: "2026-11-27", patch: "19.1c", window: "3天" };
  const summarize = sample => guidePromotionRows(three, board => board.id === id("1251") ? sample : undefined, placement)
    .find(row => row.board.id === id("1251")).stat;
  assert.deepEqual(summarize(fixedSample), { mean: "6.20", tone: "limited", sample: "前四 20% · 10场 · 少量样本" });
  assert.deepEqual(summarize({ ...fixedSample, url: "https://www.metatft.com/explorer?tab=units", conditions: { kind: "core" } }),
    { mean: "—", tone: "limited", sample: "暂无数据" });
  const tiny = { ...fixedSample, games: 2, placementCounts: [1, 0, 0, 0, 0, 0, 0, 1] };
  assert.deepEqual(summarize(tiny), { mean: "4.50", tone: "limited", sample: "2场 · 少量样本" });
  const augment = { ...fixedSample, mean: 7.2, topFourRate: 0.1, referencesAugment: "He's Electric" };
  assert.deepEqual(summarize(augment), { mean: "7.20", tone: "limited", sample: "10场 · 少量样本" });
});
