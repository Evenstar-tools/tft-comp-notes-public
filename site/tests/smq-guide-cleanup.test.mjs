import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { sectionTeams } from "../domain/document-flow.ts";
import { guidePlaystyle, guideSectionWithCurrentNames, readingNotes } from "../domain/guide-reading.ts";
import { legacyGuideDestination } from "../domain/legacy-guide-redirects.ts";
import { rerollEntryTeamId } from "../domain/reroll-stages.ts";
import { switchAlternate, traitCounts, traitGroup, usedPopulation } from "../domain/team.ts";
import { findPlacement } from "../domain/guide-placement.ts";
import { guideFamilyBoardIds, guideFamilyRows, homeRecommendationEligible, recommendationTier } from "../domain/guide-family-stats.ts";
import { migrateS19GuideSnapshot } from "../server/s19-guide-cleanup.ts";

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const preview = json("../data/public-preview.json");
const guide = suffix => preview.sections.find(s => s.id === "sample-block-" + suffix);
const board = (s, suffix) => sectionTeams(s).find(t => t.id.endsWith(suffix));
const active = pieces => traitCounts(pieces, preview.season.units, preview.season.traits, preview.season.items)
  .filter(trait => traitGroup(trait) === "已开常规");
const add = (team, unitId) => [...team.pieces, { unitId, stars: 1, items: [] }];

test("the published Smeech routes reach nine non-unique traits with the original carries and tanks", () => {
  const jhin = guide("0051"), five = guide("0275"), jinx = guide("1110");
  assert.equal(jhin.primaryTeamId, board(jhin, "0059").id);
  assert.equal(five.primaryTeamId, board(five, "0082").id);
  assert.equal(five.category, "高费阵容");
  assert.equal(guideSectionWithCurrentNames(five).title, "三爵士五杀史密奇");
  assert.equal(jhin.teams.length, 6);
  assert.equal(five.teams.length, 2);
  assert.equal(active(board(jhin, "0059").pieces).length, 8);
  assert.equal(active(add(board(jhin, "0059"), "senna")).length, 9);
  for (const id of ["0034", "0083"]) {
    const unlock = board(jhin, id);
    assert.equal(active(unlock.pieces).length, 9);
    assert.deepEqual(unlock.pieces.map(p => p.unitId).sort(), add(board(jhin, "0059"), "miss-fortune").map(p => p.unitId).sort());
  }
  assert.equal(active(board(jhin, "1138").pieces).find(t => t.id === "jazz").level, 3);
  assert.equal(active(board(five, "0014").pieces).length, 8);
  for (const unit of ["kayn", "sett", "k-sante"]) assert.equal(active(add(board(five, "0014"), unit)).length, 9);
  assert.equal(active(board(five, "0082").pieces).length, 9);
  const notes = readingNotes(guideSectionWithCurrentNames(five), five.team, preview.season);
  assert.deepEqual(notes.roles.find(role => role.label === "主C").units, ["smeech"]);
  assert.equal(active(board(jinx, "1252").pieces).length, 9);
});

test("Jazz Zeri unlocks Smeech with both stacked substitutes and retains the original main board", () => {
  const section = guide("0235");
  const final = board(section, "1275");
  const smeech = final.pieces.find(piece => piece.unitId === "smeech");
  const nunu = final.pieces.find(piece => piece.unitId === "nunu-willump");
  assert.equal(smeech.alternate.unitId, "mel");
  assert.equal(nunu.alternate.unitId, "swain");
  const from = switchAlternate(switchAlternate(final.pieces, smeech.instanceId), nunu.instanceId);
  assert.equal(usedPopulation(from), 9);
  assert.ok(from.every(piece => piece.unitId !== "smeech"));
  assert.deepEqual(active(from).map(trait => trait.id).sort(), [
    "arcanist", "bodyguard", "frontman", "heartsteel", "jazz", "k-da", "manager", "r-b", "swiftstriker",
  ]);
  assert.equal(active(from.map(piece => ["lillia", "leona"].includes(piece.unitId)
    ? { ...piece, stars: 1 } : piece)).length, 8);
  assert.equal(active(final.pieces).length, 8);
  assert.equal(active(final.pieces).find(trait => trait.id === "jazz").level, 3);
  assert.equal(final.pieces.find(piece => piece.unitId === "zeri").position, 27);
  assert.equal(final.pieces.find(piece => piece.unitId === "zeri").items.length, 3);
  assert.equal(final.pieces.find(piece => piece.unitId === "dr-mundo").items.length, 3);
  assert.equal(section.primaryTeamId, board(section, "0105").id);
  assert.deepEqual(readingNotes(section, final, preview.season).roles.find(role => role.label === "主C").units, ["zeri"]);

  const prior = {
    ...section,
    teams: section.teams.filter(team => team !== final),
    blocks: section.blocks.filter(block => !/^sample-block-129[0-3]$/.test(block.id)),
  };
  const [migrated] = migrateS19GuideSnapshot({ ...preview, sections: [prior] }).sections;
  assert.equal(migrated.primaryTeamId, prior.primaryTeamId);
  assert.deepEqual(migrated.teams, section.teams);
  assert.ok(migrated.blocks.some(block => block.text?.includes("凑齐九个非唯一羁绊")));
});

test("guide entry boards follow the playable level and retain the family results on their original boards", () => {
  const entries = json("../data/s19-reroll-boards.json");
  const map = json("../data/guide-family-map.json");
  const entry = section => entries.find(row => row.sectionId === section.id);

  const jinx = guide("1110");
  assert.equal(entry(jinx).entryTeamId, board(jinx, "1252").id);
  assert.equal(usedPopulation(board(jinx, "1252").pieces), 8);
  assert.equal(jinx.primaryTeamId, board(jinx, "1251").id);
  assert.equal(map.rows.find(row => row.sectionId === jinx.id).teamId, jinx.primaryTeamId);

  const viego = guide("0243");
  const vr = entry(viego);
  assert.ok(vr.entryTeamId.endsWith("0074"));
  const seven = vr.stages.find(stage => stage.teamId === vr.entryTeamId);
  assert.equal(usedPopulation(seven.pieces), 7);
  assert.ok(seven.pieces.some(piece => piece.unitId === "amumu"));
  assert.equal(map.rows.find(row => row.clusterId === "429002").teamId, viego.primaryTeamId);

  const renata = guide("0122");
  const sixGuards = board(renata, "0044");
  const routeStage = entry(renata).stages.find(stage => stage.parentTeamId === sixGuards.id && stage.entry);
  const readSection = { ...renata, reroll: entry(renata) };
  assert.ok(routeStage.teamId.endsWith("0048"));
  assert.equal(usedPopulation(routeStage.pieces), 6);
  assert.equal(renata.primaryTeamId, sixGuards.id);
  assert.equal(rerollEntryTeamId(readSection, renata.primaryTeamId), routeStage.teamId);
  assert.equal(rerollEntryTeamId(readSection, board(renata, "0046").id), undefined);

  const vayne = guide("0338");
  const rock = entry(vayne);
  const steady = rock.stages.find(stage => stage.teamId === rock.entryTeamId);
  const anchor = board(vayne, "0078");
  assert.equal(steady.parentTeamId, anchor.id);
  assert.equal(usedPopulation(steady.pieces), 8);
  assert.equal(active(steady.pieces).find(trait => trait.id === "rock").level, 5);
  assert.ok(!steady.pieces.some(piece => piece.unitId === "pyke"));
  const published = preview.boardEdits.find(edit => edit.teamId === anchor.id);
  assert.equal(usedPopulation(published.content.pieces), 9);
  assert.ok(published.content.pieces.some(piece => piece.unitId === "pyke"));
  assert.equal(map.rows.find(row => row.sectionId === vayne.id).teamId, anchor.id);
});

test("merged links select their retained boards and retired guides are omitted from older public reads", () => {
  const anchor = guide("0051"), graves = guide("0251"), five = guide("0275"), kayle = guide("0219");
  const dest = (id, sourceBoard) => legacyGuideDestination("sample-block-" + id, sourceBoard, preview.sections);
  assert.deepEqual(dest("1055"), { sectionId: anchor.id, teamId: board(anchor, "1138").id });
  assert.deepEqual(dest("0394"), { sectionId: anchor.id, teamId: board(anchor, "0083").id });
  for (const [old, section, suffix, name, carry] of [
    ["0173", anchor, "0006", "八级 · 六古典烬猫", "yuumi"],
    ["0468", kayle, "0106", "九级 · 四主宰派克泽丽", "zeri"],
  ]) {
    const variant = board(section, suffix);
    assert.equal(guide(old), undefined);
    assert.deepEqual(dest(old), { sectionId: section.id, teamId: variant.id });
    assert.equal(variant.name, name);
    assert.equal(board(guideSectionWithCurrentNames(section), suffix).name, name);
    assert.equal(variant.boardRole, "variant");
    assert.deepEqual(readingNotes(section, variant, preview.season).roles.find(role => role.label === "副C").units, [carry]);
  }
  assert.equal(guide("0452"), undefined);
  assert.deepEqual(dest("0452"), { sectionId: graves.id, teamId: board(graves, "1261").id });
  assert.deepEqual(dest("1120"), { sectionId: graves.id, teamId: board(graves, "1261").id });
  assert.equal(dest("1120", board(graves, "1262").id).teamId, board(graves, "1262").id);
  assert.equal(dest("0154"), undefined);
  assert.equal(graves.primaryTeamId, board(graves, "0076").id);
  const variants = ["1261", "1262", "0093"].map(id => board(graves, id));
  assert.deepEqual(variants.map(team => guidePlaystyle(graves, team)), ["84", "84", "95"]);
  for (const [index, variant] of variants.entries()) {
    assert.deepEqual(dest("0452", variant.id), { sectionId: graves.id, teamId: variant.id });
    assert.equal(variant.sectionId, graves.id);
    assert.equal(variant.boardRole, "variant");
    const roles = readingNotes(guideSectionWithCurrentNames(graves), variant, preview.season).roles;
    assert.deepEqual(roles.find(role => role.label === "主C")?.units, [index === 2 ? "pyke" : "graves"]);
    assert.deepEqual(roles.find(role => role.label === "主坦")?.units, ["zac"]);
    assert.ok(roles.some(role => role.label === "副C"));
  }

  const legacy = { ...preview, sections: [
    { ...five, title: "旧攻略", teams: [five.team] },
    { ...five, id: "sample-block-0154" },
    { ...anchor, teams: anchor.teams.slice(0, 3) },
    { ...anchor, id: "sample-block-1055" },
    { ...kayle, teams: kayle.teams.filter(team => team.id !== board(kayle, "0106").id) },
    { ...kayle, id: "sample-block-" + "0468" },
    { ...graves, teams: graves.teams.filter(team => !variants.includes(team)),
      blocks: graves.blocks.filter(block => block.id === "sample-block-0574") },
    { ...graves, id: "sample-block-0452", teams: variants },
  ] };
  const updated = migrateS19GuideSnapshot(legacy);
  assert.deepEqual(updated.sections.map(s => [s.id, s.teams.length]), [[five.id, 2], [anchor.id, 6], [kayle.id, 3], [graves.id, 8]]);
  assert.equal(updated.sections[2].team, kayle.team);
  assert.equal(updated.sections[3].team, graves.team);
  assert.deepEqual(updated.sections[3].teams.slice(-3), variants);
  assert.equal(updated.sections[3].blocks[0].id, "sample-block-0574");
  assert.equal(readingNotes(updated.sections[3], variants[0], preview.season).roles.find(role => role.label === "主C")?.units[0], "graves");
  assert.deepEqual(migrateS19GuideSnapshot(preview), preview);
});

test("published guide data resolves every section and board reference", () => {
  const boardsByGuide = new Map(preview.sections.map(s => [s.id, new Set(sectionTeams(s).map(t => t.id))]));
  const rerolls = json("../data/s19-reroll-boards.json");
  const pyke = guide("1090");
  assert.doesNotMatch(JSON.stringify([pyke, rerolls.find(entry => entry.sectionId === pyke.id)]), /史密奇|smeech/i);
  for (const { sectionId, stages } of rerolls) {
    for (const stage of stages.filter(stage => stage.pieces)) boardsByGuide.get(sectionId).add(stage.teamId);
  }
  const allBoards = new Set([...boardsByGuide.values()].flatMap(boards => [...boards]));
  const verify = (value, path, owner) => {
    if (!value || typeof value !== "object") return;
    const sectionId = value.sectionId ?? owner;
    const boards = sectionId ? boardsByGuide.get(sectionId) : allBoards;
    assert.ok(boards, path + " section " + sectionId);
    const ids = [value.teamId, value.primaryTeamId, value.entryTeamId, value.parentTeamId,
      ...(value.sharedTeamIds ?? []), ...(value.stageTeamIds ?? [])].filter(id => typeof id === "string");
    for (const id of ids) assert.ok(boards.has(id), path + " board " + id);
    for (const [key, child] of Object.entries(value)) verify(child, path + "/" + key, sectionId);
  };
  for (const file of readdirSync(new URL("../data/", import.meta.url)).filter(name => name.endsWith(".json"))) {
    verify(json("../data/" + file), file);
  }
  for (const id of Object.keys(json("../server/s19-guide-details.json"))) assert.ok(boardsByGuide.has(id), id);

  const placements = json("../data/guide-placement.json").records;
  const classical = guide("0051");
  const [jhin, mf] = ["0034", "0083"].map(id => placements.find(row => row.conditions?.teamId === board(classical, id).id));
  assert.equal(mf.url, jhin.url);
  assert.deepEqual(mf.placementCounts, jhin.placementCounts);
  assert.ok(placements.find(row => row.conditions?.teamId === board(classical, "1138").id).games >= 617);
});

test("native fast-nine ratings drive recommendations while filtered samples remain available on the board", () => {
  const batch = json("../data/guide-placement.json");
  const families = json("../data/guide-family-stats.json");
  const picks = json("../data/patch-recommendations.json");
  for (const [suffix, clusterId, tier, status] of [
    ["0235", "429055", "secondary", "avoid"],
    ["0275", "429004", "recommended", "recommended"],
    ["0214", "429021", "recommended", "conditional"],
  ]) {
    const section = guide(suffix);
    const team = section.team;
    const pick = picks.entries.find(entry => entry.sectionId === section.id && entry.teamId === team.id);
    const [family] = guideFamilyRows(families, preview.season.id, section.id, sectionTeams(section));
    assert.equal(family.stat.clusterId, clusterId);
    assert.equal(family.team.id, team.id);
    assert.equal(recommendationTier(family.stat), tier);
    assert.equal(pick.status, status);
    assert.equal(pick.group, "fast9");
    assert.deepEqual(pick.sources, [family.stat.url]);
    assert.equal(homeRecommendationEligible(family.stat), tier === "recommended");
    const carries = readingNotes(section, team, preview.season).roles.find(role => role.label === "主C").units;
    assert.deepEqual(family.stat.carryIds, carries);
    if (suffix === "0214") continue;
    const records = batch.records.filter(row => row.conditions?.kind === "core" && row.conditions.teamId === team.id);
    const traitLevels = Object.fromEntries(active(team.pieces).map(trait => [trait.id, trait.level]));
    const sample = findPlacement({ ...batch, records }, team.pieces.map(piece => piece.unitId), usedPopulation(team.pieces), {
      edition: preview.season.id, teamId: team.id, traitLevels, pieces: team.pieces,
    });
    assert.equal(sample?.build, picks.build);
    assert.equal(sample?.conditions?.population, 9);
    assert.equal(recommendationTier(sample), "recommended");
    assert.ok(sample.mean < family.stat.mean);
  }
});

test("Jazz Jinx shares one native rating from the fast-eight landing to the nine-unit upgrade", () => {
  const section = guide("1110");
  const teams = sectionTeams(section);
  const [landing, anchor] = ["1252", "1251"].map(id => board(section, id));
  const batch = json("../data/guide-family-stats.json");
  const picks = json("../data/patch-recommendations.json");
  const [family] = guideFamilyRows(batch, preview.season.id, section.id, teams);
  const pick = picks.entries.find(entry => entry.sectionId === section.id);
  assert.equal(family.stat.clusterId, "429018");
  assert.equal(family.team.id, anchor.id);
  assert.deepEqual(family.boards.map(team => team.id), [landing.id, anchor.id]);
  assert.equal(usedPopulation(landing.pieces), 8);
  assert.ok(landing.pieces.every(piece => piece.unitId !== "smeech"));
  assert.equal(pick.teamId, landing.id);
  assert.ok(homeRecommendationEligible(family.stat));
  assert.deepEqual(pick.sources, [family.stat.url]);

  const small = { ...batch, rows: [], smallSamples: [{ ...family.stat, games: 99 }] };
  assert.deepEqual(guideFamilyRows(small, preview.season.id, section.id, teams), []);
  assert.deepEqual([...guideFamilyBoardIds(small, preview.season.id, section.id, anchor.id)], [landing.id, anchor.id]);
});
