import test from "node:test";
import assert from "node:assert/strict";
import { augmentBoardSamples, byBestMean, findPlacement, formationComparisonFor, heroAugmentSortingMinGames, isLowWinRate, orderByPlacement, placementEvidenceKind, placementSortTier, remainingPlacements } from "../domain/guide-placement.ts";

test("legacy co-occurrence keeps its own scope even when the query lists all units", () => {
  const url = "https://www.metatft.com/explorer?level=9&unit=DA_Kayle19-1&tab=";
  assert.equal(placementEvidenceKind({ url: url + "units" }), "lineup");
  assert.equal(placementEvidenceKind({ url: url + "comps" }), "fixed");
  assert.equal(placementEvidenceKind({ url: url + "units", conditions: { kind: "full" } }), "lineup");
  assert.equal(placementEvidenceKind({ url: url + "units", conditions: { kind: "core" } }), "core");
  assert.equal(placementEvidenceKind({ url: url + "builds", referencesAugment: "hero augment" }), "augment");
});

test("a formation comparison attaches only to the exact roster, level and edition", () => {
  const group = { edition: "s19-pbe-19.1", population: 2, boards: [{ roster: ["kayle", "smeech"] }] };
  assert.equal(formationComparisonFor([group], "s19-pbe-19.1.0", ["smeech", "kayle"], 2)?.board, group.boards[0]);
  assert.equal(formationComparisonFor([group], "s19-pbe-19.1", ["smeech", "kayle", "bard"], 2), undefined);
  assert.equal(formationComparisonFor([group], "s19-pbe-19.1", ["smeech", "kayle"], 3), undefined);
  assert.equal(formationComparisonFor([group], "s19-19.1", ["smeech", "kayle"], 2), undefined);
});

test("splitting a nested condition subtracts each rank and rejects incompatible buckets", () => {
  const total = [82, 122, 124, 127, 87, 58, 21, 9];
  const subset = [58, 68, 64, 37, 14, 8, 1, 0];
  assert.deepEqual(remainingPlacements(total, subset), [24, 54, 60, 90, 73, 50, 20, 9]);
  assert.equal(remainingPlacements(total, [83, ...subset.slice(1)]), undefined);
  assert.equal(remainingPlacements(total, subset.slice(1)), undefined);
});

test("a family headline uses comparable average placement, keeping the author choice on a tie", () => {
  const first = {rating: {mean: 3.7, winRate: .3}};
  const steadier = {rating: {mean: 3.2, winRate: .1}};
  const small = {rating: {games: 52}};
  const scoped = {rating: {mean: 2.2, sampleScope: "双 C 二星三装"}};
  assert.equal(byBestMean(first, [small, scoped, steadier]), steadier);
  assert.equal(byBestMean(first, [{rating: {mean: 3.7, winRate: .8}}]), first);
  assert.equal(byBestMean(small, [scoped, {rating: undefined}]), small);
});

test("same-guide variants use their own population and full roster; small samples hide the average", () => {
  const batch = { patch: "PBE", window: "最近三天", date: "2026-11-19", minGames: 100, greenThrough: 3.4, redFrom: 4.25, records: [
    { population: 2, roster: ["ahri", "neeko"], games: 12, mean: 1.5, url: "main" },
    { population: 2, roster: ["akali-kda", "neeko"], games: 100, mean: 3.4, url: "variant" },
    { population: 3, roster: ["baron-nashor", "neeko"], games: 200, mean: 4.25, url: "later" },
  ] };
  assert.equal(findPlacement(batch, ["neeko", "ahri"], 2).mean, undefined);
  assert.equal(findPlacement(batch, ["neeko", "akali-kda"], 2).tone, "strong");
  assert.equal(findPlacement(batch, ["neeko", "baron-nashor"], 3).tone, "weak");
  assert.equal(findPlacement(batch, ["neeko", "baron-nashor"], 2), undefined);
  assert.equal(findPlacement(batch, ["neeko", "akali-true-damage"], 2), undefined);
});

test("edition and explicit core conditions prevent attaching the reroll sample to the wrong board", () => {
  const batch = { edition:"s19-pbe-19.1", patch:"PBE 19.1", window:"24 小时", date:"2026-11-19",
    minGames:100, greenThrough:3.4, redFrom:4.25, records:[
      { population:3, roster:["bard","neeko","ziggs"], games:1000, mean:2.2, url:"core",
        sampleScope:"妮蔻吉格斯 · 妮蔻三星", conditions:{kind:"core", coreRoster:["neeko","ziggs"], units:[{unitId:"neeko", stars:3}]} },
      { population:2, roster:["lillia","nasus"], games:250, mean:3.5, url:"hero",
        conditions:{kind:"full", augmentId:"Dancin' n' Prancin'", units:[{unitId:"lillia", stars:3, items:3, itemIds:["a"]}]} },
    ] };
  const piece = (unitId, stars = 1, items = []) => ({unitId, stars, items});
  const edition = "s19-pbe-19.1.0.5973071";
  const core = [piece("neeko",3),piece("ziggs")];
  assert.equal(findPlacement(batch, ["neeko","ziggs"], 2, {edition,pieces:core}).url,"core");
  assert.equal(findPlacement(batch, ["neeko","ziggs"], 2, {edition,pieces:[piece("neeko",2),piece("ziggs")]}),undefined);
  assert.equal(findPlacement(batch, ["neeko","bard"], 2, {edition,pieces:core}),undefined);
  assert.equal(findPlacement(batch, ["neeko","ziggs"], 2, {edition:"s19-19.1",pieces:core}),undefined);
  const heroes = ["lillia","nasus"];
  const option = {edition, augmentId:"Dancin' n' Prancin'", pieces:[piece("lillia",3,["a","b","c"]),piece("nasus")]};
  assert.equal(findPlacement(batch,heroes,2,option).mean,3.5);
  assert.equal(findPlacement(batch,heroes,2,{...option,augmentId:undefined}),undefined);
  assert.equal(findPlacement(batch,heroes,2,{...option,pieces:[piece("lillia",3,["a","b"]),piece("nasus")]}),undefined);
});

test("pre-hotfix observations preserve their date and never displace a fresh board in current rankings", () => {
  const historical = { population: 1, roster: ["jhin"], games: 210, mean: 2.4, url: "old",
    observedOn: "2026-11-20", sourcePeriod: { patch: "PBE 19.1", window: "最近三天" } };
  const current = { population: 1, roster: ["jhin"], games: 22, mean: 3, url: "new" };
  const batch = { patch: "PBE 19.1b", window: "热补后", date: "2026-11-24", minGames: 100, greenThrough: 3.4, redFrom: 4.5,
    records: [historical, current] };
  const lookup = records => findPlacement({ ...batch, records }, ["jhin"], 1);
  assert.equal(lookup(batch.records).url, "new");
  assert.equal(lookup(batch.records).mean, undefined);
  assert.equal(lookup([historical, { ...current, games: 0 }]), undefined);
  const archive = lookup([historical]);
  assert.deepEqual([archive.patch, archive.date, archive.tone], ["PBE 19.1", "2026-11-20", "limited"]);
  assert.equal(orderByPlacement([{rating: archive}, {rating: { mean: 4.8, games: 122 }}])[1].rating, archive);
});

test("an exact-board comparison keeps every requested trait breakpoint", () => {
  const sample = {population:2,roster:["graves","zac"],games:140,mean:3.9,url:"exact",
    conditions:{kind:"full",traits:{"beach-pop":5,"ionic-spark":3}}};
  const batch = {patch:"PBE",window:"近三天",date:"2026-11-21",minGames:100,greenThrough:3.4,redFrom:4.25,records:[sample]};
  const board = {pieces:[],traitLevels:{"beach-pop":5,"ionic-spark":3}};
  assert.equal(findPlacement(batch,sample.roster,2,board)?.mean,3.9);
  assert.equal(findPlacement(batch,sample.roster,2,{...board,traitLevels:{"beach-pop":7,"ionic-spark":3}}),undefined);
  assert.equal(findPlacement(batch,sample.roster,2,{...board,traitLevels:{"beach-pop":5}}),undefined);
});

test("a site-added board shows its own verified full-board sample", () => {
  const roster = ["graves", "zac"];
  const generic = { population: 2, roster, games: 200, mean: 4.8, url: "generic" };
  const exact = { ...generic, url: "bound", conditions: { kind: "full", teamId: "added" } };
  const batch = { patch: "PBE", window: "近三天", date: "2026-11-23", minGames: 100, greenThrough: 3.4, redFrom: 4.25, records: [generic, exact] };
  const board = { pieces: [], teamId: "added", requireBoundFull: true };
  assert.equal(findPlacement(batch, roster, 2, board)?.url, "bound");
  assert.equal(findPlacement(batch, roster, 2, { ...board, teamId: "other" }), undefined);
  assert.equal(findPlacement(batch, ["ashe", "zac"], 2, board), undefined);
});

test("a board-bound core sample wins for guide reading and stays off other boards", () => {
  const pieces = [{ unitId: "ziggs", stars: 3, items: [] }, { unitId: "kobuko", stars: 3, items: [] }];
  const roster = ["kobuko", "ziggs"];
  const full = { population: 2, roster, games: 120, mean: 2.5, url: "full" };
  const core = { ...full, mean: 3, url: "core", conditions: { kind: "core", teamId: "main", coreRoster: roster,
    units: pieces.map(({ unitId, stars }) => ({ unitId, stars })) } };
  const batch = { patch: "PBE 19.1", window: "近三天", date: "2026-11-23", minGames: 100, greenThrough: 3.4, redFrom: 4.25,
    records: [full, core] };
  const board = { teamId: "main", pieces };
  assert.equal(findPlacement(batch, roster, 2, board)?.url, "full");
  assert.equal(findPlacement(batch, roster, 2, { ...board, preferBoundCore: true })?.url, "core");
  assert.equal(findPlacement({ ...batch, records: [core] }, roster, 2, { ...board, teamId: "variant" }), undefined);
  assert.equal(findPlacement({ ...batch, records: [core] }, roster, 2, { ...board, pieces: [{ ...pieces[0], stars: 2 }, pieces[1]] }), undefined);
});

test("a verified hero augment stays separate from exact equipment evidence", () => {
  const name = "He's Electric";
  const build = { teamId: "a", label: "8级成型", kind: "guide" };
  const gear = { unitId: "kennen", stars: 3, items: 3, completedItems: 3, itemIds: ["a","a","b"] };
  const legacy = {population:1,roster:["kennen"],games:8,mean:4.5,url:"legacy",referencesAugment:name,
    conditions:{kind:"full",units:[{unitId:"kennen",stars:3,items:3,completedItems:3}]}};
  const exact = { ...legacy, url:"exact", augmentBuild:build, conditions:{kind:"full",units:[gear]} };
  const noMatches = { ...exact, augmentBuild:{ ...build, teamId:"b" }, games:0, mean:undefined };
  const batch = {patch:"PBE",window:"最近三天",date:"2026-11-20",minGames:100,greenThrough:3.4,redFrom:4.25,records:[
    {population:1,roster:["kennen"],games:14,mean:2.9,url:"ordinary"},
    legacy, exact, noMatches,
    {population:1,roster:["kennen"],games:1,mean:5,url:"verified",
      conditions:{kind:"full",augmentId:name,units:[{unitId:"kennen",stars:3,items:3}]}},
  ]};
  const pieces = [{unitId:"kennen",stars:3,items:["b","a","a"]}];
  const augment = {augmentId:name,teamId:"a",pieces,completedItems:new Set(["a","b","c"])};
  assert.equal(findPlacement(batch,["kennen"],1,{pieces}).mean,undefined);
  assert.equal(findPlacement(batch,["kennen"],1,augment).mean,5);
  assert.equal(findPlacement(batch,["kennen"],1,augment).tone,"limited");
  const lessEvidence = {...batch,records:batch.records.slice(0,-1)};
  assert.equal(findPlacement(lessEvidence,["kennen"],1,augment).url,"exact");
  assert.equal(findPlacement(lessEvidence,["kennen"],1,{...augment,teamId:"b"}),undefined);
  assert.equal(findPlacement(lessEvidence,["kennen"],1,{...augment,pieces:[{...pieces[0],items:["a","b","b"]}]}),undefined);
  assert.equal(findPlacement(lessEvidence,["kennen"],1,{...augment,pieces:[{...pieces[0],stars:2}]}),undefined);
  assert.deepEqual(augmentBoardSamples(batch.records,batch.date)[name].map(({teamId,games}) => [teamId,games]), [["a",8],["b",0]]);
});

test("sorting uses the visible average and keeps the default order for unrated results and ties", () => {
  const rows = [{id:"a"},{id:"b",rating:{mean:4.2}},{id:"c",rating:{mean:1.97}},
    {id:"d",rating:{games:67}},{id:"e",rating:{mean:4.2}}];
  assert.deepEqual(orderByPlacement(rows).map(row => row.id),["c","b","e","a","d"]);
  assert.deepEqual(rows.map(row => row.id),["a","b","c","d","e"]);
});

test("homepage ranking keeps tiny samples visible below the ranked pool and breaks ties with more games", () => {
  const entries = [
    { id:"annie", rating:{mean:1,games:1} },
    { id:"sett", rating:{mean:4.86,games:28} },
    { id:"lillia", rating:{mean:3.5,games:96} },
    { id:"tie", rating:{mean:3.5,games:20} },
    { id:"missing" },
  ];
  assert.deepEqual(orderByPlacement(entries, heroAugmentSortingMinGames).map(x => x.id), ["lillia","tie","sett","annie","missing"]);
  assert.deepEqual(entries.map(x => placementSortTier(x.rating, heroAugmentSortingMinGames)), ["low","ranked","ranked","ranked","missing"]);
  assert.equal(placementSortTier({games:99}), "low");
  assert.equal(placementSortTier({mean:4,games:100}), "ranked");
});

test("only a weak board with enough games and a verified low win rate belongs in the backup group", () => {
  const record = { population: 2, roster: ["ahri", "neeko"], games: 100, mean: 5.25, winRate: 0.03, url: "board" };
  const batch = { patch: "PBE", window: "最近三天", date: "2026-11-20", minGames: 100, greenThrough: 3.4, redFrom: 4.25 };
  const classify = (overrides) => isLowWinRate(findPlacement({ ...batch, records: [{ ...record, ...overrides }] }, record.roster, 2));
  assert.equal(classify({}), true);
  assert.equal(classify({ games: 99 }), false);
  assert.equal(classify({ mean: 3.75 }), false);
  assert.equal(classify({ winRate: 0.05 }), false);
  assert.equal(classify({ winRate: undefined }), false);
});
