import test from "node:test";
import assert from "node:assert/strict";
import { attachBoundRegions, duplicatePublishedTeam, reviewIssues, sectionChanges, sameGeneratedSection, isBoardCaption, feishuBoardIssue, attachSectionTeam, findSection, readableSection, sectionTeams, splitSections } from "../domain/document-flow.ts";
import { applyBoardOverrides, applyPublishedBoardEdits, applyPublishedBoardLayouts, boardLayout, publishedBoardContent, publishedBoardEdits, publishedBoardLayouts } from "../domain/published-board-layout.ts";
import { publicationWithBoardRevision } from "../domain/publication-record.ts";

const entry = (id, level, title) => ({ id, level, title, content: { id, type: level ? "heading" : "text", text: title } });
const team = (id, unit) => ({ id, name:id, pieces:[{unitId:unit}], revision:1 });

test("a published workspace edit updates only its source board and survives an unchanged chapter refresh", () => {
  const primary = { id: "main", pieces: [{instanceId:"one",unitId:"ezreal",position:23,stars:2,items:[]}] };
  const reroll = { id: "reroll", pieces: [{instanceId:"two",unitId:"lucian",position:24,stars:1,items:[]}],
    instrumentPositions: { maracas: 5 } };
  const section = { id: "guide", team: primary, teams: [primary, reroll], blocks: [] };
  const updated = { ...reroll, instrumentPositions: undefined,
    pieces: [{...reroll.pieces[0], position:26, stars:2, items:["red"]}],
    conditions:[{kind:"option",augmentId:"small-squad"}] };
  const edit = {sectionId:section.id, teamId:reroll.id, source:publishedBoardContent(reroll), content:publishedBoardContent(updated)};
  const publication = {sections:[section], boardEdits:JSON.parse(JSON.stringify([edit]))};
  const display = applyPublishedBoardEdits(publication,publication).sections[0];
  assert.equal(display.team, primary);
  assert.equal(display.teams[0], primary);
  assert.deepEqual(publishedBoardContent(display.teams[1]),publishedBoardContent(updated));
  assert.deepEqual(publishedBoardEdits([{...section,blocks:[{id:"note",type:"text",text:"更新正文"}]}],publication.boardEdits),publication.boardEdits);
  assert.deepEqual(publishedBoardEdits([{...section,teams:[primary,{...reroll,pieces:[{...reroll.pieces[0],items:["blue"]}]}]}],publication.boardEdits),[]);
});

test("published positions win over reading corrections for one board and yield to new source positions", () => {
  const sourceTeam = { id: "board", pieces: [
    { instanceId: "one", unitId: "ezreal", position: 23, stars: 3, items: ["blue"] },
    { instanceId: "two", unitId: "nasus", position: 2, stars: 3, items: ["stoneplate"] },
  ] };
  const other = { id: "another-guide", blocks: [] };
  const section = { id: "guide", blocks: [{ id: "body", type: "text", text: "正文" }],
    team: sourceTeam, teams: [sourceTeam, { id: "variant", pieces: [] }] };
  const renderedTeam = { ...sourceTeam, pieces: sourceTeam.pieces.map(piece => ({ ...piece, position: piece.position - 1 })) };
  const editedTeam = { ...renderedTeam,
    pieces: renderedTeam.pieces.map(piece => ({ ...piece, position: piece.position + 2 })),
    instrumentPositions: { maracas: 8 } };
  const boardLayouts = [{ sectionId: section.id, teamId: sourceTeam.id, source: boardLayout(sourceTeam), layout: boardLayout(editedTeam) }];
  const publication = { sections: [section, other], boardLayouts };
  const renderedSection = { ...section, team: renderedTeam, teams: [renderedTeam, section.teams[1]] };
  const rendered = { ...publication, sections: [renderedSection, other] };
  const updated = applyPublishedBoardLayouts(publication, rendered);
  assert.deepEqual(updated.sections[0].team, editedTeam);
  assert.deepEqual(updated.sections[0].teams, [editedTeam, section.teams[1]]);
  assert.equal(updated.sections[0].blocks, section.blocks);
  assert.equal(updated.sections[1], other);
  assert.deepEqual(publishedBoardLayouts(publication.sections, boardLayouts), boardLayouts);
  assert.deepEqual(publishedBoardLayouts([renderedSection, other], boardLayouts), []);
});

test("a repository board revision follows new guide content and yields when the original board changes", () => {
  const team = { id: "board", name: "新版棋盘", pieces: [{ instanceId: "one", unitId: "jinx", position: 24, stars: 2, items: [] }],
    instrumentPositions: { maracas: 3 }, conditions: [{ kind: "option", augmentId: "small-squad" }] };
  const edited = { ...team, pieces: [{ ...team.pieces[0], position: 26, items: ["red"] }],
    instrumentPositions: undefined, conditions: undefined };
  const variant = { id: "variant", pieces: [] };
  const current = { id: "new-base", publishedAt: "2026-11-27T00:00:00Z", season: { id: "s19-pbe-19.1c" },
    sections: [{ id: "guide", title: "新版正文", team, teams: [team, variant] }, { id: "new-guide" }] };
  const revision = { kind: "repository-board-revision", id: "edit", previousId: "old-base", publishedAt: "2026-11-26T00:00:00Z",
    boardOverrides: [{ sectionId: "guide", teamId: team.id, edition: "s19-pbe-19.1b",
      source: publishedBoardContent(team), content: publishedBoardContent(edited) }] };
  const live = publicationWithBoardRevision(current, JSON.parse(JSON.stringify(revision)));
  const display = applyBoardOverrides(live);
  assert.equal(display.id, "edit");
  assert.equal(display.publishedAt, current.publishedAt);
  assert.equal(display.sections[0].title, "新版正文");
  assert.equal(display.sections[1], current.sections[1]);
  assert.deepEqual(display.sections[0].teams, [edited, variant]);
  assert.deepEqual(display.sections[0].team, edited);

  const official = { ...team, pieces: [{ ...team.pieces[0], stars: 3 }] };
  const updated = { ...live, sections: [{ ...current.sections[0], team: official, teams: [official, variant] }] };
  assert.equal(applyBoardOverrides(updated).sections[0].team, official);
  assert.equal(applyBoardOverrides({ ...live, season: { id: "s19-live-19.1" } }).sections[0].team, team);
});

test("category headings keep stable identities but only real content can be published", () => {
 const sections = splitSections([entry("intro",undefined,"说明"),entry("c1",1,"连胜"),entry("g1",2,"阵容A"),entry("p1",undefined,"过渡"),entry("c2",1,"次选")]);
 assert.deepEqual(sections.filter(readableSection).map(s=>s.id),["introduction","g1"]);
 assert.equal(sections.find(s=>s.id==="g1").category,"连胜");
 assert.equal(sections.find(s=>s.id==="c1").kind,"category");
});
test("bold Feishu category labels split sections and keep guide IDs and phase anchors", () => {
 const rich = text => [{text_run:{content:text,text_element_style:{bold:true}}}];
 const label = (id,title) => ({...entry(id,undefined,title),content:{id,type:"text",text:title,elements:rich(title)}});
 const sections = splitSections([label("category","1. 连胜成型阵容"),entry("guide",2,"阵容A"),
   label("phase","九级补女枪"),entry("op",undefined,"九级补女枪开双金曲。"),label("next","英雄强化阵容"),entry("hero",2,"阵容B")]);
 assert.equal(findSection(sections,"phase").id,"guide");
 assert.equal(findSection(sections,"guide").category,"连胜成型阵容");
 assert.equal(findSection(sections,"guide").blocks[0].label,true);
 assert.equal(findSection(sections,"hero").category,"英雄强化阵容");
 const raw = [
   {block_id:"root",block_type:1,children:["guide","next","text","image"]},
   {block_id:"guide",block_type:4},{block_id:"next",block_type:2,text:{elements:rich("英雄强化阵容")}},
   {block_id:"text",block_type:2},{block_id:"image",block_type:27},
 ];
 assert.equal(sameGeneratedSection(raw,"root","guide","text","image"),false);
 assert.equal(sameGeneratedSection(raw,"root","next","text","image"),true);
});

test("empty directory separators stay out of the overview while old and renamed Feishu boundaries still bind", () => {
 const bold = (id,title) => ({...entry(id,undefined,title),content:{id,type:"text",text:title,
   elements:[{text_run:{content:title,text_element_style:{bold:true}}}]}});
 for (const label of ["次选成熟阵容", "八级运营", "国风九五", "高能流行与天才慢搜", "芸阿娜慢搜"]) {
   const sections = splitSections([bold("folder",label),entry("empty",undefined," "),
     {id:"line",title:"",content:{id:"line",type:"divider"}},entry("guide",2,"四古典烬")]);
   assert.deepEqual(sections.filter(readableSection).map(s=>s.id), ["guide"]);
   assert.equal(sections[1].category, label);
 }
});

test("legacy generated text can become its verified caption while preserving hand-edit protection", () => {
 const legacy = "【阵容构建器 · board】\n九级 · 补女枪\n9 人口\n烬 2星 · 第4排第1格";
 assert.equal(isBoardCaption("九级 · 补女枪",legacy,"board"),true);
 assert.equal(isBoardCaption("九级 · 补女枪",legacy,"different"),false);
 assert.equal(isBoardCaption("九级 · 手改",legacy,"board"),false);
 assert.equal(isBoardCaption(legacy,legacy,"board"),true);
 assert.equal(isBoardCaption("九级 · 补女枪","九级 · 补女枪","board"),true);
 assert.match(feishuBoardIssue({name:"未命名阵容 · 过渡",pieces:[{}]}), /正式名称/);
 assert.match(feishuBoardIssue({name:"阵容编辑示例（待填）",pieces:[{}]}), /正式名称/);
 assert.match(feishuBoardIssue({name:"四古典烬",pieces:[]}), /摆好阵容/);
 assert.equal(feishuBoardIssue({name:"PBE试阵",pieces:[{}]}),undefined);
 assert.deepEqual(attachBoundRegions([],[{sectionId:"removed",textId:"t",imageId:"i",team:team("board","jhin")}]),[]);
});

test("third-level variant binds to the parent guide and keeps every team", () => {
 const sections = splitSections([entry("c",1,"连胜"),entry("g",2,"阵容"),entry("v",3,"变种"),entry("p",undefined,"说明")]);
 attachSectionTeam(sections,"g",team("a","hero-a"));
 attachSectionTeam(sections,"v",team("b","hero-b"));
 attachSectionTeam(sections,"v",{...team("b","hero-b"),revision:2});
 const guide=findSection(sections,"v");
 assert.equal(guide.id,"g");
 assert.deepEqual(guide.blocks.map(b=>b.id),["v","p"]);
 assert.deepEqual(sectionTeams(guide).map(t=>[t.id,t.revision]),[["a",1],["b",2]]);
 assert.equal(guide.team.id,"a");
});
test("legacy published snapshots remain readable and category-bound teams remain reachable", () => {
 const legacy={id:"old",title:"旧攻略",category:"连胜",blocks:[],team:team("old","hero")};
 assert.equal(readableSection(legacy),true);
 assert.deepEqual(sectionTeams(legacy),[legacy.team]);
 const sections=splitSections([entry("c",1,"连胜"),entry("g",2,"新攻略")]);
 attachSectionTeam(sections,"c",team("legacy-binding","hero"));
 assert.equal(readableSection(sections[0]),true);
 assert.equal(sections[0].id,"c");
});
test("live generated region ownership determines preview, search membership and what can be written", () => {
 const text={id:"t",type:"text"}, image={id:"i",type:"image",imageToken:"img"};
 const guide=(id,blocks)=>({id,title:id,kind:"guide",category:"笔记",blocks});
 const binding={sectionId:"A",textId:"t",imageId:"i",team:team("draft","jinx")};
 for (const [a,b,owner,warns] of [[[text,image],[],"A",false],[[],[{id:"nested",type:"column",children:[text,image]}],"B",true],[[text],[image],null,true],[[],[],null,true]]) {
   const sections=[guide("A",a),guide("B",b)];
   assert.equal(attachBoundRegions(sections,[binding]).length>0,warns);
   assert.deepEqual(sections.filter(s=>sectionTeams(s).some(t=>t.pieces[0].unitId==="jinx")).map(s=>s.id),owner?[owner]:[]);
 }
 const a={...guide("A",[]),team:binding.team}, b={...guide("B",[]),teams:[binding.team]};
 assert.match(duplicatePublishedTeam([a,b]), /同时选择/);
 assert.equal(duplicatePublishedTeam([a,guide("B",[])]),undefined);
 const raw=[{block_id:"root",block_type:1,children:["A","B","col"]},{block_id:"A",block_type:4},{block_id:"B",block_type:4},{block_id:"col",block_type:25,children:["t","i"]},{block_id:"t",block_type:2},{block_id:"i",block_type:27}];
 assert.equal(sameGeneratedSection(raw,"root","B","t","i"),true);
 assert.equal(sameGeneratedSection(raw,"root","A","t","i"),false);
});

test("publishing reconciles body and lineup edits separately and attaches moved boards to both headings", () => {
  const text = {id:"t", type:"text", text:"D 二星烬"};
  const image = {id:"i", type:"image", imageToken:"board"};
  const board = {id:"board", name:"古典烬八级", notes:"", pieces:[{unitId:"jhin",stars:2,position:21,items:["a"]}]};
  const original = { id:"A", title:"四古典烬", category:"连胜", kind:"guide", blocks:[text,image], team:board };
  assert.deepEqual(sectionChanges({...original,blocks:[{...text,text:"烬两星稳血"},image]},original),["正文"]);
  assert.deepEqual(sectionChanges({...original,team:{...board,pieces:[{...board.pieces[0], stars:3}]}},original),["站位星级"]);
  assert.deepEqual(sectionChanges({...original,team:{...board,instrumentPositions:{maracas:5}}},original),["站位星级"]);
  assert.deepEqual(sectionChanges({...original,team:{...board,pieces:[{...board.pieces[0], items:["b"]}]}},original),["配装"]);
  const withCondition = {...original, team:{...board, conditions:[{kind:"option", augmentId:"augment"}]}};
  assert.deepEqual(sectionChanges(withCondition,original),["定阵条件"]);
  assert.deepEqual(sectionChanges({...withCondition, team:{...withCondition.team, conditions:[]}},withCondition),["定阵条件"]);
  const early = { pieces: [{unitId:"varus", position:20, stars:1, items:["a"]}] };
  const withStage = {...original, team:{...board, stages:{early}}};
  const movedInstrument = {...early, instrumentPositions:{maracas:4}};
  assert.deepEqual(sectionChanges({...original, team:{...board, stages:{early:movedInstrument}}},withStage),["站位星级"]);
  const reequipped = { pieces: [{...early.pieces[0], items:["b"]}] };
  assert.deepEqual(sectionChanges({...original, team:{...board, stages:{early:reequipped}}},withStage),["配装"]);
  assert.deepEqual(sectionChanges({...original, team:{...board, stages:{mid:early}}},withStage),["主阵与阶段"]);
  const sections = [{...original,blocks:[],team:undefined},{...original,id:"B",title:"另一篇",team:undefined}];
  const sectionIssues = [];
  const warnings = attachBoundRegions(sections,[{sectionId:"A",textId:"t",imageId:"i",team:board}],issue => sectionIssues.push(issue));
  const {bySection,general} = reviewIssues({sections,warnings,sectionIssues},[original]);
  assert.ok(bySection.get("A")[0].includes("另一篇"));
  assert.deepEqual(bySection.get("A"),bySection.get("B"));
  assert.deepEqual(general,[]);
});
