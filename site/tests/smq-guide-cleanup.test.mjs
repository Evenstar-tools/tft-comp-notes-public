import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { sectionTeams } from "../domain/document-flow.ts";
import { guidePlaystyle, guideRoute, guideSectionWithCurrentNames, readingNotes } from "../domain/guide-reading.ts";
import { legacyGuideDestination } from "../domain/legacy-guide-redirects.ts";
import { traitCounts, traitGroup, usedPopulation } from "../domain/team.ts";
import { findPlacement } from "../domain/guide-placement.ts";
import { recommendationTier } from "../domain/guide-family-stats.ts";
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

test("merged links select their retained boards and retired guides are omitted from older public reads", () => {
  const anchor = guide("0051"), graves = guide("0452"), five = guide("0275"), kayle = guide("0219");
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
  assert.deepEqual(dest("1120"), { sectionId: graves.id, teamId: board(graves, "1261").id });
  assert.equal(dest("1120", board(graves, "1262").id).teamId, board(graves, "1262").id);
  assert.equal(dest("0154"), undefined);
  assert.deepEqual(graves.teams.map(team => guidePlaystyle(graves, team)), ["95", "84", "84"]);
  const roster = guideRoute(graves, graves.teams, graves.team);
  assert.deepEqual(roster.choices.map(step => step.team.id), graves.teams.slice(1).map(team => team.id));

  const legacy = { ...preview, sections: [
    { ...five, title: "旧攻略", teams: [five.team] },
    { ...five, id: "sample-block-0154" },
    { ...anchor, teams: anchor.teams.slice(0, 3) },
    { ...anchor, id: "sample-block-1055" },
    { ...kayle, teams: kayle.teams.slice(0, 3) },
    { ...kayle, id: "sample-block-" + "0468" },
  ] };
  const updated = migrateS19GuideSnapshot(legacy);
  assert.deepEqual(updated.sections.map(s => [s.id, s.teams.length]), [[five.id, 2], [anchor.id, 6], [kayle.id, 4]]);
  assert.equal(updated.sections[2].team, kayle.team);
  assert.deepEqual(migrateS19GuideSnapshot(preview), preview);
});

test("published guide data resolves every section and board reference", () => {
  const boardsByGuide = new Map(preview.sections.map(s => [s.id, new Set(sectionTeams(s).map(t => t.id))]));
  const rerolls = json("../data/s19-reroll-boards.json");
  for (const suffix of ["0235", "1090"]) {
    const section = guide(suffix);
    assert.doesNotMatch(JSON.stringify([section, rerolls.find(entry => entry.sectionId === section.id)]), /史密奇|smeech/i);
  }
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

test("authored fast-nine samples resolve against the actual published boards", () => {
  const batch = json("../data/guide-placement.json");
  const picks = json("../data/patch-recommendations.json");
  for (const suffix of ["0235", "0275"]) {
    const section = guide(suffix);
    const team = section.team;
    const pick = picks.entries.find(entry => entry.sectionId === section.id && entry.teamId === team.id);
    const records = batch.records.filter(row => row.conditions?.kind === "core" && pick?.sources.includes(row.url));
    const traitLevels = Object.fromEntries(active(team.pieces).map(trait => [trait.id, trait.level]));
    const sample = findPlacement({ ...batch, records }, team.pieces.map(piece => piece.unitId), usedPopulation(team.pieces), {
      edition: preview.season.id, teamId: team.id, traitLevels, pieces: team.pieces,
    });
    assert.equal(pick.group, "fast9");
    assert.equal(sample?.build, picks.build);
    assert.equal(sample?.conditions?.population, 9);
    assert.equal(recommendationTier(sample), "recommended");
  }
});
