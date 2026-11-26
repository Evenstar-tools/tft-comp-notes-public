import preview from "../data/public-preview.json" with { type: "json" };
import type { Publication, Section } from "../domain/document";
import { sectionTeams } from "../domain/document-flow.ts";
import { GUIDE_SECTION_IDS } from "../domain/guide-identities.ts";
import { mergedGuideIds } from "../domain/legacy-guide-redirects.ts";
import { sameEdition } from "../domain/version-updates.ts";

const retiredGuides = new Set([...mergedGuideIds, "sample-block-0154", "sample-block-0290", "sample-block-0368"]);
const obsoleteCategory = "史密奇阵容";
const previewSections = preview.sections as Section[];
const replacements = new Map(previewSections.filter(({ id }) => [
  GUIDE_SECTION_IDS.classicalJhin, GUIDE_SECTION_IDS.altPykeGraves,
  GUIDE_SECTION_IDS.threeJazzSmeech, GUIDE_SECTION_IDS.jazzPykeAurora, "sample-block-0235",
].some(guideId => guideId === id)).map(section => [section.id, section]));

function hasLegacyBoards(section: Section, current: Section) {
  const oldTeams = sectionTeams(section);
  const currentTeams = sectionTeams(current);
  return currentTeams.some(board => !oldTeams.some(old => old.id === board.id)) ||
    (section.id === GUIDE_SECTION_IDS.classicalJhin && oldTeams.some(board =>
      board.name === "8级 · 梅尔盖伦" || board.name === "9级 · 赛娜开锁准备" ||
      (board.name === "九级四古典 · 女枪" && board.pieces.some(piece => piece.unitId === "nunu-willump")))) ||
    (section.id === GUIDE_SECTION_IDS.threeJazzSmeech && section.title !== current.title) ||
    ((section.id === GUIDE_SECTION_IDS.jazzPykeAurora || section.id === "sample-block-0235") &&
      oldTeams.some(board => board.pieces.some(piece => piece.unitId === "smeech")));
}

/** Clean up public reads of older snapshots that still contain the affected S19 guides. */
export function migrateS19GuideSnapshot(snapshot: Publication): Publication {
  if (!sameEdition(snapshot.season.id, preview.season.id)) return snapshot;
  return {
    ...snapshot,
    sections: snapshot.sections.flatMap(section => {
      if (retiredGuides.has(section.id) || section.title === obsoleteCategory) return [];
      const current = replacements.get(section.id);
      if (current && hasLegacyBoards(section, current)) return [structuredClone(current)];
      if (section.id === "sample-block-0235") {
        const edited = previewSections.find(guide => guide.id === section.id)?.blocks.find(block => block.id === "sample-block-0264");
        if (edited && section.blocks.some(block => block.id === edited.id && block.text?.includes("史密奇"))) {
          return [{ ...section, blocks: section.blocks.map(block => block.id === edited.id ? structuredClone(edited) : block) }];
        }
      }
      return [section.category === obsoleteCategory ? { ...section, category: "高费阵容" } : section];
    }),
  };
}
