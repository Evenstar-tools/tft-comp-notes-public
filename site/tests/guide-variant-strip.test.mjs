import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { sectionTeams } from "../domain/document-flow.ts";
import { guideHeaderCoreSample, guidePromotionRows, guideSystemDisplayBoards, guideSystemPhases, guideSystemSample, guideSystems, rankGuideSystems, systemMeanTone } from "../domain/guide-variant-strip.ts";
import { GUIDE_SECTION_IDS } from "../domain/guide-identities.ts";
import { usedPopulation } from "../domain/team.ts";

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
const publication = includeRerollBoards(migrateS19GuideSnapshot(read("public-preview")), season);
const id = suffix => "00000000-0000-4000-8000-00000000" + suffix;
const patch = { seasonId: "s19-pbe", label: "PBE 19.1c", build: "6037882", effectiveAt: "2026-11-26T03:29:46Z" };
const placement = { minGames: 100, greenThrough: 3.4, redFrom: 4.25 };
const metatft = "https://www.metatft.com/explorer?tab=comps";
const {
  oceanGraves, classicalJhin, jazzJinx, edmZeri, hyperpopSeraphine, pentakillKayle,
} = GUIDE_SECTION_IDS;
const row = (sectionId, suffix, name, mean, overrides = {}) => ({
  sectionId, teamId: id(suffix), clusterId: suffix, name, mean, games: 500, topFourRate: 0.55,
  winRate: 0.12, sourceName: "MetaTFT", carryIds: [], url: metatft, ...overrides,
});
// Keep all numerical inputs fixed while exercising the site's authored board IDs and stages.
const family = {
  seasonId: publication.season.id, queue: "PBE", patch: "19.1c", build: patch.build, days: 3,
  updatedAt: "2026-11-27T14:48:18Z",
  rows: [
    row(oceanGraves, "0076", "七海洋扎克男枪", 4.15, { landingTeamId: id("0075") }),
    row(oceanGraves, "1261", "四主宰 AD 男枪", 4.34),
    row(oceanGraves, "0102", "五海洋三离子男枪", 4.38),
    row(oceanGraves, "0093", "五非主流派克男枪", 4.42),
    row(classicalJhin, "0059", "四古典烬", 3.78, { sharedTeamIds: [id("0034")] }),
    row(jazzJinx, "1251", "爵士金克丝", 3.62, { landingTeamId: id("1252") }),
    row("sample-block-0407", "1177", "编舞佛耶戈德莱文", 4.49),
    row("sample-block-0407", "0029", "四酷炫德莱文", 4.63),
    row(edmZeri, "0105", "双电子泽丽", 4.85),
    row(hyperpopSeraphine, "0089", "四主唱高能炸弹", 4.18),
    row("sample-block-0171", "0002", "救生员鳄鱼", 3.75, { heroAugment: true }),
    row("sample-block-0064", "0012", "电能凯南", 4.38, { heroAugment: true, landingTeamId: id("0045") }),
    row(pentakillKayle, "0019", "五杀天使", 4.42, { landingTeamId: id("0064") }),
  ],
};
const settlementMeans = {
  [id("1138")]: 2.93, [id("0034")]: 3.99, [id("0083")]: 3.99, [id("0059")]: 5.30,
  [id("1251")]: 4.04, [id("1253")]: 4.40, [id("1252")]: 5.54,
};
function rate(board) {
  const mean = settlementMeans[board.id];
  if (mean === undefined) return;
  return { population: usedPopulation(board.pieces), games: 500, mean, topFourRate: 0.6, url: metatft };
}

function guide(sectionId, batch = family, reviewedRollingPatch) {
  const section = publication.sections.find(section => section.id === sectionId);
  assert.ok(section);
  const teams = sectionTeams(section);
  const data = section.gameData ?? publication.season;
  const systems = guideSystems(section, batch, data.id, patch, placement.minGames, reviewedRollingPatch);
  const boards = system => teams.filter(board => system.boardIds.includes(board.id));
  return { systems, boards, comparison: system => guidePromotionRows(boards(system), rate, placement) };
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
  assert.deepEqual(kayle.map(system => system.teamId), [id("0064"), "19b143ef-e315-4b8e-8081-31e13a6ec3f0", id("0106")]);
  assert.deepEqual(comparison(kayle[0]).map(row => row.board.id), ["0019", "0064"].map(id));
  const sister = { ...zeri[0], sectionId: "cross-guide", stat: { ...zeri[0].stat, mean: 3.7 } };
  assert.equal(rankGuideSystems([...zeri, sister])[0], sister);
});

test("Kennen opens the authored five-level reroll board within its system", () => {
  const { systems } = guide("sample-block-0064");
  assert.equal(systems.length, 1);
  assert.equal(systems[0].teamId, id("0040"));
  assert(systems[0].boardIds.includes(id("0045")));
  assert.equal(systems[0].stat.name, "电能凯南");
});

test("K/DA Seraphine shows each stage once while an existing legacy link still selects its board", () => {
  const section = publication.sections.find(entry => entry.id === "sample-block-0367");
  assert.ok(section);
  const { systems, boards } = guide(section.id);
  const system = systems.find(entry => entry.boardIds.includes(id("0033")));
  assert.ok(system);
  const allBoards = boards(system);
  const current = allBoards.find(board => board.id === id("0086"));
  const early = allBoards.find(board => board.id === id("0033"));
  assert.ok(current && early);
  const displayed = guideSystemDisplayBoards(section, allBoards, current);
  assert(!displayed.some(board => [id("0033"), id("0115")].includes(board.id)));
  assert(displayed.some(board => board.id === id("0055")));
  const phases = guideSystemPhases(displayed, current, current, []);
  assert.equal(phases.filter(({ team }) => usedPopulation(team.pieces) === 5).length, 1);

  const viewedByLegacyLink = guideSystemDisplayBoards(section, allBoards, early);
  assert(viewedByLegacyLink.includes(early));
  assert(!viewedByLegacyLink.includes(current));
  assert.equal(guideSystemPhases(viewedByLegacyLink, current, early, [])[0].team.id, early.id);
});

test("only current reviewed stats with proper percentages can rank a system", () => {
  const { systems: stale } = guide(oceanGraves, { ...family, build: "stale" });
  assert(stale.every(system => !system.stat));
  assert(stale.find(system => system.teamId === id("1261")).boardIds.includes(id("1262")));

  const rolling = { ...family, spansBuilds: true };
  assert(guide(oceanGraves, rolling).systems.every(system => !system.stat));
  assert.equal(guide(oceanGraves, rolling, "19.1c").systems[0].stat.name, "七海洋扎克男枪");

  for (const rate of [NaN, -0.2, 1.01, 0.7]) {
    const malformed = { ...family, rows: [{ ...family.rows[0], winRate: rate }, ...family.rows.slice(1)] };
    assert.equal(guide(oceanGraves, malformed).systems[0].stat.name, "四主宰 AD 男枪");
  }
});

test("live launch displays qualified ranked evidence as it arrives and preserves authored boards", () => {
  const section = publication.sections.find(entry => entry.id === oceanGraves);
  const edition = "s19-live-19.1.1.7100001";
  const live = { seasonId: "s19-live", label: "19.1", build: "7100001",
    effectiveAt: "2026-12-02T15:00:00Z", launchTransition: true };
  const current = {
    ...family, seasonId: edition, queue: "1100", patch: "19.1", build: live.build,
    updatedAt: "2026-12-02T17:00:00Z", rows: [family.rows[0], { ...family.rows[1], games: 99 }],
  };
  const readSystems = batch => guideSystems(section, batch, edition, live, placement.minGames);
  const empty = readSystems({ ...current, rows: [] });
  const ready = readSystems(current);
  assert.equal(ready.find(system => system.teamId === id("0075"))?.stat?.mean, 4.15);
  assert.equal(ready.find(system => system.teamId === id("1261"))?.stat, undefined);
  for (const batch of [
    { ...current, queue: "PBE" },
    { ...current, build: "7100000" },
    { ...current, updatedAt: "2026-12-02T14:59:00Z" },
    { ...current, spansBuilds: true },
  ]) assert.deepEqual(readSystems(batch), empty);
  assert.deepEqual(new Set(empty.flatMap(system => system.boardIds)), new Set(sectionTeams(section).map(team => team.id)));
});

test("a count-only cluster cannot claim another board or supply its preferred landing", () => {
  const small = row(oceanGraves, "0119", "小样本", 1.5, {
    games: 12, landingTeamId: id("0030"), sharedTeamIds: [id("0030"), id("0075")],
  });
  const { systems } = guide(oceanGraves, { ...family, smallSamples: [small] });
  const cluster = systems.find(system => system.teamId === id("0119"));
  assert.deepEqual(cluster.boardIds, [id("0119")]);
  assert.equal(cluster.stat, undefined);
  assert(systems.some(system => system.teamId === id("0030")));
  assert.equal(systems[0].teamId, id("0075"));
});

test("promotion comparison only shows a mean above 50 games and keeps smaller counts", () => {
  const { systems, boards } = guide(GUIDE_SECTION_IDS.jazzJinx);
  const three = boards(systems[0]);
  const fixedSample = { population: 9, roster: ["zeri"], url: "https://www.metatft.com/explorer?tab=comps", games: 10,
    placementCounts: [0, 0, 0, 2, 0, 4, 2, 2], date: "2026-11-27", patch: "19.1c", window: "3天" };
  const summarize = sample => guidePromotionRows(three, board => board.id === id("1251") ? sample : undefined, placement)
    .find(row => row.board.id === id("1251"))?.stat;
  assert.deepEqual(summarize(fixedSample), { mean: "—", tone: "limited", sample: "10场 · 少量样本" });
  const at50 = { ...fixedSample, games: 50, placementCounts: [0, 0, 0, 50, 0, 0, 0, 0] };
  const at51 = { ...at50, games: 51, placementCounts: [0, 0, 0, 51, 0, 0, 0, 0] };
  assert.deepEqual(summarize(at50), { mean: "—", tone: "limited", sample: "50场 · 少量样本" });
  assert.deepEqual(summarize(at51), { mean: "4.00", tone: "limited", sample: "前四 100% · 51场 · 少量样本" });
  assert.equal(guidePromotionRows(three, () => at50, placement).every(row => row.games === 50 && row.mean === undefined), true);
  // Core/lineup records are rejected from fixed promotion rows
  assert.deepEqual(summarize({ ...fixedSample, url: "https://www.metatft.com/explorer?tab=units", conditions: { kind: "core" } }),
    { mean: "—", tone: "limited", sample: "暂无数据" });
  assert.equal(guidePromotionRows(three, () => undefined, placement).some(row => row.mean !== undefined), false);
  const tiny = { ...fixedSample, games: 2, placementCounts: [1, 0, 0, 0, 0, 0, 0, 1] };
  assert.deepEqual(summarize(tiny), { mean: "—", tone: "limited", sample: "2场 · 少量样本" });
  const augment = { ...at51, mean: 7.2, topFourRate: 0.1, referencesAugment: "He's Electric" };
  assert.deepEqual(summarize(augment), { mean: "7.20", tone: "limited", sample: "51场 · 少量样本" });
  const noted = { ...fixedSample, sampleNote: "已排除 3★ 救生员鳄鱼赌狗（仅计 2★ 鳄鱼 + 2★ 男枪）" };
  assert.equal(guidePromotionRows(three, board => board.id === id("1251") ? noted : undefined, placement)
    .find(row => row.board.id === id("1251"))?.note, noted.sampleNote);
});

test("header core fallback stays on >=100-game full-population core samples and rejects fixed single-level or stale records", () => {
  const { systems, boards } = guide(GUIDE_SECTION_IDS.jazzJinx);
  const [lv8, lv9] = boards(systems[0]);
  const coreSample = { population: 8, roster: ["jinx"], url: "https://www.metatft.com/explorer?tab=units", games: 630,
    mean: 4.15, topFourRate: 0.567, winRate: 0.14, placementCounts: [88, 90, 90, 89, 80, 70, 63, 60], date: "2026-11-28",
    patch: "19.1c", window: "近 3 天", conditions: { kind: "core", teamId: lv8.id, coreRoster: ["jinx"] } };
  const fixedLv9 = { ...coreSample, population: 9, games: 167, mean: 2.88, url: "https://www.metatft.com/explorer?tab=comps&level=9",
    conditions: { kind: "fixed", teamId: lv9.id, population: 9 } };
  // Viewing lv9 shares the system's lv8 core sample and never leaks fixed lv9 mean (2.88) to the header
  assert.equal(guideHeaderCoreSample([lv9, lv8], board => board.id === lv9.id ? fixedLv9 : coreSample, 100)?.mean, 4.15);
  // Small (<100) or historical sourcePeriod records never leak into the header
  assert.equal(guideHeaderCoreSample([lv8], () => ({ ...coreSample, games: 32 }), 100), undefined);
  assert.equal(guideHeaderCoreSample([lv8], () => ({ ...coreSample, sourcePeriod: { patch: "19.1b", window: "历史" } }), 100), undefined);
});
