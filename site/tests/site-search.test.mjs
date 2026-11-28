import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { boardSearchQuery } from "../domain/board-search-query.ts";
import { guideBoardBySearchAlias, guideSearchKey } from "../domain/guide-search.ts";
import { boardPublicSlug, canonicalGuidePath } from "../domain/guide-slugs.ts";
import publication from "../data/public-preview.json" with { type: "json" };
import rerollBoards from "../data/s19-reroll-boards.json" with { type: "json" };
import { heroAugmentSearchQuery } from "../domain/hero-augment-search.ts";
import { emblemSearchNames, makeItemSearchTerms } from "../domain/item-search.ts";
import { hasSevenCostUnit, indexedEmblemTerms, rankedWearerEvidence, rankedWearers, requiresSearchSubmit,
  searchNameRank, selectEquipmentTerminals, siteSearchIntent } from "../domain/site-search.ts";
import season from "../data/season.json" with { type: "json" };
import special from "../data/special-equipment.json" with { type: "json" };

test("short questions keep one item and use the first thing asked to order results", () => {
  assert.deepEqual(siteSearchIntent("鱼骨头给谁？"), {text:"鱼骨头", intent:"holders", excluded:undefined, lowCosts:false});
  assert.deepEqual(siteSearchIntent("我刚拿到一件鱼骨头，能玩什么阵容？"), {text:"鱼骨头", intent:"comps", excluded:undefined, lowCosts:false});
  assert.deepEqual(siteSearchIntent("五杀转给谁？有什么阵容能用？排除洛"), {text:"五杀转", intent:"holders", excluded:"洛", lowCosts:false});
  assert.deepEqual(siteSearchIntent("K/DA 转能玩什么？只看 1–3 费"), {text:"K/DA 转", intent:"comps", excluded:undefined, lowCosts:true});
  assert.equal(siteSearchIntent("K/DA 转芬妮").text,"K/DA 转芬妮");
  assert.equal(siteSearchIntent("我合了羊刀，这把能走哪些阵容").text, "羊刀");
  assert.equal(siteSearchIntent("我合了羊刀，这把能走哪些阵容").intent, "comps");
  assert.equal(siteSearchIntent("那排除史密奇呢").excluded, "史密奇");
  assert.equal(requiresSearchSubmit("我合了羊刀"), true);
  assert.equal(requiresSearchSubmit("那只看八级呢"), true);
  assert.equal(requiresSearchSubmit("那排除史密奇呢"), true);
  assert.equal(requiresSearchSubmit("排除史密奇"), true);
  assert.equal(siteSearchIntent("换成鱼骨头").text, "鱼骨头");
  assert.equal(requiresSearchSubmit("羊刀"), false);
});

test("community names resolve the current item IDs and keep radiant aliases specific", () => {
  const items = [...season.items, ...special.items];
  const terms = makeItemSearchTerms(items, item => [item.name]);
  const exact = query => items.filter(item => searchNameRank(guideSearchKey(query), terms(item)) === 3).map(item => item.id);
  assert.deepEqual(exact("羊刀"), ["TFT_Item_GuinsoosRageblade"]);
  assert.deepEqual(exact("龙刀"), ["TFT_Item_SpearOfShojin"]);
  assert.deepEqual(exact("电刀"), ["DA_Artifact_StatikkShiv"]);
  assert.deepEqual(exact("buff").sort(), ["TFT_Item_BlueBuff", "TFT_Item_RapidFireCannon"]);
  assert.deepEqual(exact("光巨杀"), ["DA_GiantSlayer_Radiant"]);
  const emblem = { name: "五杀乐队纹章" };
  const trait = { id: "pentakill", name: "五杀乐队", nameEn: "Pentakill", aliases: ["五杀摇滚"] };
  const names = indexedEmblemTerms([emblem.name], emblemSearchNames(emblem, trait));
  assert.equal(searchNameRank(guideSearchKey("五杀摇滚转职"), names), 3);
  assert.equal(searchNameRank(guideSearchKey("五杀乐队徽章"), names), 3);
});

test("catalog nicknames resolve a published board without intercepting generic subjects", () => {
  const cases = [
    ["true-damage-senna", "真伤赛娜", "lv7"],
    ["ionic-prodigy-lux", "离子拉克丝", "lv6"],
    ["arcanist-taliyah-vladimir", "隆吸水", "lv8"],
    ["arcanist-taliyah-vladimir", "隆吸水九级", "lv9-nidalee"],
    ["sample-block-0229", "大龙 ９５", "95-lv9"],
    ["sample-block-0251", "四主宰男枪", "4-jugg-graves"],
    ["sample-block-0171", "救生员鳄鱼艾希", "lv8-ashe"],
  ];
  for (const [sectionId, query, slug] of cases) {
    const section = publication.sections.find(section => section.id === sectionId);
    const stages = rerollBoards.find(guide => guide.sectionId === sectionId)?.stages ?? [];
    const boards = [...(section.teams ?? [section.team]), ...stages.map(({ teamId: id }) => ({ id }))];
    const board = guideBoardBySearchAlias(sectionId, boards, query);
    assert.equal(boardPublicSlug(sectionId, board?.id ?? ""), slug, query);
    assert.equal(guideBoardBySearchAlias(sectionId, boards.filter(candidate => candidate.id !== board.id), query), undefined);
  }
  const jazz = publication.sections.find(section => section.id === "sample-block-1090");
  const jazzBoard = guideBoardBySearchAlias(jazz.id, jazz.teams, "牛牛阿萝拉");
  assert.equal(canonicalGuidePath(jazz.id, jazzBoard?.id), "/guides/jazz-pyke-aurora?team=lv8");
  assert.equal(guideBoardBySearchAlias(jazz.id, jazz.teams, "阿萝拉"), undefined);
  const renekton = publication.sections.find(section => section.id === "sample-block-0171");
  assert.equal(guideBoardBySearchAlias(renekton.id, renekton.teams, "救生员鳄鱼"), undefined);
});

test("seven-cost detection checks the complete on-board roster, including off-carries", () => {
  const units = new Map(season.units.map(unit => [unit.id, unit]));
  for (const unitId of ["rakan", "sona", "smeech", "baron-nashor"]) {
    assert.equal(hasSevenCostUnit([{ unitId: "jinx" }, { unitId }], units), true);
  }
  assert.equal(hasSevenCostUnit([{ unitId: "jinx" }, { unitId: "karthus" }], units), false);
});

test("five wearer rows report their ranking basis, and terminals deduplicate by family then board", () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ unitId: String(i), games: 200 + i, mean: 4 }));
  const ranked = rankedWearerEvidence([...rows, { unitId: "null", games: 400, mean: null }], 100);
  assert.equal(ranked.order, "mean");
  assert.deepEqual(ranked.holders.map(row => row.unitId), ["5", "4", "3", "2", "1"]);
  assert.equal(rankedWearerEvidence(rows, 250).order, "games");
  const boards = [
    { id: "9", familyId: "same", mean: 4.2, games: 500 },
    { id: "8", familyId: "same", mean: 4.1, games: 300 },
    { id: "8", familyId: "shared-board", mean: 4.3, games: 400 },
    { id: "variant", familyId: "other", mean: 4.2, games: 400 },
  ];
  assert.deepEqual(selectEquipmentTerminals(boards).map(board => board.id), ["8", "variant"]);
});

test("combined board search preserves the strategy, roster rules and stage across follow-ups", () => {
  const query = boardSearchQuery("84 ＋ 八级 + 七离子 + 金克丝携带羊刀");
  assert.deepEqual(query, { group: "fast8", level: 8, terms: ["七离子", "金克丝携带羊刀"] });
  assert.deepEqual(boardSearchQuery("赌狗 + 三星吉格斯"), { group: "reroll", terms: ["三星吉格斯"] });
  assert.deepEqual(boardSearchQuery("95 + 泽丽 + 排除史密奇"), { group: "fast9", terms: ["泽丽", "排除史密奇"] });
  assert.deepEqual(boardSearchQuery("那只看九级呢", { level: 8, boardLookup: { group: "fast8", terms: query.terms } }),
    { group: "fast8", terms: query.terms, level: 9, inherited: true });
  assert.deepEqual(boardSearchQuery("那排除史密奇呢", { level: 8, boardLookup: { group: "fast8", terms: query.terms } }),
    { group: "fast8", terms: [...query.terms, "排除史密奇"], level: 8, inherited: true });
  assert.equal(boardSearchQuery("那只看八级呢", { item: "TFT_Item_GuinsoosRageblade" }), undefined);
});

test("hero augment aliases and their corresponding heroes share a typed search context", () => {
  const renekton = heroAugmentSearchQuery("救生员", season.units);
  assert.equal(renekton.augments[0].unitId, "renekton");
  assert.equal(heroAugmentSearchQuery("远程奥拉夫", season.units).augments[0].unitId, "olaf");
  assert.equal(heroAugmentSearchQuery("奥拉夫", season.units).augments[0].unitId, "olaf");
  const followup = heroAugmentSearchQuery("那五级呢", season.units, { augmentId: renekton.augments[0].id, level: 8 });
  assert.equal(followup.level, 5);
  assert.equal(followup.inherited, true);
  assert.equal(heroAugmentSearchQuery("鱼骨头", season.units, { augmentId: renekton.augments[0].id }), undefined);
});

test("emblem aliases can match a clean abbreviation without turning a trait team into an item match", () => {
  const emblem = indexedEmblemTerms(["五杀摇滚纹章"], ["pentakill","五杀乐队","五杀"]);
  assert.equal(searchNameRank(guideSearchKey("五杀转"),emblem),3);
  assert.equal(searchNameRank(guideSearchKey("Pentakill"),emblem),3);
  assert.equal(searchNameRank(guideSearchKey("五杀天使"),emblem),0);
});

test("holder averages use individual sample counts and sort qualified rows by placement", () => {
  const fishbones = [
    {unitId:"graves",games:130,mean:2.65},
    {unitId:"jinx",games:157,mean:4.33},
    {unitId:"lucian",games:28,mean:1.7},
  ];
  assert.deepEqual(rankedWearers(fishbones,100).map(x=>x.unitId),["graves","jinx"]);
  assert.deepEqual(rankedWearers(fishbones,200).map(x=>[x.unitId,x.games,x.mean]),
    [["jinx",157,undefined],["graves",130,undefined],["lucian",28,undefined]]);
});

test("equipment lookup collapses to single column and compact footer when no carries or terminals exist", () => {
  const source = readFileSync(new URL("../components/SiteSearchResults.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const require = createRequire(import.meta.url);
  const stubs = new Map([["./HeroAugmentSearchCard", { HeroAugmentSearchCard: () => null }], ["./site-search-results.css", {}]]);
  const mod = {};
  new Function("require", "exports", outputText)(id => stubs.get(id) ?? require(id), mod);
  const holder = { id: "mel", name: "梅尔", href: "/units/mel", games: 2313, mean: 3.05 };
  const baseHit = { id: "emblem", name: "非主流纹章", href: "/items/emblem", detail: "纹章", gear: {
    type: "emblem", totalGames: 45887, holderOrder: "mean", holders: [holder], carries: [], examples: [],
    routeNote: "暂无实戴这件装备的已发布棋盘。",
  } };
  const collapsed = renderToStaticMarkup(createElement(mod.SiteSearchResults, {
    search: { phase: "ready", result: { query: "非主流转", intent: "holders", groups: [{ kind: "items", title: "装备与纹章", hits: [baseHit] }] } },
  }));
  assert.match(collapsed, /data-single-column="true"/);
  assert.doesNotMatch(collapsed, /主 C 候选|阵容终盘/);
  assert.match(collapsed, /site-lookup-empty-route/);
  const fullHit = { ...baseHit, gear: { ...baseHit.gear, carries: [{ id: "sera", name: "萨勒芬妮", href: "/guides/kda", games: 312, mean: 3.92 }],
    examples: [{ id: "kda", name: "K/DA 萨勒芬妮", href: "/guides/kda", games: 312, mean: 3.92 }] } };
  const expanded = renderToStaticMarkup(createElement(mod.SiteSearchResults, {
    search: { phase: "ready", result: { query: "KDA转", intent: "holders", groups: [{ kind: "items", title: "装备与纹章", hits: [fullHit] }] } },
  }));
  assert.doesNotMatch(expanded, /data-single-column=/);
  assert.match(expanded, /主 C 候选/);
  assert.match(expanded, /阵容终盘/);
});
