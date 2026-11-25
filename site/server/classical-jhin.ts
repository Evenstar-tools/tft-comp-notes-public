import { season } from "@/data";
import type { ContentBlock, Publication } from "@/domain/document";
import { sectionTeams } from "@/domain/document-flow";
import { sameEdition } from "@/domain/version-updates";
import type { Team } from "@/domain/types";

export const classicalJhinId = "sample-block-0051";
export const formerJazzJhinId = "sample-block-1055";
export const jazzJhinTeamId = "00000000-0000-4000-8000-000000001138";
export const classicalJhinMainId = "00000000-0000-4000-8000-000000000059";
export const formerJazzEarlyId = "00000000-0000-4000-8000-000000001091";

const jazzName = "九级 · 爵士乐烬";
const magicItems = ["TFT_Item_BlueBuff", "TFT_Item_Morellonomicon", "TFT_Item_ArchangelsStaff"];
const magicBoards = new Set([
  classicalJhinMainId, jazzJhinTeamId, "00000000-0000-4000-8000-000000000034",
  "00000000-0000-4000-8000-000000000036", "00000000-0000-4000-8000-000000000092",
]);
const handoff = "蓝霸符、鬼书、大天使齐了，一星吸血鬼就接装，优先于两星梅尔。";
const loadout = "副C：弗拉基米尔。蓝霸符、鬼书、大天使。";
const variantNotes = "八级烬和前排两星稳血后再上九。凑 8 个常规羁绊解锁史密奇，上场开三爵士，烬继续主 C。";
const textBlock = (id: string, text: string): ContentBlock => ({ id, type: "text", text });

function markFirstBatch(block: ContentBlock) {
  const label = "19.1b。";
  if (block.id !== "sample-block-1006" || !block.text?.startsWith(label)) return block;
  const firstBatch = "19.1b 首批。";
  return {
    ...block,
    text: firstBatch + block.text.slice(label.length),
    elements: block.elements?.map(element => element.text_run?.content.startsWith(label)
      ? { ...element, text_run: { ...element.text_run, content: firstBatch + element.text_run.content.slice(label.length) } }
      : element),
  };
}

function currentLoadout(team: Team) {
  const vampire = team.pieces.find(piece => piece.unitId === "vladimir");
  const mel = team.pieces.find(piece => piece.unitId === "mel");
  if (!magicBoards.has(team.id) || !vampire || vampire.items.length || !mel?.items.length ||
    !mel.items.every(item => magicItems.includes(item))) return team;
  return { ...team, pieces: team.pieces.map(piece => {
    if (piece === vampire) return { ...piece, items: [...magicItems] };
    if (piece === mel) return { ...piece, items: [] };
    return piece;
  }) };
}

/** Read both the older split snapshot and the merged Feishu chapter with the same board IDs. */
export function mergeClassicalJhin(publication: Publication): Publication {
  if (!sameEdition(publication.season.id, season.id)) return publication;
  const classical = publication.sections.find(section => section.id === classicalJhinId);
  if (!classical) return publication;
  const oldJazz = publication.sections.find(section => section.id === formerJazzJhinId);
  const existing = sectionTeams(classical);
  const imported = !existing.some(team => team.id === jazzJhinTeamId)
    ? oldJazz && sectionTeams(oldJazz).find(team => team.id === jazzJhinTeamId)
    : undefined;
  const region = imported && oldJazz?.generatedRegions?.[jazzJhinTeamId];
  const teams = [...existing, ...(imported ? [imported] : [])].map(team => currentLoadout(team.id === jazzJhinTeamId
    ? { ...team, sectionId: classicalJhinId, name: jazzName, notes: variantNotes, boardRole: "variant" } : team));
  const blocks = classical.blocks.map(block => {
    const before = block.text;
    if (!before || !/^(?:棋盘配装|主坦：锤石)/.test(before)) return markFirstBatch(block);
    const text = before.replace(/(?:副C|功能装)：梅尔。[^\n]+/g, loadout)
      .replace(/鬼书先给烈娜塔，成型交给梅尔。/, "鬼书先给烈娜塔过渡。");
    return text === before ? block : { ...block, text, elements: undefined };
  });
  if (!blocks.some(block => block.text?.includes("优先于两星梅尔"))) {
    const summary = blocks.findIndex(block => block.id === classical.summaryBlockId);
    blocks.splice(summary + 1, 0, textBlock("classical-jhin-vladimir", handoff));
  }
  if (imported) {
    const boardMedia = oldJazz?.blocks.filter(block => block.id === region?.textId || block.id === region?.imageId) ?? [];
    const evidence = oldJazz?.blocks.filter(block =>
      block.id === "sample-block-1006" || block.id === "sample-block-0980") ?? [];
    blocks.push(
      { ...textBlock("classical-jhin-jazz-heading", jazzName), type: "heading", level: 3 },
      ...boardMedia,
      textBlock("classical-jhin-jazz-notes", variantNotes + handoff),
      textBlock("sample-block-0872", [
        "棋盘配装 · " + jazzName, "主C：烬。无尽、轻语、死亡之刃。",
        "主坦：锤石。石像鬼石板甲、振奋、冕卫。", loadout, "副C：史密奇。剩余战士装。",
      ].join("\n")),
      ...evidence.map(markFirstBatch),
    );
  }
  return {
    ...publication,
    sections: publication.sections.filter(section => section.id !== formerJazzJhinId).map(section => section === classical ? {
      ...classical,
      teams,
      team: teams.find(team => team.id === (classical.primaryTeamId ?? classical.team?.id)),
      stageTeamIds: classical.stageTeamIds?.filter(id => id !== jazzJhinTeamId),
      generatedRegions: region ? { ...classical.generatedRegions, [jazzJhinTeamId]: region } : classical.generatedRegions,
      blocks,
      gameData: season,
    } : section),
  };
}
