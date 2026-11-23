import test from "node:test";
import assert from "node:assert/strict";
import { changeSignals, compareBoards, sourceProfile, makeReviewQueue } from "../scripts/family-review.mjs";
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
