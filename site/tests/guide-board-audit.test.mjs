import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boardNeighbors } from "../domain/board-layout.ts";
import { traitCounts } from "../domain/team.ts";
import { sectionTeams } from "../domain/document-flow.ts";
import { guideBody, guideFacets, guidePlaystyle, guideRollLevel, guideRoster, guideUnitMatch, isBoardLoadout, readingNotes, sourceSummary } from "../domain/guide-reading.ts";
import { heroAugmentForGuide } from "../domain/hero-augments.ts";
import { allGuideIds, auditGuideBoard, auditGuideCopy, auditGuidePublication, featuredGuideIds, prepareAuditPublication } from "../scripts/audit-guide-boards.mjs";
import guidePositionReferences from "../scripts/guide-position-references.json" with { type: "json" };
import { buildFamilyCatalog } from "../scripts/export-family-catalog.mjs";

const preview = readData("public-preview");
const recommendations = readData("patch-recommendations");
const stoneplate = "TFT_Item_GargoyleStoneplate";
const spectral = "TFT_Item_SpectralGauntlet";
const ionic = "TFT_Item_IonicSpark";
const whisper = "TFT_Item_LastWhisper";
const data = {
  units: [{ id: "ashe", attackRange: 4 }, ...["amumu", "viego", "briar", "zac", "gwen", "lux", "mel", "olaf"].map(id => ({ id }))],
  items: [stoneplate, spectral, ionic, whisper].map(id => ({ id })),
};

function readData(name) {
  return JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
}

test("every published board equips its main carries and tanks", () => {
  const publication = prepareAuditPublication(preview);
  const incomplete = [];
  for (const section of publication.sections) {
    const gameData = section.gameData ?? publication.season;
    for (const team of sectionTeams(section)) {
      const roster = guideRoster(team, gameData, readingNotes(section, team, gameData).roles);
      const label = section.title + " / " + team.name;
      const carries = roster.filter(member => ["主C", "主输出", "前期输出"].includes(member.role));
      const tanks = roster.filter(member => member.role === "主坦");
      if (!carries.length || !tanks.length) incomplete.push(label + " 缺主C或主坦");
      for (const { piece, unit } of [...carries, ...tanks]) {
        const valid = piece.items.every(id => gameData.items.some(item => item.id === id && item.category !== "component"));
        const full = piece.items.length === 3 || (piece.items.length === 1 && piece.items[0] === "TFT_Item_ThiefsGloves");
        if (!full || !valid) incomplete.push(label + " / " + unit.name);
      }
    }
  }
  assert.deepEqual(incomplete, []);
});

function piece(unitId, position, ...items) {
  return { unitId, instanceId: unitId, position, stars: 2, items };
}

function inspect(pieces, carry, tank, secondary) {
  const roles = [{ label: "主C", units: [carry] }, { label: "主坦", units: [tank] }];
  if (secondary) roles.push({ label: "副C", units: [secondary] });
  return auditGuideBoard({ pieces }, roles, data).map(issue => issue.rule);
}

test("Amumu solo-tanks at pos 4 with every adjacent hex free and the carry on the right edge", () => {
  assert.deepEqual(boardNeighbors(4), [3, 5, 10, 11]);
  const tank = piece("amumu", 4, spectral);
  const carry = piece("viego", 13);
  assert.deepEqual(inspect([tank, carry, piece("briar", 12)], "viego", "amumu", "briar"), []);
  assert.deepEqual(inspect([tank, piece("ashe", 27)], "ashe", "amumu"), []);
  assert.ok(inspect([{ ...tank, position: 3 }, carry], "viego", "amumu").includes("amumu-position"));
  assert.ok(inspect([tank, carry, piece("zac", 0)], "viego", "amumu").includes("amumu-front-row"));
  for (const position of boardNeighbors(4)) {
    assert.ok(inspect([tank, carry, piece("zac", position)], "viego", "amumu").includes("amumu-adjacent"));
  }
  assert.ok(inspect([tank, { ...carry, position: 7 }], "viego", "amumu").includes("amumu-carry-side"));
  assert.ok(inspect([tank, { ...carry, position: 11 }], "viego", "amumu").includes("amumu-carry-side"));
});

test("stoneplate spacing, front-line shred and carry safety use the active board", () => {
  const tank = piece("zac", 3, stoneplate);
  const carry = piece("ashe", 27);
  assert.deepEqual(inspect([tank, carry, piece("amumu", 5, spectral), piece("mel", 10, ionic), piece("gwen", 12)], "ashe", "zac", "gwen"), []);
  assert.ok(inspect([tank, carry, piece("amumu", 2), piece("gwen", 4)], "ashe", "zac").includes("stoneplate-crowded"));
  assert.ok(inspect([{ ...tank, position: 8 }, carry], "ashe", "zac").includes("stoneplate-front"));
  assert.ok(inspect([tank, carry, piece("amumu", 1, ionic)], "ashe", "zac").includes("shred-side"));
  assert.ok(inspect([tank, carry, piece("amumu", 8, spectral)], "ashe", "zac").includes("shred-side"));
  assert.ok(inspect([tank, { ...carry, position: 20 }], "ashe", "zac").includes("long-range-carry"));
  assert.ok(inspect([tank, carry, piece("gwen", 1)], "ashe", "zac", "gwen").includes("melee-flank"));
});

test("alternate pieces have their own unique IDs and legal equipment and can never repeat an active or stacked unit", () => {
  const tank = piece("zac", 3, spectral);
  const carry = piece("ashe", 27);
  const fighter = piece("gwen", 12);
  const withAlternate = (main, unitId, instanceId = unitId, items = []) => ({ ...main,
    alternate: { unitId, instanceId, stars: 2, items } });
  assert.deepEqual(inspect([tank, withAlternate(carry, "lux"), withAlternate(fighter, "mel")], "ashe", "zac"), []);
  assert.ok(inspect([withAlternate(tank, "olaf"), withAlternate(carry, "lux"), withAlternate(fighter, "mel")], "ashe", "zac").includes("alternate-limit"));
  assert.ok(inspect([tank, withAlternate(carry, "gwen"), fighter], "ashe", "zac").includes("duplicate-alternate"));
  assert.ok(inspect([tank, withAlternate(carry, "lux"), withAlternate(fighter, "lux", "second")], "ashe", "zac").includes("duplicate-alternate"));
  assert.ok(inspect([tank, withAlternate(carry, "lux", "gwen"), fighter], "ashe", "zac").includes("alternate-instance-id"));
  assert.ok(inspect([tank, withAlternate(carry, "lux", "sub"), withAlternate(fighter, "mel", "sub")], "ashe", "zac").includes("alternate-instance-id"));
  assert.ok(inspect([tank, withAlternate(carry, "unknown")], "ashe", "zac").includes("invalid-alternate"));
  assert.ok(inspect([tank, withAlternate(carry, "lux", "sub", ["unknown"])], "ashe", "zac").includes("invalid-item"));
  assert.ok(inspect([tank, piece("ashe", 27, whisper, "unknown")], "ashe", "zac").includes("invalid-item"));
  assert.ok(inspect([tank, piece("ashe", 27, whisper)], "ashe", "zac").includes("duplicate-sunder"));
  assert.deepEqual(inspect([tank, withAlternate(carry, "lux", "sub", [whisper])], "ashe", "zac"), []);
});

test("the copy audit catches obsolete claims and preserves linked fixed-board samples on the active patch", () => {
  const { patch, bPatch } = readData("current-patch").metaTftPatch;
  const sampleURL = `https://www.metatft.com/explorer?tab=comps&level=9&queue=PBE&patch=${patch}&b_patch=${bPatch}&days=3`;
  const sampleCopy = `PBE ${patch}${bPatch} 近三天 · 九人口成型盘 8 场。点击查样本。`;
  const blocks = [
    { id: "unlock", text: "开摇滚上场打满三回合，解锁薇恩。" },
    { id: "sample", text: "PBE 19.1 · 159 场 · 均名 5.81。" },
    { id: "correct", text: "七级不同名摇滚或花式棋子合计五星开薇恩。" },
    { id: "linked-current", text: sampleCopy, elements: [{ text_run: { text_element_style: { link: { url: sampleURL } } } }] },
    { id: "unlinked-current", text: sampleCopy },
    { id: "threshold-tag", text: "【特殊运营门槛】高经济速九局才进。" },
  ];
  assert.deepEqual(auditGuideCopy({ blocks }).map(({ rule, blockId }) => [rule, blockId]),
    [["obsolete-unlock", "unlock"], ["obsolete-stats", "sample"], ["obsolete-stats", "unlinked-current"], ["bracket-threshold-tag", "threshold-tag"]]);
  for (const section of preview.sections) {
    assert.deepEqual(auditGuideCopy(section).filter(issue => issue.rule === "bracket-threshold-tag"), [], section.id);
  }
});

test("the copy audit rejects video links in visible text, rich links, nested blocks and route notes", () => {
  const section = {
    blocks: [
      { id: "bare", text: "参考 b23.tv." },
      { id: "rich", elements: [{ text_run: { content: "参考", text_element_style: {
        link: { url: "https://www.bilibili.com/video/example" },
      } } }] },
      { id: "table", children: [{ id: "mention", elements: [{ mention_doc: { url: "https://m.youtube.com/watch?v=example" } }] }] },
      { id: "written", elements: [{ text_run: { text_element_style: { link: { url: "https://mobalytics.gg/tft/" } } } }] },
    ],
    team: { id: "board", notes: "https://youtu.be/example" },
    reroll: { advice: { stage: "https://www.Douyin.com/video/example" } },
  };
  assert.deepEqual(auditGuideCopy(section).map(({ rule, severity, blockId, teamId }) => [rule, severity, blockId ?? teamId]),
    ["bare", "rich", "mention", "board", "stage"].map(id => ["video-link", "error", id]));
});

test("a board-specific positioning waiver cannot hide invalid equipment", () => {
  const team = { id: "board", name: "主阵", pieces: [piece("amumu", 3), piece("viego", 13, "unknown")] };
  const sampleData = { ...data, id: "test", units: data.units.map(unit => ({ ...unit, name: unit.id })) };
  const section = { id: "guide", team, blocks: [{ id: "loadout", type: "text",
    text: "棋盘配装 · 主阵\n主C：viego。输出。\n主坦：amumu。承伤。" }] };
  const report = auditGuidePublication({ season: sampleData, sections: [section] }, { entries: [] }, {
    sectionIds: [section.id],
    overrides: ["amumu-position", "invalid-item"].map(rule => ({ sectionId: section.id, teamId: team.id, rule, reason: "对局站位示意" })),
  });
  assert.deepEqual(report.guides[0].boards[0].issues.map(({ rule, severity }) => [rule, severity]),
    [["amumu-position", "waived"], ["invalid-item", "error"]]);
});

test("reviewed screenshot positions are preserved and a moved piece cannot keep the reference exception", () => {
  const publication = prepareAuditPublication(structuredClone(preview));
  for (const reference of guidePositionReferences) {
    const section = publication.sections.find(section => section.id === reference.sectionId);
    const board = sectionTeams(section).find(team => team.id === reference.teamId);
    const positions = Object.fromEntries(board.pieces.map(piece => [piece.unitId, piece.position]));
    assert.deepEqual(positions, reference.positions, board.name);
  }

  const sectionId = guidePositionReferences[0].sectionId;
  const section = publication.sections.find(section => section.id === sectionId);
  const board = sectionTeams(section).find(team => team.id === guidePositionReferences[0].teamId);
  const leona = board.pieces.find(piece => piece.unitId === "leona");
  const galio = board.pieces.find(piece => piece.unitId === "galio");
  [leona.position, galio.position] = [galio.position, leona.position];
  const report = auditGuidePublication(publication, recommendations, { sectionIds: [sectionId] });
  const issues = report.guides[0].boards.find(entry => entry.teamId === board.id).issues;
  assert.ok(issues.some(issue => issue.rule === "stoneplate-crowded" && issue.severity === "error"));
});

test("the 14 featured guides pass on the combined public boards and retain roles, routes and catalog parity", () => {
  const publication = prepareAuditPublication(preview);
  const report = auditGuidePublication(publication, recommendations);
  assert.deepEqual(report.guides.map(guide => guide.sectionId), featuredGuideIds);
  assert.deepEqual(report.summary, { guides: 14, boards: 57, errors: 0, warnings: 0, waived: 9 });
  const catalog = buildFamilyCatalog(preview);
  const selected = new Map();
  const roleOrder = ["主C", "主坦", "副C"];
  for (const { sectionId, boards } of report.guides) {
    const section = publication.sections.find(section => section.id === sectionId);
    const gameData = section.gameData ?? publication.season;
    assert.ok(sourceSummary(section), sectionId);
    if (["0171", "0281"].some(id => sectionId.endsWith(id))) assert.ok(heroAugmentForGuide(section), sectionId);
    for (const { teamId, roles } of boards) {
      const team = sectionTeams(section).find(team => team.id === teamId);
      const { current, remaining } = guideBody(section, team);
      assert.ok([...current, ...remaining].every(block => !isBoardLoadout(block)), teamId);
      const row = catalog.boards.find(board => board.sectionId === sectionId && board.teamId === teamId);
      assert.deepEqual(row.roles, roles, teamId);
      assert.deepEqual(row.units, team.pieces.map(piece => piece.unitId), teamId);
      const roster = guideRoster(team, gameData, roles);
      const equipped = roster.filter(({ piece }) => piece.items.length);
      const [carry, tank] = equipped;
      const priorities = equipped.map(({ role }) => roleOrder.indexOf(role)).filter(priority => priority >= 0);
      assert.deepEqual(priorities, priorities.toSorted(), teamId);
      assert.equal(carry.role, "主C", teamId);
      assert.ok(roster.some(({ role }) => role === "主坦"), teamId);
      const mainTank = roster.find(({ role }) => role === "主坦");
      if (tank && tank.role !== "主C" && mainTank.piece.items.length) assert.equal(tank.role, "主坦", teamId);
      assert.equal(guideUnitMatch(carry.piece, carry.unit, roles, gameData.items,
        { familyCarry: false, sampled: false, transition: false }).mainCarry, true, teamId);
      selected.set(`${sectionId.slice(-4)}/${teamId.slice(-4)}`, team);
    }
  }

  const board = (section, team) => selected.get(`${section}/${team}`);
  const alternates = team => team.pieces.flatMap(piece => piece.alternate ? [[piece.unitId, piece.alternate.unitId]] : []);
  assert.deepEqual(new Map(alternates(board("0307", "0007"))), new Map([["jinx", "lucian"], ["gwen", "lux"]]));
  assert.deepEqual(new Map(alternates(board("0051", "0059"))), new Map([["jhin", "samira"], ["vladimir", "renata-glasc"]]));
  assert.deepEqual(alternates(board("1110", "1252")), [["mel", "lux"]]);
  assert.deepEqual(alternates(board("0338", "1283")), []);
  assert.ok(board("0338", "0078").pieces.some(piece => piece.unitId === "pyke" && piece.position === 7));
  const ocean = board("0251", "0075");
  for (const id of ["maracas", "rainstick"]) {
    const neighbors = boardNeighbors(ocean.instrumentPositions[id]);
    assert.ok(["graves", "zac"].every(unitId => neighbors.includes(ocean.pieces.find(piece => piece.unitId === unitId).position)), id);
  }
  const dancers = publication.sections.find(section => section.id.endsWith("0243"));
  assert.equal(guideRollLevel(dancers, board("0243", "fa63")), 7);
  const jazz = publication.sections.find(section => section.id.endsWith("1110"));
  assert.match(readingNotes(jazz, board("1110", "1252"), jazz.gameData).opening, /八级搜金克丝/);

  const prodigy = publication.sections.find(section => section.id.endsWith("0229"));
  assert.equal(prodigy.title, "天才蚂蚱大龙");
  const textOf = blocks => blocks.map(block => block.text).join("\n");
  const slowBoard = board("0229", "0017");
  const slow = textOf(guideBody(prodigy, slowBoard).current);
  assert.match(slow, /卡利息追两人三星/);
  assert.doesNotMatch(slow, /换斯维因开五天才/);
  assert.deepEqual(slowBoard.pieces.filter(piece => piece.stars === 3).map(piece => piece.unitId).sort(), ["ekko", "malzahar"]);
  assert.deepEqual(slowBoard.pieces.find(piece => piece.unitId === "amumu").items, ["emblem-prodigy"]);
  const { units, traits, items } = prodigy.gameData;
  assert.equal(traitCounts(slowBoard.pieces, units, traits, items).find(trait => trait.id === "prodigy").level, 5);
  assert.deepEqual(prodigy.reroll.stages.filter(stage => stage.directoryTitle).map(stage => stage.teamId.slice(-4)), ["0017", "d6c2"]);
  assert.doesNotMatch(slow, /打法：95/);
  const fastRoutes = [
    ["c105", "1342", [/开局有玛尔扎哈/, /2-1 拉 4/, /7 级小启动/, /团队法强/, /冕卫/, /8,000/, /累计近 2 万/, /再打近 4 万/, /6 万/, /青龙刀/]],
    ["d6c2", "1343", [/五种不同稀有度/, /60,000 伤害/, /五阶段.*八级.*质量/, /青龙刀启动并偷属性/, /无尽补爆发/, /饮血补续航/]],
    ["fd13", "1341", [/补回妮蔻开五天才/, /回蓝和团队治疗/, /第二轮爆发/]],
  ];
  for (const [id, sampleId, mechanisms] of fastRoutes) {
    const team = board("0229", id);
    assert.match(team.name, /天才蚂蚱大龙/);
    assert.equal(guidePlaystyle(prodigy, team), "95");
    const copy = guideBody(prodigy, team).current;
    assert.doesNotMatch(textOf(copy), /卡利息追两人三星/, id);
    for (const pattern of mechanisms) assert.match(textOf(copy), pattern, id);
    const sample = copy.find(block => block.id === "sample-block-" + sampleId);
    assert.match(sample?.text ?? "", /点击查样本/, id);
    assert.ok(sample?.elements.some(element => element.text_run?.text_element_style?.link?.url.startsWith("https://www.metatft.com/explorer?")), id);
    if (id !== "c105") {
      assert.deepEqual(team.pieces.find(piece => piece.unitId === "baron-nashor").items,
        ["TFT_Item_SpearOfShojin", "TFT_Item_InfinityEdge", "TFT_Item_Bloodthirster"], id);
      assert.deepEqual(guideFacets(prodigy, team, prodigy.gameData).costs, [7], id);
      assert.deepEqual(readingNotes(prodigy, team, prodigy.gameData).roles.find(role => role.label === "主C").units, ["baron-nashor"], id);
    }
  }
  const zeri = publication.sections.find(section => section.id.endsWith("0235"));
  const zeriJazz = sectionTeams(zeri).find(team => team.id.endsWith("1275"));
  assert.match(zeriJazz.name, /爵士.*泽丽/);
  assert.deepEqual(new Map(alternates(zeriJazz)), new Map([["smeech", "mel"], ["nunu-willump", "swain"]]));
  const rock = publication.sections.find(section => section.id.endsWith("0338"));
  assert.match(readingNotes(rock, board("0338", "0068"), rock.gameData).opening, /冠冕上十、手里没转时，留韦鲁斯/);

  const sourceHosts = (section, id) => section.blocks.find(block => block.id === id)?.elements?.flatMap(element => {
    const url = element.text_run?.text_element_style?.link?.url;
    return url ? [new URL(url).hostname] : [];
  });
  assert.deepEqual(sourceHosts(prodigy, "sample-block-0107"), ["mobalytics.gg", "teamfighttactics.leagueoflegends.com"]);
  const lifeguard = publication.sections.find(section => section.id.endsWith("0171"));
  assert.deepEqual(sourceHosts(lifeguard, "sample-block-0151"), ["data.metatft.com", "tactics.tools", "mobalytics.gg"]);
  const ionicBefore = structuredClone(preview);
  const ionicSection = ionicBefore.sections.find(section => section.id.endsWith("0307"));
  const ionicBoard = ionicSection.teams.find(team => team.id.endsWith("0007"));
  for (const piece of ionicBoard.pieces) {
    if (piece.unitId === "leona") piece.alternate = { instanceId: "pre-alt-1", unitId: "braum", stars: 2, items: [] };
    if (piece.unitId === "aurora") piece.alternate = { instanceId: "pre-alt-2", unitId: "ahri", stars: 2, items: [] };
    if (piece.unitId === "jinx" || piece.unitId === "gwen") delete piece.alternate;
  }
  const mergedIonic = prepareAuditPublication(ionicBefore).sections.find(section => section.id.endsWith("0307"));
  const mergedBoard = sectionTeams(mergedIonic).find(team => team.id.endsWith("0007"));
  assert.ok(mergedBoard.pieces.filter(piece => piece.alternate).length <= 2, "editBoard must never exceed 2 alternates");
});

test("every published guide passes strict board and copy compliance with zero errors and warnings", () => {
  const publication = prepareAuditPublication(preview);
  const sectionIds = allGuideIds(publication);
  assert.ok(sectionIds.length >= 40);
  const report = auditGuidePublication(publication, recommendations, { sectionIds });
  const findings = report.guides.flatMap(guide => [
    ...guide.issues.map(issue => `${guide.sectionId} ${guide.title} [${issue.rule}] ${issue.message}`),
    ...guide.boards.flatMap(board => board.issues.filter(issue => issue.severity !== "waived").map(issue => `${guide.sectionId} ${board.name ?? board.teamId} [${issue.rule}] ${issue.message}`)),
  ]);
  assert.deepEqual(findings, []);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.warnings, 0);
});
