import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { primaryFirst, matchGuideTeams, sourceSummary, complementItems, guideFacets, guidePlaystyle, guideRoster, guideBody, guideRoute, guideRollLevel, guideStrategyLabel, guideTitleWithoutPlaystyle, guideUnitMatch, readingNotes, isAuthoringIntroduction, isEditorialSection, parseGuideFilters, guideSectionWithCurrentNames } from "../domain/guide-reading.ts";
import { displayGuideName, displayTraitNames } from "../domain/trait-names.mjs";
import { comboStarMask, comboTierCounts } from "../domain/combo-tiers.ts";
import { guideStyleKey, guideWearerQuery, homeGuideFilter, matchOpeningSearch, openingSearch, searchPhaseNote } from "../domain/guide-search.ts";
import { canRankRecommendations, compareGuideFamilyPerformance, currentFamilyBatch, currentRecommendationEvidence, previousRecommendationDeadline, familyMetricValue, formatRecommendationMean, guideFamilyRows, recommendationGroup, recommendationTier, selectRecommendationRoutes } from "../domain/guide-family-stats.ts";
import { posterShareLink, readPosterShare, validItemLibraryReturn } from "../domain/links.ts";
import { compactGuideParagraph, compactUtilityCopy, rememberGuideCopy } from "../domain/guide-copy.ts";
import { heroGuideIndex } from "../domain/hero-guides.ts";
import { heroAugmentForUnit, heroAugmentProfileLink } from "../domain/hero-augments.ts";
import { validHeroReturn } from "../domain/library-navigation.ts";

const json = file => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const data = json("../data/season.json");
const meta = json("../data/combos-s19-meta.json");
const tiers = json("../data/combo-tiers-s19.json").traits;
const teams = [{id:"jazz",name:"备选",pieces:[{unitId:"bard"},{unitId:"ziggs"}]}, {id:"nine",name:"九人口",pieces:[{unitId:"ziggs"},{unitId:"nidalee"}]}];

test("S19 guide titles and stage labels use current trait names with the original board IDs", () => {
  const guide = { id: "original", title: "四酷炫德莱文", category: "慢搜阵容", primaryTeamId: "draven",
    teams: [{ id: "draven", name: "花式德莱文", webTitle: "7级 · 双花射", pieces: [] }],
    reroll: { stages: [{ teamId: "draven", name: "疾风泽丽" }] },
    blocks: [{ id: "heading", type: "heading", text: "六保镖", elements: [{ text_run: { content: "六保镖" } }] },
      { id: "notes", type: "text", text: "德莱文可以带泰坦的坚决。" }],
  };
  const display = guideSectionWithCurrentNames(guide);
  assert.equal(display.title, "四大触打击乐德莱文");
  assert.equal(display.id, guide.id);
  assert.equal(display.primaryTeamId, guide.primaryTeamId);
  assert.equal(display.teams[0].name, "花式射手德莱文");
  assert.equal(display.teams[0].webTitle, "7级 · 双花式射手");
  assert.equal(display.reroll.stages[0].name, "迅击鼓手泽丽");
  assert.equal(display.blocks[0].elements[0].text_run.content, "六护卫");
  assert.equal(display.blocks[1].text, guide.blocks[1].text);
  assert.equal(guide.title, "四酷炫德莱文");
  assert.equal(displayGuideName("四炫酷德莱文 · 双保镖"), "四大触打击乐德莱文 · 双护卫");
  assert.equal(displayTraitNames("海洋之歌纹章、金曲制作人纹章，泰坦的坚决"), "海之歌纹章、音乐制作人纹章，泰坦的坚决");
  assert.equal(displayGuideName("七海洋扎克男枪"), "七海之歌扎克男枪");
  assert.equal(displayGuideName("8级 · 三海三杀三摇滚"), "8级 · 三海之歌三杀三摇滚恶魔");
  assert.equal(displayGuideName("花式射手 · 情绪摇滚 · 五杀天使 · 七离子金克丝"), "花式射手 · 情绪摇滚 · 五杀天使 · 七离子金克丝");
  assert.equal(displayGuideName(display.title), display.title);
});

test("hero positioning uses the actual linked board and only recommends solo Amumu when adjoining cells are empty", () => {
  const final = { id: "final", name: "8级成型", notes: "", pieces: [] };
  const front = { unitId: "amumu", position: 3, stars: 2, items: ["TFT_Item_Evenshroud", "TFT_Item_WarmogsArmor"] };
  const ally = { unitId: "braum", position: 1, stars: 2, items: [] };
  const stage = { id: "stage", name: "7级四舞者", notes: "", pieces: [front, ally] };
  const guide = { id: "lineup", title: "六舞者佛耶戈", category: "慢搜阵容", kind: "guide",
    primaryTeamId: final.id, teams: [final, stage], blocks: [],
    reroll: { stages: [{ teamId: stage.id, name: stage.name, notes: "", roles: [{ label: "主坦", units: ["amumu"] }] }],
      advice: {}, added: [], corrected: [] } };
  const [entry] = heroGuideIndex([guide], data).amumu;
  assert.equal(entry.boardId, stage.id);
  assert.equal(entry.group, "过渡");
  assert.equal(entry.role, "主坦");
  assert.deepEqual(entry.example, { position: 3, stars: 2, items: front.items, positioning: "前排单顶，开战时身边六格留空。" });
  const together = { ...stage, pieces: [front, { ...ally, position: 4 }] };
  const [adjacent] = heroGuideIndex([{ ...guide, teams: [final, together] }], data).amumu;
  assert.equal(adjacent.example.positioning, undefined);
  const [unknown] = heroGuideIndex([{ ...guide, reroll: undefined }], data).amumu;
  assert.equal(unknown.example.positioning, undefined);
});

test("hero augment skills and recommended gear track all seven current PBE augments", () => {
  const catalog = json("../data/augment-catalog.json");
  const choices = data.units.flatMap(unit => heroAugmentForUnit(unit.id, data.id) ?? []);
  assert.equal(choices.length, 7);
  assert.deepEqual(choices.map(choice => choice.id).sort(), catalog.rows.filter(row => row.kind === "hero").map(row => row.apiName).sort());
  const itemIds = new Set(data.items.map(item => item.id));
  for (const choice of choices) {
    assert.notEqual(choice.baseRole, choice.role);
    assert.ok(choice.ability && choice.gear.length > 0);
    for (const build of choice.gear) {
      assert.equal(build.items.length, 3);
      assert.ok(build.items.every(id => itemIds.has(id)));
    }
    assert.equal(heroAugmentForUnit(choice.unitId, "s19-live-19.1"), undefined);
    assert.equal(validHeroReturn(heroAugmentProfileLink(choice)), heroAugmentProfileLink(choice));
  }
});

test("an augment guide is only an enhanced example for its matching champion", () => {
  const team = { id: "eight", name: "8级成型", notes: "", pieces: [
    { unitId: "kennen", position: 1, stars: 3, items: [] },
    { unitId: "lillia", position: 2, stars: 2, items: [] },
  ] };
  const guide = {
    id: "electric", title: "电能凯南", category: "英雄强化阵容", kind: "guide", teams: [team],
    blocks: [{ type: "text", text: "专属强化：他是电 他是光" }],
  };
  const result = heroGuideIndex([guide], data);
  assert.equal(result.kennen[0].augmentId, "DA_Kennen19_HeroAugment");
  assert.equal(result.lillia[0].augmentId, undefined);
});

test("guide copy removes repeated gear and sentences while keeping swaps and alternate builds", () => {
  const team = { id: "eight", pieces: [
    { unitId: "jhin", items: ["TFT_Item_InfinityEdge", "TFT_Item_Deathblade"] },
    { unitId: "leona", items: [data.items.find(item => item.name === "日炎斗篷").id] },
  ] };
  const seen = new Set();
  rememberGuideCopy("4-2 上八。", seen);
  assert.equal(compactGuideParagraph("4-2上八。锤石两星接肉装。", team, data, seen), "锤石两星接肉装。");
  assert.equal(compactGuideParagraph("主C：烬。无尽、死亡之刃。", team, data, seen), "");
  assert.equal(compactGuideParagraph("主C：烬。无尽、死亡之刃。缺破甲换轻语。", team, data, seen), "烬：缺破甲换轻语。");
  assert.equal(compactGuideParagraph("主C：烬。无尽、轻语。", team, data, seen), "主C：烬。无尽、轻语。");
  const guFeng = { id: "gu-feng", pieces: [
    { unitId: "janna", items: ["TFT_Item_Morellonomicon"] },
    { unitId: "lee-sin", items: ["TFT_Item_Bloodthirster"] },
  ] };
  assert.equal(compactGuideParagraph("副C：迦娜。鬼书。李青接饮血。", guFeng, data, seen), "");
  assert.equal(compactGuideParagraph("副C：迦娜。鬼书。李青两星再接饮血。", guFeng, data, seen), "李青两星再接饮血。");
  const opening = "霞来得早、场面能赢就走四国风。八级用四心之钢打工，先让霞上场做任务。";
  assert.equal(compactGuideParagraph(opening, guFeng, data, seen), opening);
  assert.equal(compactGuideParagraph(opening, guFeng, data, seen, "霞来得早、能连胜再走，八级先做解锁，稳血再上九。"), "八级用四心之钢打工。");
  assert.equal(compactUtilityCopy("日炎补重伤。接敌前站烬同侧。", "leona", team, data), "接敌前站烬同侧。");
  assert.equal(compactUtilityCopy("带日炎，贴对面前排。", "leona", team, data), "贴对面前排。");
  assert.equal(compactUtilityCopy("拿日炎，再考虑卖过渡牌。", "leona", team, data), "拿日炎，再考虑卖过渡牌。");
  assert.equal(compactUtilityCopy("带日炎，贴对面前排。", "jhin", team, data), "带日炎，贴对面前排。");
});

test("guide copy keeps item handoffs and alternative strategies when their equipment list is already shown", () => {
  const guFeng = { id: "00000000-0000-4000-8000-000000000104", pieces: [
    { unitId: "wukong", items: ["TFT_Item_GargoyleStoneplate", "TFT_Item_WarmogsArmor", "TFT_Item_Redemption"] },
  ] };
  const tank = "主坦：孙悟空。石像鬼、狂徒、振奋。八级布隆代持，蕾欧娜先带日炎补重伤。";
  assert.equal(compactGuideParagraph(tank, guFeng, data, new Set()), "孙悟空：八级布隆代持，蕾欧娜先带日炎补重伤。");
  const seen = new Set();
  rememberGuideCopy("卢锡安两星拿霞装，布隆拿肉。孙悟空两星接布隆的肉装。", seen);
  assert.equal(compactGuideParagraph(tank, guFeng, data, seen), "八级蕾欧娜先带日炎补重伤。");
});

test("a shared poster restores an explicit stage selection and keeps earlier board links usable", () => {
  const board = "/guides/lineup?team=board";
  const settings = stages => {
    const url = new URL(posterShareLink(board, "full", stages), "https://test.invalid");
    assert.equal(url.searchParams.get("team"), "board");
    assert.equal(url.searchParams.get("poster"), "1");
    return readPosterShare(url.searchParams.get("posterFormat"), url.searchParams.get("posterStages"));
  };
  assert.deepEqual(settings(["six"]), { format: "full", stageIds: ["six"] });
  assert.deepEqual(settings([]), { format: "full", stageIds: [] });
  assert.deepEqual(settings(undefined), { format: "full", stageIds: undefined });
  assert.deepEqual(readPosterShare("unknown", ["five", "six"]), { format: undefined, stageIds: undefined });
});

test("an equipment-to-guide query keeps the wearer and exact item together and returns to the filtered library", () => {
  assert.deepEqual(guideWearerQuery("金克丝主 C 携带羊刀"), { unit: "金克丝", item: "羊刀", carry: true });
  assert.deepEqual(guideWearerQuery("约里克佩戴狂徒铠甲"), { unit: "约里克", item: "狂徒铠甲", carry: false });
  assert.equal(guideWearerQuery("金克丝主C + 羊刀"), undefined);
  const page = "/items?view=completed&unit=jinx&item=TFT_Item_GuinsoosRageblade&q=鬼索&order=games&exclude=rakan";
  assert.equal(validItemLibraryReturn(page), page);
  assert.equal(validItemLibraryReturn("//evil.invalid/items"), undefined);
  assert.equal(validItemLibraryReturn("/items?view=all&view=completed"), undefined);
});

test("carry search puts the equipped carry ahead of holders, tanks, secondary carries and Thief's Gloves", () => {
  const gear = data.items.filter(item => item.category === "completed" && item.id !== "TFT_Item_ThiefsGloves").slice(0, 3).map(item => item.id);
  const component = data.items.find(item => item.category === "component").id;
  function hit({ id = "pyke", stars = 2, items = gear, label = "主C", sampled = false, transition = false } = {}) {
    return guideUnitMatch({ unitId:id, stars, items }, data.units.find(unit => unit.id === id),
      label ? [{ label, units:[id], text:"配装" }] : [], data.items, { familyCarry:true, transition, sampled });
  }
  assert(hit({ sampled:true }).rank > hit().rank);
  assert(hit().rank > hit({ stars:3 }).rank);
  assert(hit({ id:"ziggs", stars:3 }).rank > hit({ id:"ziggs", stars:2 }).rank);
  assert(hit().rank > hit({ items:[...gear.slice(0,2), component] }).rank);
  for (const next of [{label:"主坦"}, {label:"副C"}, {items:["TFT_Item_ThiefsGloves"]}, {transition:true}]) {
    assert.equal(hit(next).mainCarry, false);
    assert(hit(next).rank < hit().rank);
  }
  assert.equal(hit({label:""}).mainCarry, true);
});

test("rolling level follows board instructions even when the final board has nine units", () => {
  const board = { id:"nine", name:"九人口", notes:"", pieces:[] };
  const section = { primaryTeamId:board.id, blocks:[{ id:"p", type:"text", text:"人口够了就停六追三，九级再补爵士。" }] };
  assert.equal(guideRollLevel(section, board), 6);
  assert.equal(guideRollLevel(section, { ...board, notes:"八级 D 两星烬。" }), 8);
  assert.equal(guideRollLevel({ ...section, blocks:[] }, board), undefined);
  const pyke = { ...section, blocks:[
    { id:"opening", type:"text", text:"八级搜两星男枪和扎克稳血，派克的装备先给奇亚娜。" },
    { id:"strategy", type:"text", text:"打法：速八运营，九级找两星派克。" },
  ] };
  assert.equal(guideRollLevel(pyke, board), 9);
});

test("slow-roll phase buttons resolve to real boards and keep alternate routes separate", () => {
  const board = (id, count) => ({ id, name: id, pieces: Array.from({ length: count }, () => ({ unitId: "ziggs" })) });
  const final = { ...board("00000000-0000-4000-8000-000000000042", 9), webTitle: "九级上限 · 五高能三编舞" };
  const five = board("five", 5);
  const six = board("six", 6);
  const branch = board("branch", 8);
  const branchFive = board("branch-five", 5);
  const teams = [final, five, six, branch, branchFive];
  const stages = [
    { teamId: five.id, name: "5级起搜", notes: "两星吉格斯带一件。", roles: [{ label:"主C", units:["ziggs"] }] },
    { teamId: six.id, name: "6级起搜", notes: "" },
    { teamId: branchFive.id, parentTeamId: branch.id, name: "5级分支", notes: "" },
  ];
  const section = { id:"sample-block-0420", title:"高能流行芬妮&炸弹", primaryTeamId: final.id, teams, blocks: [],
    reroll: { stages, added: [five.id, six.id, branchFive.id], corrected: [], advice: {} } };
  const mainRoute = guideRoute(section, teams, final);
  assert.deepEqual(mainRoute.phases.map(step => step.team.id), ["five", "six", final.id]);
  assert.equal(mainRoute.phases.at(-1).label, "9级上限");
  assert.equal(guideFacets(section, final, data).styleLabel, "1/2费慢搜");
  assert.equal(guideFacets(section, branch, data).styleLabel, undefined);
  assert.deepEqual(guideRoute(section, teams, branchFive).phases.map(step => step.team.id), ["branch-five", "branch"]);
  assert.equal(guideRollLevel(section, six), 6);
  assert.equal(readingNotes(section, five).opening, "两星吉格斯带一件。");
  assert.equal(readingNotes(section, five).roles[0].label, "主C");
  const oldFive = board("old-five", 5);
  const archived = { ...section, teams: [...teams, oldFive], reroll: { ...section.reroll,
    stages: [{ teamId: oldFive.id, equivalentStageId: five.id, name: "5级追三", notes: "" }, ...stages] } };
  assert.deepEqual(guideRoute(archived, archived.teams, final).phases.map(step => step.team.id), ["five", "six", final.id]);
  assert.deepEqual(guideRoute(archived, archived.teams, oldFive).phases.map(step => step.team.id), ["old-five", "six", final.id]);
});

test("published guide variants stay separate from the chronological transition and cap", () => {
  const board = (id, name, size, boardRole) => ({
    id, name, boardRole, notes: "", pieces: Array.from({ length: size }, () => ({ unitId: "xayah" })),
  });
  const eight = board("eight", "8级过渡", 8, "stage");
  const nine = board("nine", "九人口 · 四国风", 9);
  const ten = board("ten", "10级上限", 10, "stage");
  const fortune = board("fortune", "9级 · 女枪", 9, "variant");
  const jazz = board("jazz", "9级 · 双爵士乐", 9, "variant");
  const teams = [nine, eight, fortune, jazz, ten];
  const section = { primaryTeamId: nine.id, teams, blocks: [],
    reroll: { advice: {}, added: [fortune.id, jazz.id, ten.id], corrected: [],
      stages: [eight, fortune, jazz, ten].map(team => ({
        teamId: team.id, parentTeamId: nine.id, name: team.name, boardRole: team.boardRole, notes: team.name + "运营",
      })),
    },
  };
  for (const selected of teams) {
    const route = guideRoute(section, teams, selected);
    assert.deepEqual(route.phases.map(phase => phase.team.id), ["eight", "nine", "ten"]);
    assert.deepEqual(route.choices.map(choice => choice.team.id), ["fortune", "jazz"]);
  }
  assert.equal(readingNotes(section, fortune).opening, "9级 · 女枪运营");
  assert.equal(guideRollLevel(section, ten), undefined);
});

test("the ocean Graves guide retains its published phases when an eight-level branch is added", () => {
  const guide = json("../data/s19-reroll-boards.json").find(entry => entry.sectionId === "sample-block-0251");
  const stage = guide.stages.find(entry => entry.boardRole === "variant");
  const seven = { id: "seven", name: "七级 · 开扎克", pieces: [], notes: "" };
  const eight = { id: stage.parentTeamId, name: "八级 · 艾希", pieces: [], notes: "" };
  const nine = { id: "nine", name: "九级 · 岩雀", pieces: [], notes: "" };
  const variant = { ...stage, id: stage.teamId };
  const teams = [nine, eight, seven, variant];
  const section = { id: guide.sectionId, primaryTeamId: nine.id, teams, blocks: [],
    reroll: { stages: guide.stages, added: [variant.id], corrected: [], advice: {} } };
  for (const selected of [nine, eight, variant]) {
    assert.deepEqual(guideRoute(section, teams, selected).phases.map(step => step.team.id), [seven.id, eight.id, nine.id]);
  }
});

test("a ranked family opens its reviewed board and never transfers a missing variant or older season mean to the main board", () => {
  const batch = { seasonId:"S19", patch:"19.1", days:3, updatedAt:"2026-11-21T15:00:00Z", rows:[
    {sectionId:"ziggs", teamId:"jazz", games:1500, mean:4.1},
    {sectionId:"ziggs", teamId:"retired", games:1250, mean:2.1},
    {sectionId:"jhin", teamId:"nine", games:2000, mean:3.0},
  ]};
  const rows = guideFamilyRows(batch, "S19", "ziggs", [teams[1],teams[0]]);
  assert.deepEqual(rows.map(row=>[row.team.id,row.stat.mean]), [["jazz",4.1]]);
  assert.deepEqual(guideFamilyRows(batch,"S20","ziggs",teams), []);
  const jinx = {...batch,rows:[{sectionId:"jinx",teamId:"nine",landingTeamId:"eight",games:16322,mean:4.11}]};
  const boards = [{id:"eight"},{id:"nine"}];
  const family = guideFamilyRows(jinx,"S19","jinx",boards)[0];
  assert.equal(family.team.id,"nine");
  assert.deepEqual(family.boards.map(t => t.id),["eight","nine"]);
  assert.deepEqual(guideFamilyRows(jinx,"S19","jinx",[boards[0]]),[]);
  assert.deepEqual(guideFamilyRows(jinx,"S19","jinx",[boards[1]])[0].boards,[boards[1]]);
  assert.deepEqual(guideFamilyRows({...jinx,rows:[{...jinx.rows[0],games:99}]},"S19","jinx",boards),[]);
  const variants = [{id:"another-cap"},{id:"new-carry"}];
  const reviewed = {...jinx,rows:[{...jinx.rows[0],sharedTeamIds:["another-cap","retired","eight"]}]};
  assert.deepEqual(guideFamilyRows(reviewed,"S19","jinx",[...variants,...boards])[0].boards.map(t=>t.id),
    ["eight","nine","another-cap"]);
});

test("family performance ranks complete metrics and keeps missing values last in either direction", () => {
  const common = { mean: 4.2, topFourRate: 0.55, winRate: 0.12 };
  const more = { ...common, games: 200, clusterId: "101" };
  const fewer = { ...common, games: 100, clusterId: "103" };
  const earlier = { ...fewer, clusterId: 102 };
  const leader = { ...common, games: 120, mean: 3.8, winRate: 0.2, clusterId: "104" };
  const unknown = { ...common, games: 400, mean: Infinity, topFourRate: 1.1, winRate: null, clusterId: "105" };
  const rank = (metric, direction, totalFinishes) => [unknown, fewer, leader, earlier, more]
    .sort((a, b) => compareGuideFamilyPerformance(a, b, metric, direction, totalFinishes));

  assert.equal(familyMetricValue(more, "pickRate", 1000), 0.2);
  assert.equal(familyMetricValue(more, "pickRate"), null);
  assert.equal(familyMetricValue(more, "pickRate", 0), null);
  assert.equal(familyMetricValue(more, "pickRate", 100), null);
  assert.equal(familyMetricValue(unknown, "topFourRate"), null);
  assert.equal(familyMetricValue(unknown, "winRate"), null);
  assert.deepEqual(rank("mean", "asc"), [leader, more, earlier, fewer, unknown]);
  assert.deepEqual(rank("mean", "desc"), [more, earlier, fewer, leader, unknown]);
  assert.deepEqual(rank("winRate", "desc"), [leader, more, earlier, fewer, unknown]);
  assert.deepEqual(rank("pickRate", "desc", 250), [more, leader, earlier, fewer, unknown]);
});

test("home search normalizes common population, trait and playstyle queries", () => {
  for (const query of ["8人口", "８ 人口", "八级"]) {
    assert.deepEqual(homeGuideFilter(query, data), { kind:"population", value:8 });
  }
  for (const query of ["4古典", "四古典乐", "4 Classical"]) {
    assert.deepEqual(homeGuideFilter(query, data), { kind:"trait", ids:["classical"], value:4 });
  }
  assert.deepEqual(homeGuideFilter("十三星 K/DA", data), { kind:"trait", ids:["k-da"], value:13 });
  assert.deepEqual(homeGuideFilter("速8", data), { kind:"style", value:guideStyleKey("速八运营") });
  assert.equal(homeGuideFilter("八级稳血", data), undefined);
  assert.equal(homeGuideFilter("四古典烬", data), undefined);
  assert.equal(searchPhaseNote({ notes:"八人口备选。先转爵士。" }, "", ""), undefined);
});

test("recommendations compare a single patch window and use the intended roll plan", () => {
  const patch = { build: "6013636", effectiveAt: "2026-11-22T00:53:38Z" };
  const stats = { seasonId: "S19", build: patch.build, updatedAt: "2026-11-22T17:06:44Z", hours: 6 };
  assert.equal(canRankRecommendations(stats, "S19", patch), true);
  assert.equal(canRankRecommendations({ ...stats, hours: 24 }, "S19", patch), false);
  assert.equal(canRankRecommendations({ ...stats, build: "prior" }, "S19", patch), false);
  assert.equal(canRankRecommendations(stats, "S18", patch), false);
  assert.equal(recommendationGroup("低费慢搜", [1, 2], 6), "reroll");
  assert.equal(recommendationGroup("三费慢搜", [3], 7), "reroll");
  assert.equal(recommendationGroup("速八运营", [4], 8), "fast8");
  assert.equal(recommendationGroup("速九运营", [5], 8), "fast9");
  assert.equal(recommendationGroup("慢搜", [4], 8), undefined);
});

test("archive and homepage use the same sample threshold and exact placement cutoff", () => {
  const row = { games: 100, mean: 4.5 };
  assert.equal(recommendationTier(row), "recommended");
  assert.equal(recommendationTier({ ...row, mean: 4.49 }), "recommended");
  assert.equal(recommendationTier({ ...row, mean: 4.503923 }), "secondary");
  for (const missing of [undefined, { ...row, games: 99 }, { ...row, games: 100.1 },
    { ...row, mean: NaN }, { ...row, mean: 0 }, { ...row, mean: 9 }]) {
    assert.equal(recommendationTier(missing), "review");
  }
  assert.equal(formatRecommendationMean(4.5), "4.50");
  assert.equal(formatRecommendationMean(4.503923), "4.504");
  assert.equal(formatRecommendationMean(4.50008), "4.5001");
  assert.equal(formatRecommendationMean(4.5102), "4.51");
});

test("a rolling family batch must match the live edition, queue and patch before grading guides", () => {
  const season = "s19-pbe-19.1.0.5973071";
  const patch = { label: "PBE 19.1a", effectiveAt: "2026-11-22T01:49:44Z" };
  const batch = { seasonId: season, queue: "PBE", patch: "19.1 Nov-20", days: 3, updatedAt: "2026-11-23T09:31:13Z" };
  assert.equal(currentFamilyBatch(batch, season, patch), true);
  for (const changes of [{ seasonId: "s18-pbe" }, { queue: "RANKED" }, { patch: "19.10" },
    { patch: "19.1b" }, { updatedAt: "2026-11-22T00:00:00Z" }, { days: 0 }]) {
    assert.equal(currentFamilyBatch({ ...batch, ...changes }, season, patch), false);
  }
  assert.equal(currentFamilyBatch(batch, season), false);
  assert.equal(currentFamilyBatch(batch, season, { ...patch, seasonId: "s19-live" }), false);
  const live = { ...batch, seasonId: "s19-live", queue: "RANKED", patch: "19.1" };
  assert.equal(currentFamilyBatch(live, live.seasonId, { ...patch, label: "19.1" }), true);
  assert.equal(currentFamilyBatch({ ...live, queue: "PBE" }, live.seasonId, patch), false);
});

test("home recommendations retain the previous verified batch only until 12 hours after rollout", () => {
  const seasonId = "s19-pbe-19.1.0.5973071";
  const patch = { seasonId: "s19-pbe", build: "6018196", label: "PBE 19.1a", effectiveAt: "2026-11-23T19:41:35Z" };
  const previous = { seasonId, queue: "PBE", patch: "19.1 Nov-20", days: 3, updatedAt: "2026-11-23T09:31:13Z" };
  const rollout = Date.parse(patch.effectiveAt);
  const expires = Date.parse("2026-11-24T07:41:35Z");
  assert.equal(previousRecommendationDeadline(previous, seasonId, patch, rollout - 1), undefined);
  assert.equal(previousRecommendationDeadline(previous, seasonId, patch, rollout), expires);
  assert.equal(previousRecommendationDeadline(previous, seasonId, patch, expires - 1), expires);
  assert.equal(previousRecommendationDeadline(previous, seasonId, patch, expires), undefined);
  assert.equal(previousRecommendationDeadline({ ...previous, queue: "RANKED" }, seasonId, patch, rollout), undefined);

  const refreshed = { ...previous, updatedAt: "2026-11-24T01:05:32Z" };
  assert.equal(currentFamilyBatch(refreshed, seasonId, patch), true);
  assert.equal(currentRecommendationEvidence(refreshed, seasonId, patch), false);
  assert.equal(previousRecommendationDeadline(refreshed, seasonId, patch, rollout), undefined);
  const verified = { ...refreshed, build: "6018196", patch: "19.1b" };
  assert.equal(currentRecommendationEvidence(verified, seasonId, patch), true);
  const mixed = { ...verified, spansBuilds: true };
  assert.equal(currentFamilyBatch(mixed, seasonId, patch), true);
  assert.equal(currentRecommendationEvidence(mixed, seasonId, patch), false);
  assert.equal(currentRecommendationEvidence({ ...verified, build: "6014015" }, seasonId, patch), false);
  assert.equal(currentRecommendationEvidence({ ...verified, updatedAt: previous.updatedAt }, seasonId, patch), false);
  const fullWindow = { ...refreshed, updatedAt: "2026-11-27T01:05:32Z" };
  assert.equal(currentRecommendationEvidence(fullWindow, seasonId, patch), true);
});

test("home shared filters keep the first usable text and ignore malformed option values", () => {
  assert.deepEqual(parseGuideFilters({q:["  ", " 烬 ", "艾希"], view:["hero-augments", "regular"], sort:"mean", cost:"7", from:"discarded"}), {
    q:"烬", view:"hero-augments", sort:"mean", cost:"7", category:undefined, style:undefined,
  });
  assert.equal(parseGuideFilters({q:" ".repeat(3)+"啊".repeat(80), cost:"7.5"}).q.length,60);
  assert.equal(parseGuideFilters({ cost:"7.5", sort:"unknown" }).cost, undefined);
  assert.equal(parseGuideFilters({ sort:"unknown" }).sort, undefined);
});

test("archive filters migrate old links without assigning today's tier from a Feishu folder", () => {
  assert.equal(parseGuideFilters({category:"次选成熟阵容"}).category, "次选");
  assert.equal(parseGuideFilters({category:"高费阵容"}).style, "高费运营");
  assert.equal(parseGuideFilters({category:"慢搜阵容",style:"95"}).style, "95");
  assert.equal(parseGuideFilters({category:"纹章阵容",q:"芬妮"}).q, "芬妮 + 纹章");
  assert.equal(parseGuideFilters({category:"英雄强化阵容"}).view, "hero-augments");
  const fallback = parseGuideFilters({category:"连胜成型阵容",q:"霞",cost:"5"});
  assert.equal(fallback.sort, "category");
  assert.equal(fallback.q, "霞");
  assert.equal(fallback.cost, "5");
  assert.equal(fallback.category, undefined);
  assert.equal(parseGuideFilters({category:"自定义旧目录"}).category, undefined);
});

test("home recommendations honor separate 12+2 limits and keep same-carry families with distinct boards", () => {
  const route = (group, index, overrides = {}) => ({
    group, familyId: group + index,
    rating: { teamId: group + index, mean: 4 + index / 100, games: 500, carryId: "ahri", topFourRate: .613, winRate: .17, ...overrides },
  });
  const reroll = Array.from({ length: 4 }, (_, i) => route("reroll", i));
  const fast8 = Array.from({ length: 5 }, (_, i) => route("fast8", i));
  const fast9 = Array.from({ length: 3 }, (_, i) => route("fast9", i));
  const hero = Array.from({ length: 3 }, (_, i) => route("heroAugment", i));
  const authored = { ...fast8[4], conditional: true, decision: { timing: "有法装再进", upgrade: "八级找双两星" } };
  const fixed = { ...route("fast8", 5), sampleLabel: "固定终盘", preferred: true };
  const other = [
    { ...route("fast8", 6), familyId: fast8[0].familyId },
    route("fast9", 3, { games: 99 }),
    route("fast8", 7, { mean: 4.51 }),
    route("fast8", 8, { mean: 4.1 }),
  ];
  const entries = [...reroll, ...fast8.slice(0, 4), authored, fixed, ...fast9, ...hero, ...other];
  const displayOrder = [authored.rating.teamId, ...[...reroll, ...fast8.slice(0, 4), ...fast9].map(r => r.rating.teamId)];
  const selected = selectRecommendationRoutes(entries, { displayOrder });
  assert.deepEqual(selected, [...reroll, authored, ...fast8.slice(0, 4), ...fast9, ...hero.slice(0, 2)]);
  assert.deepEqual(selected[4].decision, { timing: "有法装再进", upgrade: "八级找双两星" });
  assert.equal(selected[4].rating.topFourRate, .613);
  assert.equal(selected[4].rating.winRate, .17);
  assert.ok(selectRecommendationRoutes(entries, { displayOrder: displayOrder.slice(0, -1) }).includes(fixed));
  assert.deepEqual(selectRecommendationRoutes([fast8[0], ...other.slice(0, 3)]), [fast8[0]]);
  assert.deepEqual(selectRecommendationRoutes(hero, { maxHeroAugment: 1 }), [hero[0]]);
});

test("the authoring-only introduction stays off the home index, and an introduction with reader content stays visible", () => {
  const editorTemplate = {
    id: "p",
    type: "text",
    text: "在本篇文档维护 S19 阵容推荐。一级标题用于分类，二级标题用于阵容，三级标题用于变种与运营说明。网页同步后先进入草稿，预览并发布后才对访客可见。",
  };
  const section = { id: "introduction", title: "资料说明", blocks: [editorTemplate] };
  assert.equal(isAuthoringIntroduction(section), true);
  assert.equal(isAuthoringIntroduction({ ...section, blocks: [...section.blocks, { id: "changes", type: "text", text: "更新了艾希的解锁条件。" }] }), false);
});

test("the author's primary survives reordered Feishu blocks and a Bard search links to the matching variant", () => {
  const ordered = primaryFirst(teams, "nine");
  assert.deepEqual(ordered.map(t => t.id), ["nine","jazz"]);
  assert.deepEqual(matchGuideTeams(ordered,data,"巴德").map(t => t.id), ["jazz"]);
  assert.deepEqual(matchGuideTeams(ordered,data,"Ziggs").map(t => t.id), ["nine","jazz"]);
  assert.equal(primaryFirst(teams,"missing")[0].id,"jazz");
  const section = {id:"x", blocks:[{type:"columns",children:[{id:"p",type:"text",text:"改后的原段落"}]}],summaryBlockId:"p"};
  assert.equal(sourceSummary(section),"改后的原段落");
  assert.equal(sourceSummary({...section,summaryBlockId:"moved"}),undefined);
  assert.deepEqual(complementItems(["tear","tear"],"tear"),["tear"]);
  const faceted = {...section,blocks:[{id:"s",type:"text",text:"打法：慢搜"},{id:"c",type:"text",text:"主C：吉格斯"}]};
  assert.deepEqual(guideFacets(faceted,teams[0],data),{style:"慢搜",styleLabel:"1费慢搜",costs:[1]});
});

test("the equipped carry's own route determines the label, even on a higher-population variant", () => {
  const main = { id:"main", name:"8级四保镖", pieces:[{ unitId:"renata-glasc" }] };
  const branch = { id:"branch", name:"8级六保镖", pieces:[{ unitId:"renata-glasc" }, { unitId:"jax" }, { unitId:"nasus" }] };
  const guide = { id:"guide", primaryTeamId:main.id, teams:[main, branch], blocks:[
    { id:"strategy", type:"text", text:"打法：低费慢搜。" },
    { id:"loadout", type:"text", text:"棋盘配装 · 8级六保镖\n主C：烈娜塔·戈拉斯克。蓝霸符。\n副C：贾克斯。泰坦的坚决。\n主坦：内瑟斯。石像鬼石板甲。" },
  ] };
  assert.equal(guideStrategyLabel(guide, branch, data, main), "2费慢搜");
  assert.deepEqual(guideFacets(guide, branch, data).costs, [2]);

  const board = { id:"00000000-0000-4000-8000-000000000104", pieces:[{ unitId:"xayah" }] };
  const fast = { blocks:[{ id:"strategy", type:"text", text:"打法：速九运营。" }] };
  assert.equal(guideStrategyLabel(fast, board, data, board), "9级成型");
});

test("the playstyle remains the same when a ranking uses its own guide title", () => {
  const guide = { id: "zeri", blocks: [{ id: "style", type: "text", text: "打法：速九运营。" }] };
  const tag = guidePlaystyle(guide);
  assert.equal(tag, "95");
  assert.equal(guideTitleWithoutPlaystyle("双电子泽丽 · 95", tag), "双电子泽丽");
  assert.equal(guideTitleWithoutPlaystyle("双电子泽丽", tag), "双电子泽丽");
  assert.equal(guidePlaystyle({ ...guide, title: "示例阵容95", blocks: [] }), undefined);
  assert.equal(parseGuideFilters({ style: "速九运营" }).style, tag);
  assert.deepEqual(homeGuideFilter("95", data), homeGuideFilter("速九", data));
});

test("opening search distinguishes a two-star transition board from an equipped end board or author advice", () => {
  const carry = { unitId: "samira", stars: 2, items: [] };
  const transition = { pieces: [carry], notes: "七级补烈娜塔。两星莎弥拉带烬装。" };
  const wrongStar = { pieces: [{ ...carry, stars: 1 }], notes: "只上一星莎弥拉。" };
  for (const query of ["二星莎弥拉", "两星莎弥拉", "２ 星 莎弥拉", "莎弥拉★★", "★★ Samira"]) {
    const search = openingSearch(query, data);
    assert.equal(matchOpeningSearch(search, transition, "", [], true).rank, 4);
    assert.equal(matchOpeningSearch(search, transition, "", [], false).rank, 3);
    assert.equal(matchOpeningSearch(search, wrongStar, "", [], true).rank, 0);
    const declared = matchOpeningSearch(search, wrongStar, "", ["开局能用两星莎弥拉打工。"], false);
    assert.equal(declared.rank, 2);
    assert.equal(declared.context, "开局能用两星莎弥拉打工。");
  }
  assert.equal(openingSearch("巴德", data), undefined);
  assert.equal(openingSearch("羊刀", data), undefined);
  assert.equal(openingSearch("救生员", data), undefined);
  assert.equal(searchPhaseNote(transition, "两星莎弥拉带烬装。", ""), "七级补烈娜塔。");
});

test("hero nicknames match archived boards and star filters by unit ID", () => {
  const snapshot = { ...data, units: data.units.map(unit => ({ ...unit, aliases: [] })) };
  const examples = [["岩雀", "taliyah"], ["米老鼠", "smeech"], ["瞎子", "lee-sin"], ["奥巴马", "lucian"], ["ez", "ezreal"]];
  const boards = examples.map(([, unitId]) => ({ name: "成型", pieces: [{ unitId, stars: 2 }] }));
  for (const [index, [nickname, unitId]] of examples.entries()) {
    assert.deepEqual(matchGuideTeams(boards, snapshot, nickname), [boards[index]]);
    const search = openingSearch("两星" + nickname, snapshot);
    assert.deepEqual(search.unitIds, [unitId]);
    assert.equal(matchOpeningSearch(search, boards[index], "", [], false).rank, 3);
  }
});

test("an emblem search uses a held emblem or a stated opening requirement, without matching a natural trait", () => {
  const badge = { id: "e-kda", name: "K/DA纹章", traitId: "k-da" };
  const search = openingSearch("KDA 转职", { ...data, items: [...data.items, badge] });
  const normal = { pieces: [{ unitId: "seraphine", items: [] }], notes: "开七星 K/DA。" };
  assert.equal(matchOpeningSearch(search, normal, "没有 K/DA 纹章也能走。", [], false).rank, 0);
  const author = matchOpeningSearch(search, normal, "有 K/DA 纹章再走。", ["注意牌量。"], false);
  assert.equal(author.rank, 2);
  assert.equal(author.context, "有 K/DA 纹章再走。");
  const equipped = { ...normal, pieces: [{ unitId: "seraphine", items: [badge.id] }] };
  assert.equal(matchOpeningSearch(search, equipped, "", [], false).rank, 3);
});

test("the Hyperpop heat advice stays on its original route without becoming the eight-player Jazz board", () => {
  const main = {
    id: "00000000-0000-4000-8000-000000000042",
    name: "五高能三编舞 · 九人口主阵容",
    notes: "九人口主阵容按参考图摆位、配装。三星可酷伯单顶，二星斯维因和盖伦站第二排，底排依次为吉格斯、萨勒芬妮、提莫、崔丝塔娜、璐璐、奈德丽。八人口先用前八人，累计 900 热力后买到一星提莫即可开五高能，九人口补奈德丽开三编舞。九人口成型目标为两星提莫，盖伦、奈德丽按一星展示。",
  };
  const jazz = {id:"00000000-0000-4000-8000-000000000098", name:"备选 · 三爵士吉格斯"};
  const section = {id:"sample-block-0420", team: main, blocks:[
    {id:"heading",type:"text",label:true,text:"解锁与搜牌"},
    {id:"rolling",type:"text",text:"五级慢搜吉格斯、可酷伯。六级上四高能、芬妮、斯维因。"},
    {id:"heat",type:"text",text:"到 900 热力开提莫。"},
    {id:"transition",type:"text",text:"八级热力没满先放加里奥，提莫一星到手就换上。"},
  ]};
  const { phases } = guideRoute(section, [main,jazz], main);
  assert.match(phases.find(step => step.label === "六级慢搜").text,/六级上四高能/);
  const heat = phases.find(step => step.label === "八级等提莫");
  assert.match(heat.text,/900 热力.*加里奥/);
  assert.equal(heat.team, undefined);
  const end = phases.find(step => step.label === "9级上限");
  assert.equal(end.team, main);
  assert.equal(end.text, "九级补奈德丽开三编舞。");
  assert.equal(guideRoute(section, [main,jazz], jazz), undefined);

  const updated = { ...main, notes: "成型后留一张提莫换站位。" };
  assert.equal(guideRoute(section, [updated, jazz], updated).phases.at(-1).text, updated.notes);
});

test("the Hyperpop main board uses the author's current carries in order; its Jazz variant keeps its own roles", () => {
  const main = {
    id: "00000000-0000-4000-8000-000000000042",
    pieces: ["ziggs", "seraphine", "nidalee", "teemo"].map(unitId => ({ unitId })),
  };
  const jazz = { id: "00000000-0000-4000-8000-000000000098", pieces: [{ unitId: "ziggs" }] };
  const source = {
    id: "sample-block-0420",
    primaryTeamId: main.id,
    blocks: [
      { type: "text", id: "sample-block-0418", text: "前期先给已升两星的输出位合装。" },
      { type: "text", id: "sample-block-0169", text: "爵士阵容把法装给吉格斯。" },
    ],
  };
  assert.equal(readingNotes(source, main, data).roles[0].label, "前期输出");
  const current = { ...source, blocks: [...source.blocks,
    { type: "text", id: "new-author-paragraph", text: "主C：萨勒芬妮、吉格斯。谁先两星谁先拿装备。" },
  ] };
  assert.deepEqual(readingNotes(current, main, data).roles[0], {
    label: "主C", units: ["seraphine", "ziggs"], text: "谁先两星谁先拿装备。",
  });
  const alt = readingNotes(current, jazz, data);
  assert.deepEqual(alt.roles.find(role => role.label === "主输出")?.units, ["ziggs"]);
  assert.ok(alt.roles.every(role => !role.units.includes("seraphine")));
});

test("a guide lists equipped carries and tanks before fillers, using its own board and the author's carry order", () => {
  const piece = (unitId, position, items = []) => ({ instanceId: unitId, unitId, position, stars: 2, items });
  const built = ["one", "two", "three"];
  const main = { pieces: [
    piece("kennen", 0), piece("swain", 3, built), piece("ziggs", 23, ["one"]),
    piece("lulu", 21, ["one"]), piece("teemo", 22, built), piece("seraphine", 25, built),
  ] };
  const roles = [
    { label: "主坦", units: ["swain"], text: "" },
    { label: "主C", units: ["seraphine", "ziggs"], text: "" },
  ];
  const order = team => guideRoster(team, data, roles).map(member => member.unit.id);
  const stored = main.pieces.map(member => member.instanceId);
  assert.deepEqual(order(main), ["seraphine", "ziggs", "swain", "teemo", "lulu", "kennen"]);
  assert.deepEqual(main.pieces.map(member => member.instanceId), stored);
  const variant = { pieces: [piece("ziggs", 25), piece("swain", 0), piece("lulu", 24, built), piece("teemo", 20, ["one"])] };
  assert.deepEqual(order(variant), ["lulu", "teemo", "swain", "ziggs"]);
});

test("the selected board uses its own Feishu loadout, and the homepage keeps the operations summary", () => {
  const final = { id: "final", name: "八级", pieces: [{ unitId: "ziggs" }, { unitId: "seraphine" }] };
  const stage = { ...final, id: "stage", name: "五级" };
  const section = { id: "guide", primaryTeamId: final.id, blocks: [
    { id: "ops", type: "text", text: "八级准备成型。" },
    { id: "general", type: "text", text: "主C：吉格斯。物理装。" },
    { id: "equip", type: "text", text: "棋盘配装 · 八级\n主C：萨勒芬妮。青龙刀。\n功能装：吉格斯。日炎斗篷重伤。" },
    { id: "earlier", type: "text", text: "棋盘配装 · 五级\n主C：吉格斯。轻语。\n功能装：吉格斯。轻语破甲。" },
  ] };
  assert.deepEqual(readingNotes(section, final, data).roles.map(role => role.units), [["seraphine"], ["ziggs"]]);
  assert.equal(readingNotes(section, stage, data).roles[1].text, "轻语破甲。");
  assert.equal(readingNotes(section, final, data).opening, "八级准备成型。");
  assert.deepEqual(guideFacets(section, final, data).costs, [2]);
});

test("the verified PBE counts copper at the current tier, respects star masks and filters Jazz separately", () => {
  const roster = ["ziggs","neeko","lucian","tristana","jax","alune","mel","leona"];
  const indices = ids => ids.map(id => meta.units.findIndex(unit => unit.id === id));
  const counts = (ids,mask) => comboTierCounts(indices(ids),mask,meta.units,tiers);
  assert.equal(counts(roster,2).bronze.length,11);
  assert.equal(counts(roster,2).jazz,false);
  assert.equal(counts(roster,0).bronze.length,10);
  const jazz = roster.map(id => id === "jax" ? "bard" : id);
  assert.equal(counts(jazz,2).jazz,true);
  assert.equal(counts(jazz,2).bronze.length,11);
  const members = Array.from({length:3}, () => ({siteTraits:["jazz","edm","beatmaster"]}));
  assert.deepEqual(comboTierCounts([0,1],0,members,tiers).bronze,["jazz"]);
  assert.deepEqual(comboTierCounts([0,1,2],0,members,tiers).bronze,[]);
});

test("bold phase labels preserve variant text after outline cleanup", () => {
 const main = {id:"main",name:"主阵",pieces:[]};
 const variant = {id:"jazz",name:"三爵士吉格斯",pieces:[]};
 const section = {id:"guide",primaryTeamId:"main",teams:[main,variant],
   generatedRegions:{jazz:{textId:"caption",imageId:"image"}},
   blocks:[
    {id:"intro",type:"text",text:"主阵先给芬妮装。"},
    {id:"caption",type:"text",label:true,text:"三爵士标题图文"},
    {id:"image",type:"image",imageToken:"png"},
    {id:"main-tip",type:"text",text:"低费慢搜。"},
    {id:"phase",type:"text",label:true,text:"三爵士吉格斯"},
    {id:"note",type:"text",text:"没解锁芬妮可以转爵士。"},
  ]};
 assert.deepEqual(guideBody(section,variant).current.map(block=>block.id),["phase","note"]);
 assert.ok(guideBody(section,main).current.some(block=>block.id==="main-tip"));
 assert.equal(readingNotes(section,variant).opening,"没解锁芬妮可以转爵士。");
 assert.deepEqual(readingNotes(section,variant).shortcuts,[{label:"三爵士吉格斯",blockId:"phase"}]);
});

test("the empty edit callouts stay private but staffed notes can be read", () => {
 const callout = (id,title,text) => ({
   id,type:"quote",children:[{id:id+"-label",type:"text",text:title},{id:id+"-body",type:"text",text}],
 });
 const section = {id:"introduction",title:"资料说明",blocks:[
   callout("brief","更新预览","待编辑"),callout("meta","环境观察","（待编辑）"),
 ]};
 assert.equal(isEditorialSection(section),true);
 assert.equal(isEditorialSection({...section,blocks:[callout("brief","更新预览","现已进入版本 19.1。")]}),false);
});

test("phase headings and separately named variants select only the relevant operating paragraphs", () => {
  const jazz = {id:"jazz", name:"三爵士吉格斯", pieces:[]};
  const high = {id:"high", name:"高能流行", pieces:[]};
  const transition = {id:"six", name:"六级慢搜", pieces:[]};
  const section = {id:"s", primaryTeamId:high.id, teams:[high,jazz,transition], blocks:[
    {id:"main",type:"text",text:"芬妮先接装。"},
    {id:"step",type:"heading",text:"6级留牌"},
    {id:"six-tip",type:"text",text:"吉格斯两星就能稳血。"},
    {id:"alt",type:"heading",text:"三爵士吉格斯"},
    {id:"alt-tip",type:"text",text:"没解锁芬妮可以转爵士。"},
  ]};
  assert.deepEqual(guideBody(section,jazz).current.map(block => block.id),["alt","alt-tip"]);
  assert.deepEqual(guideBody(section,transition).current.map(block => block.id),["step","six-tip"]);
  assert.deepEqual(guideBody(section,high).current.map(block => block.id),["main"]);
  assert.equal(readingNotes(section,jazz).opening,"没解锁芬妮可以转爵士。");
});

test("owned stars carry into combo imports and an equivalent two-star K/DA card can satisfy the requirement", () => {
  const roster = ["ziggs","neeko","lillia","lucian"].map(id => meta.units.findIndex(unit => unit.id === id));
  const result = comboStarMask(roster, 2, new Set([roster[0],roster[2]]), meta.units);
  assert.deepEqual(result,{mask:5,pending:0});
  assert.deepEqual(comboStarMask(roster,2,new Set([roster[0]]),meta.units),{mask:3,pending:2});
  assert.equal(comboTierCounts(roster,result.mask,meta.units,tiers).activeCount,comboTierCounts(roster,2,meta.units,tiers).activeCount);
});

test("the publishing queue skips historic authoring material and keeps actual update notes", () => {
  const text = { id:"intro", type:"text", text:"2026-11-16：建立 S19 编辑文档。游戏资料仍处于预览阶段，未公布阈值保留 X。" };
  const updates = { id:"changes", title:"更新记录", blocks:[text] };
  assert.equal(isEditorialSection(updates),true);
  assert.equal(isEditorialSection({ ...updates, blocks:[text, { ...text, id:"new", text:"更新四古典烬的配装。" }] }),false);
  assert.equal(isEditorialSection({ ...updates, title:"阵容编辑示例（待填）" }),true);
  assert.equal(isEditorialSection({ ...updates, title:"四古典烬 · 旧棋盘存档" }),true);
  assert.equal(isEditorialSection({ ...updates, title:"四古典烬" }),false);
});
