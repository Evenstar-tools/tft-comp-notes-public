import test from "node:test";
import assert from "node:assert/strict";
import { changeSignals, compareBoards, exactFamilyBoardSignature, matchBoundCluster, sourceProfile, makeReviewQueue } from "../scripts/family-review.mjs";
import { crossCheck } from "../scripts/family-evidence.mjs";

const meta = {set:"S19",queue:"PBE",patch:"19.1 Nov-20",days:3,model:427};
const sample = (id,mean,games=160,pick=.2)=>({id,mean,games,roster:"1,2",playersPerLobby:pick});
const before={...meta,updatedAt:"2026-11-20T10:00:00Z",allGroups:[sample("a",4.5),sample("small",7,1)]};
const after={...meta,updatedAt:"2026-11-21T10:00:00Z",allGroups:[sample("a",4.2,180,.35),sample("small",1,1),sample("new",3,1)]};
test("同口径分开报均名与登场，小样本保留场数，换补丁另建基线",()=>{
  const result=changeSignals(before,after);
  assert.deepEqual(result.signals.map(s=>[s.id,s.reasons,s.after.games]),[["a",["均名变好","登场上涨"],180],["new",["新增分组"],1]]);
  assert.equal(changeSignals(before,{...after,patch:"19.1b"}).signals.length,0);
  assert.equal(changeSignals(after,after).signals.length,0);
});
test("同九人看携装分工与停级，英雄强化和转职分别复核",()=>{
  const units=["pyke","mf","zac","vi","yorick","graves","taric","eve","aurora"];
  const group={units_string:units.join(", "),levelling:"lvl 7",builds:[
    {unit:"pyke",num_items:3,buildName:["DA_Deathblade","DA_EdgeOfNight","DA_HandOfJustice"],count:20},
    {unit:"zac",num_items:3,buildName:["DA_BrambleVest","DA_WarmogsArmor","DA_SunfireCape"],count:18},
    {unit:"mf",num_items:3,buildName:["DA_ThiefsGloves","unused","unconfirmed"],count:1}]};
  const stable={sectionId:"p",teamId:"p",guide:"派克",units,rollLevel:7,roles:[{label:"主C",units:["pyke"]},{label:"主坦",units:["zac"]}]};
  const other={...stable,teamId:"mf",rollLevel:9,roles:[{label:"主C",units:["mf"]}]};
  const ids = new Map(units.map(id=>[id,id]));
  const res=compareBoards(sourceProfile(group,ids),[other,stable]);
  assert.equal(res[0].teamId,"p");assert.equal(res[1].rollConflict,true);
  assert.ok(!res[1].matchedCarries.length);
  const q=makeReviewQueue({...after,allGroups:[sample("x",3)]},[stable,{...other,special:"英雄强化"},{...other,special:"转职"}],{x:group},ids,[],[],[]);
  assert.deepEqual(q.special.map(s=>s.kind),["英雄强化","转职"]);assert.equal(q.normal[0].neighbors.length,1);
});
test("单局吃鸡或同站重复引用不能完成交叉核实",()=>{
  const e={...meta,id:"x",sourceUpdatedAt:after.updatedAt,secondSource:{url:"https://www.metatft.com/pbe-comps",patch:meta.patch,finding:"同盘",matchesBuild:true},
    player:{name:"a",rank:"rank",rankUrl:"https://example.com/player",matches:[{url:"https://example.com/game",id:"1",patch:meta.patch,queue:"PBE",placement:1,carry:"pyke",items:["a","b","c"],sameBuild:true,playerName:"a"}]}};
  assert.equal(crossCheck([e],{id:"x"},after).status,"待交叉核对");
  e.secondSource.url="https://www.datatft.com/explorerForPBE"; e.player.matches.push({...e.player.matches[0],id:"2",placement:7});
  assert.equal(crossCheck([e],{id:"x"},after).status,"可人工决定收录");
});
test("站主换人后的主盘和共用盘分别用本轮来源名单核验", () => {
  const roster = ["braum", "draven", "gragas", "kai-sa", "leona", "lillia", "samira"];
  const group = { units_string: roster.map(id => "API_" + id).join(", "), levelling: "lvl 7" };
  const unitIds = new Map([...roster, "thresh", "baron-nashor"].map(id => ["API_" + id, id]));
  const carries = ["draven", "kai-sa"];
  const board = (units, overrides = {}) => ({
    units, familyQueryEligible: true, rollLevel: 7,
    querySignature: JSON.stringify([units.length, [...units].sort()]),
    roles: [{ label: "主C", units: ["draven"] }], ...overrides,
  });
  const matching = board([...roster].reverse());
  const mismatched = board([...roster.slice(0, -1), "thresh"]);
  assert.deepEqual([matching, mismatched].map(team => exactFamilyBoardSignature(team, group, unitIds, carries)),
    [matching.querySignature, undefined]);
  assert.equal(exactFamilyBoardSignature(matching, {
    ...group, units_string: group.units_string + ", API_braum",
  }, unitIds, carries), undefined);
  assert.equal(exactFamilyBoardSignature(matching, {
    ...group, units_string: group.units_string.replace("API_braum", "API_unknown"),
  }, unitIds, carries), undefined);
  assert.equal(exactFamilyBoardSignature(board(roster, { familyQueryEligible: false }), group, unitIds, carries), undefined);
  assert.equal(exactFamilyBoardSignature(board(roster, { rollLevel: 6 }), group, unitIds, carries), undefined);

  const baronRoster = [...roster.slice(0, -1), "baron-nashor"];
  const baronSource = { ...group, units_string: baronRoster.map(id => "API_" + id).join(", ") };
  const baronSignature = JSON.stringify([8, [...baronRoster].sort()]);
  assert.equal(exactFamilyBoardSignature(board(baronRoster, { querySignature: baronSignature }), baronSource, unitIds, carries),
    baronSignature);
  assert.equal(exactFamilyBoardSignature(board(roster, { roles: [{ label: "主C", units: ["samira"] }] }),
    group, unitIds, carries), undefined);
});

test("代表盘兼容 1–2 张挂件微调，主 C 丢失或大幅换阵必须阻断",()=>{
  const mapPairs = [
    ["DA_Amumu19","amumu"],["DA_Briar19","briar"],["DA_Camille19","camille"],["DA_Garen19","garen"],
    ["DA_Kayn19","kayn"],["DA_Viego19","viego"],["DA_Yasuo19","yasuo"],["DA_Yone19","yone"],
    ["DA_Galio19","galio"],["DA_Jhin19","jhin"],["DA_KSante19","k-sante"],["DA_Lucian19","lucian"],
    ["DA_Mel19","mel"],["DA_Nasus19","nasus"],["DA_Smeech19","smeech"],["DA_Thresh19","thresh"],
    ["DA_Vladimir19","vladimir"],["DA_Gragas19","gragas"],["DA_Olaf19","olaf"],["DA_Swain19","swain"],
  ];
  const unitIds = new Map(mapPairs);
  const viegoBinding = {
    clusterId: "429002",
    carryIds: ["viego", "briar"],
    representativeUnits: ["DA_Amumu19","DA_Briar19","DA_Camille19","DA_Garen19","DA_Kayn19","DA_Viego19","DA_Yasuo19","DA_Yone19"],
  };
  // Exact match
  assert.equal(matchBoundCluster(viegoBinding, { units_string: viegoBinding.representativeUnits.join(", ") }, unitIds).status, "exact");
  // Real 429002 case: 8-level Garen dropped from 7-unit representative board -> tolerated drift
  const droppedGaren = matchBoundCluster(viegoBinding, {
    units_string: "DA_Amumu19, DA_Briar19, DA_Camille19, DA_Kayn19, DA_Viego19, DA_Yasuo19, DA_Yone19",
  }, unitIds);
  assert.equal(droppedGaren.ok, true);
  assert.equal(droppedGaren.status, "drift");
  assert.deepEqual(droppedGaren.removed, ["DA_Garen19"]);

  // Secondary variant carry not on representative board (429003 Jhin + MF) still tolerates 1 filler swap as long as Jhin stays
  const jhinBinding = {
    clusterId: "429003",
    carryIds: ["jhin", "miss-fortune"],
    representativeUnits: ["DA_Galio19","DA_Jhin19","DA_KSante19","DA_Lucian19","DA_Mel19","DA_Nasus19","DA_Smeech19","DA_Thresh19","DA_Vladimir19"],
  };
  const swappedFiller = matchBoundCluster(jhinBinding, {
    units_string: "DA_Galio19, DA_Jhin19, DA_KSante19, DA_Lucian19, DA_Mel19, DA_Nasus19, DA_Smeech19, DA_Thresh19, DA_Gragas19",
  }, unitIds);
  assert.equal(swappedFiller.ok, true);
  assert.equal(swappedFiller.status, "drift");

  // Carry dropped -> must reject
  const missingCarry = matchBoundCluster(viegoBinding, {
    units_string: "DA_Amumu19, DA_Briar19, DA_Camille19, DA_Garen19, DA_Kayn19, DA_Gragas19, DA_Yasuo19, DA_Yone19",
  }, unitIds);
  assert.equal(missingCarry.ok, false);

  // >=3 units changed -> must reject
  const majorRewrite = matchBoundCluster(viegoBinding, {
    units_string: "DA_Briar19, DA_Viego19, DA_Yasuo19, DA_Yone19, DA_Galio19, DA_Gragas19, DA_Olaf19, DA_Swain19",
  }, unitIds);
  assert.equal(majorRewrite.ok, false);

  // Undefined unit mapping or carry-role takeover during drift -> must reject
  const unmappedIds = new Map([...unitIds, ["DA_Mystery19", undefined]]);
  assert.equal(matchBoundCluster(viegoBinding, {
    units_string: "DA_Amumu19, DA_Briar19, DA_Camille19, DA_Mystery19, DA_Kayn19, DA_Viego19, DA_Yasuo19, DA_Yone19",
  }, unmappedIds).ok, false);

  const hijackedCarry = matchBoundCluster(viegoBinding, {
    units_string: "DA_Amumu19, DA_Briar19, DA_Camille19, DA_Kayn19, DA_Viego19, DA_Yasuo19, DA_Yone19",
    builds: [{ unit: "DA_Yasuo19", num_items: 3, buildName: ["DA_InfinityEdge", "DA_HandOfJustice", "DA_Bloodthirster"], count: 500 }],
  }, unitIds);
  assert.equal(hijackedCarry.ok, false);
  assert.equal(hijackedCarry.reason, "代表棋盘与主C配装有变");
});
