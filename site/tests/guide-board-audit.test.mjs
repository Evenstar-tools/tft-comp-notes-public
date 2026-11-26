import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boardNeighbors } from "../domain/board-layout.ts";
import { sectionTeams } from "../domain/document-flow.ts";
import { guideBody, guidePlaystyle, guideRollLevel, guideRoster, guideUnitMatch, readingNotes, sourceSummary } from "../domain/guide-reading.ts";
import { heroAugmentForGuide } from "../domain/hero-augments.ts";
import { auditGuideBoard, auditGuideCopy, auditGuidePublication, featuredGuideIds, prepareAuditPublication } from "../scripts/audit-guide-boards.mjs";
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
  ];
  assert.deepEqual(auditGuideCopy({ blocks }).map(({ rule, blockId }) => [rule, blockId]),
    [["obsolete-unlock", "unlock"], ["obsolete-stats", "sample"], ["obsolete-stats", "unlinked-current"]]);
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

test("the 14 featured guides pass on the combined public boards and retain roles, routes and catalog parity", () => {
  const publication = prepareAuditPublication(preview);
  const report = auditGuidePublication(publication, recommendations);
  assert.deepEqual(report.guides.map(guide => guide.sectionId), featuredGuideIds);
  assert.equal(report.summary.guides, 14);
  assert.deepEqual([report.summary.errors, report.summary.warnings, report.summary.waived], [0, 0, 0]);
  const catalog = buildFamilyCatalog(preview);
  const selected = new Map();
  for (const { sectionId, boards } of report.guides) {
    const section = publication.sections.find(section => section.id === sectionId);
    const gameData = section.gameData ?? publication.season;
    const summary = sourceSummary(section);
    assert.ok(summary && summary.length <= 30, sectionId);
    if (["0171", "0281"].some(id => sectionId.endsWith(id))) assert.ok(heroAugmentForGuide(section), sectionId);
    for (const { teamId, roles } of boards) {
      const team = sectionTeams(section).find(team => team.id === teamId);
      const { current } = guideBody(section, team);
      const bullets = current.filter(block => block.type === "bullet");
      assert.ok(bullets.length >= 2 && bullets.length <= 3 && bullets.every(block => block.text.length <= 28), teamId);
      assert.ok(current.every(block => !block.text?.startsWith("棋盘配装 · ")), teamId);
      const row = catalog.boards.find(board => board.sectionId === sectionId && board.teamId === teamId);
      assert.deepEqual(row.roles, roles, teamId);
      assert.deepEqual(row.units, team.pieces.map(piece => piece.unitId), teamId);
      const roster = guideRoster(team, gameData, roles);
      const [carry, tank] = roster.filter(({ piece }) => piece.items.length);
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
  assert.doesNotMatch(guideBody(prodigy, board("0229", "0017")).current.map(block => block.text).join("\n"), /打法：95/);
  for (const id of ["c105", "d6c2", "fd13"]) {
    const team = board("0229", id);
    assert.match(team.name, /天才蚂蚱大龙/);
    assert.equal(guidePlaystyle(prodigy, team), "95");
    const copy = guideBody(prodigy, team).current;
    assert.ok(copy.some(block => block.text?.includes("小爱さま")), id);
    assert.ok(copy.some(block => block.text?.includes("点击查样本")), id);
    if (id !== "c105") {
      assert.deepEqual(team.pieces.find(piece => piece.unitId === "baron-nashor").items,
        ["TFT_Item_BlueBuff", "TFT_Item_PowerGauntlet", "TFT_Item_InfinityEdge"], id);
    }
  }
  const zeri = publication.sections.find(section => section.id.endsWith("0235"));
  const zeriJazz = sectionTeams(zeri).find(team => team.id.endsWith("1275"));
  assert.match(zeriJazz.name, /爵士.*泽丽/);
  assert.deepEqual(new Map(alternates(zeriJazz)), new Map([["smeech", "mel"], ["nunu-willump", "swain"]]));
  const rock = publication.sections.find(section => section.id.endsWith("0338"));
  assert.match(readingNotes(rock, board("0338", "0068"), rock.gameData).opening, /冠冕上十、手里没转时，留韦鲁斯/);

  // Guard P1 review fixes: keep external source links on 0229 & 0171, and cap stacked alternates at 2
  assert.ok(prodigy.blocks.some(block => block.id === "sample-block-0107"), "sample-block-0107 source links preserved");
  const lifeguard = publication.sections.find(section => section.id.endsWith("0171"));
  assert.ok(lifeguard.blocks.some(block => block.id === "sample-block-0151"), "sample-block-0151 source links preserved");
  const ionicBefore = structuredClone(JSON.parse(readFileSync(new URL("../data/public-preview.json", import.meta.url), "utf8")));
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
