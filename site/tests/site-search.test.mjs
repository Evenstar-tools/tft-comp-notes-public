import assert from "node:assert/strict";
import { test } from "node:test";
import { guideSearchKey } from "../domain/guide-search.ts";
import { indexedEmblemTerms, rankedWearers, searchNameRank, siteSearchIntent } from "../domain/site-search.ts";

test("short questions keep one item and use the first thing asked to order results", () => {
  assert.deepEqual(siteSearchIntent("鱼骨头给谁？"), {text:"鱼骨头", intent:"holders", excluded:undefined, lowCosts:false});
  assert.deepEqual(siteSearchIntent("我刚拿到一件鱼骨头，能玩什么阵容？"), {text:"鱼骨头", intent:"comps", excluded:undefined, lowCosts:false});
  assert.deepEqual(siteSearchIntent("五杀转给谁？有什么阵容能用？排除洛"), {text:"五杀转", intent:"holders", excluded:"洛", lowCosts:false});
  assert.deepEqual(siteSearchIntent("K/DA 转能玩什么？只看 1–3 费"), {text:"K/DA 转", intent:"comps", excluded:undefined, lowCosts:true});
  assert.equal(siteSearchIntent("K/DA 转芬妮").text,"K/DA 转芬妮");
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
