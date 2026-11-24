import type { ContentBlock, DocumentDraft, RichElement, Section } from "./document";
import { boardStages, readTeamStage } from "./team-stages.ts";
import type { Team } from "./types";

export function sectionTeams(section: Section): Team[] {
  return [...new Map([...(section.team ? [section.team] : []), ...(section.teams ?? [])].map(team => [team.id, team])).values()];
}
function hasContent(blocks: ContentBlock[]): boolean {
  return blocks.some(block => block.type === "image" || !!block.text?.trim() ||
    block.elements?.some(element => element.mention_doc || element.text_run?.content.trim()) ||
    (block.children && hasContent(block.children)));
}
export function readableSection(section: Section) {
  return section.kind !== "category" && (section.title !== section.category ||
    sectionTeams(section).length > 0 || hasContent(section.blocks));
}
export function findSection(sections: Section[], headingId: string) {
  return sections.find(section => section.id === headingId || section.sourceHeadingIds?.includes(headingId));
}
const documentCategories = new Set([
  "连胜成型阵容", "连败成型阵容", "次选成熟阵容", "条件定阵阵容", "非常规构筑",
  "个人理解", "更新记录", "慢搜阵容", "高费阵容", "史密奇阵容", "PBE试阵", "纹章阵容", "英雄强化阵容",
  "版本更新", "八级运营", "国风九五", "高能流行与天才慢搜", "芸阿娜慢搜",
]);

function boldLabel(elements?: RichElement[]) {
  const visible = elements?.filter(element => element.text_run?.content.trim() || element.mention_doc);
  if (!visible?.length || visible.some(element => !element.text_run?.text_element_style?.bold)) return;
  const text = visible.map(element => element.text_run!.content).join("").trim();
  if (text.length <= 45 && !/[。！？；\r\n]/.test(text)) return text;
}

export function categoryLabel(elements?: RichElement[]) {
  const label = boldLabel(elements)?.replace(/^\d+\s*[.．、]\s*/, "");
  return label && documentCategories.has(label) ? label : undefined;
}

/** Recognize both the old heading index and the new Feishu body-only category labels. */
export function splitSections(entries: { id: string; level?: number; title: string; content: ContentBlock }[]): Section[] {
  const sections: Section[] = [];
  let category = "资料说明";
  let current: Section = { id: "introduction", title: category, category, blocks: [], kind: "note", sourceHeadingIds: [] };
  const flush = () => {
    if (current.id === "introduction" && !current.blocks.length) return;
    if (current.kind === "category" && hasContent(current.blocks)) current.kind = "note";
    sections.push(current);
  };
  for (const entry of entries) {
    const boldCategory = entry.content.type === "text" ? categoryLabel(entry.content.elements) : undefined;
    const categoryTitle = entry.level === 1 ? entry.title : boldCategory;
    if (categoryTitle || entry.level === 2) {
      flush();
      if (categoryTitle) category = categoryTitle;
      current = {
        id: entry.id, title: categoryTitle ?? entry.title, category, blocks: [],
        kind: categoryTitle ? "category" : "guide", sourceHeadingIds: [entry.id],
      };
    } else {
      const isLabel = entry.content.type === "text" && !!boldLabel(entry.content.elements);
      current.blocks.push(isLabel ? { ...entry.content, label: true } : entry.content);
      if (entry.level || isLabel) current.sourceHeadingIds!.push(entry.id);
    }
  }
  flush();
  return sections;
}
export function isBoardScratchTitle(title: string) {
  return /^(?:未命名阵容(?:\s*[·：:].*)?|.*(?:验收|测试)示例.*|阵容编辑示例(?:（待填）)?|.*[（(](?:待填|待编辑|半成品|测试|验收)[)）]|.*\s*·\s*旧棋盘存档)$/.test(title.trim());
}

export function feishuBoardIssue(team: Pick<Team, "name" | "pieces">) {
  if (!team.name.trim() || isBoardScratchTitle(team.name)) return "给阵容填写正式名称后再更新飞书。";
  if (!team.pieces.length) return "摆好阵容后再更新飞书。";
}

export function isBoardCaption(actual: string, expected: string, teamId: string) {
  if (actual === expected) return true;
  const [marker, boardName] = expected.split(/\r?\n/, 2);
  return marker === `【阵容构建器 · ${teamId}】` && !!boardName?.trim() && actual === boardName.trim();
}

export function sameGeneratedSection(blocks: { block_id: string; block_type: number; children?: string[]; parent_id?: string; text?: { elements?: RichElement[] } }[], rootId: string, heading: string, textId: string, imageId: string) {
  const byId = new Map(blocks.map(block => [block.block_id, block]));
  const owners = new Map<string, string>();
  const walk = (id: string, owner: string) => {
    if (owners.has(id)) return;
    owners.set(id, owner);
    byId.get(id)?.children?.forEach(child => walk(child, owner));
  };
  let current = "";
  const ordered = byId.get(rootId)?.children ?? blocks.filter(b => b.parent_id === rootId).map(b => b.block_id);
  for (const id of ordered) {
    const block = byId.get(id);
    const type = block?.block_type;
    if (type === 3 || type === 4 || (type === 2 && categoryLabel(block?.text?.elements))) current = id;
    walk(id, current);
  }
  const owner = owners.get(heading);
  return !!owner && owners.get(textId) === owner && owners.get(imageId) === owner
    && byId.get(textId)?.block_type === 2 && byId.get(imageId)?.block_type === 27;
}
type RegionBinding = { sectionId: string; textId: string; imageId: string; team: Team };
/** Follow the live order of both generated blocks, including blocks inside columns and tables. */
export function attachBoundRegions(sections: Section[], bindings: RegionBinding[], report?: (issue: { sections: string[]; message: string }) => void) {
  const blocks = new Map<string, { section: Section; type: string; order: number }>();
  function visit(section: Section, list: ContentBlock[]) {
    for (const block of list) {
      blocks.set(block.id, { section, type: block.type, order: blocks.size });
      if (block.children) visit(section, block.children);
    }
  }
  sections.forEach(section => visit(section, section.blocks));
  const warnings: string[] = [];
  function warn(message: string, ...affected: (Section | undefined)[]) {
    warnings.push(message);
    const ids = [...new Set(affected.flatMap(section => section ? [section.id] : []))];
    if (ids.length) report?.({ sections: ids, message });
  }
  for (const binding of [...bindings].sort((a, b) => (blocks.get(a.textId)?.order ?? Infinity) - (blocks.get(b.textId)?.order ?? Infinity))) {
    const text = blocks.get(binding.textId), image = blocks.get(binding.imageId);
    const original = findSection(sections, binding.sectionId);
    if (!original && !text && !image) continue;
    if (text?.type !== "text" || image?.type !== "image" || image.section !== text.section || text.section.id === "introduction") {
      warn("「" + binding.team.name + "」的生成图文缺失、分属不同章节或没有所属标题。请在飞书将图文放回同一阵容章节后同步", original, text?.section, image?.section);
      continue;
    }
    // Legacy bindings may be directly under a first-level category.
    if (text.section.kind !== "guide" && original !== text.section) {
      warn("「" + binding.team.name + "」的图文位于分类说明，请移入二级阵容标题后同步", original, text.section);
      continue;
    }
    if (original !== text.section) warn("「" + binding.team.name + "」" +
      (original ? "从「" + original.title + "」" : "") +
      "已移至「" + text.section.title + "」，请一并检查原章节", original, text.section);
    attachSectionTeam(sections, text.section.id, binding.team);
    (text.section.generatedRegions ??= {})[binding.team.id] = { textId: binding.textId, imageId: binding.imageId };
  }
  return warnings;
}

function sectionParts(section: Section) {
  const generated = new Set(Object.values(section.generatedRegions ?? {}).map(region => region.textId));
  const images: string[] = [];
  const text = (blocks: ContentBlock[]): unknown[] => blocks.flatMap(block => {
    if (block.imageToken) images.push(block.imageToken);
    if (generated.has(block.id) || block.type === "image") return [];
    return [[block.type, block.text, block.elements, block.level, block.columnCount, text(block.children ?? [])]];
  });
  const body = text(section.blocks);
  const teams = sectionTeams(section).sort((a, b) => a.id.localeCompare(b.id));
  const boards = teams.flatMap(team => boardStages.flatMap(stage => {
    const board = readTeamStage(team, stage);
    if (!board.pieces.length && stage !== (team.mainStage ?? "late")) return [];
    return [{ team, stage, board, pieces: [...board.pieces].sort((a, b) => a.position - b.position) }];
  }));
  return [
    ["标题分类", [section.title, section.category, section.kind]],
    ["正文", [body, teams.map(team => [team.id, team.notes])]],
    ["站位星级", boards.map(({ team, board, pieces }) => [team.id, team.name, pieces
      .map(piece => [piece.position, piece.unitId, piece.stars]),
      board.instrumentPositions?.maracas, board.instrumentPositions?.rainstick, board.instrumentPositions?.infernalIdol])],
    ["配装", boards.map(({ team, pieces }) => [team.id, pieces
      .map(piece => [piece.position, piece.items])])],
    ["主阵与阶段", [section.primaryTeamId, section.stageTeamIds ?? [], section.team?.id, boards.map(({ team, stage }) => [team.id, stage])]],
    ["首页摘要", section.summaryBlockId],
    ["图片", images],
    ["赛季资料", [section.gameData?.id, section.gameData?.sourceDate]],
  ] as const;
}

export function sectionChanges(next: Section, previous?: Section) {
  if (!previous) return ["新增章节"];
  const before = sectionParts(previous);
  return sectionParts(next).flatMap(([label, value], i) =>
    JSON.stringify(value) === JSON.stringify(before[i][1]) ? [] : [label]);
}

export function reviewIssues(draft: DocumentDraft, liveSections: Section[]) {
  const bySection = new Map<string, string[]>();
  const general: string[] = [];
  for (const issue of draft.sectionIssues ?? []) for (const id of issue.sections) {
    bySection.set(id, [...(bySection.get(id) ?? []), issue.message]);
  }
  for (const warning of draft.warnings) {
    if (draft.sectionIssues?.some(issue => issue.message === warning)) continue;
    const names = [...warning.matchAll(/「([^」]+)」/g)].map(match => match[1]);
    const mentions = draft.sections.filter(section => names.includes(section.title) ||
      sectionTeams(section).some(team => names.includes(team.name)));
    const prior = liveSections.filter(section => sectionTeams(section).some(team => names.includes(team.name)));
    // Old archived boards were moved before draft issues carried section IDs.
    const related = new Set([...mentions, ...prior].map(section => section.id));
    for (const section of mentions) {
      const activeName = section.title.replace(/\s*·\s*旧棋盘存档$/, "");
      if (activeName !== section.title)
        draft.sections.filter(entry => entry.title === activeName).forEach(entry => related.add(entry.id));
    }
    if (!related.size) general.push(warning);
    for (const id of related) bySection.set(id, [...(bySection.get(id) ?? []), warning]);
  }
  return { bySection, general };
}
export function duplicatePublishedTeam(sections: Section[]) {
  const owners = new Map<string, Section>();
  for (const section of sections) for (const team of sectionTeams(section)) {
    const previous = owners.get(team.id);
    if (previous && previous.id !== section.id) return "「" + team.name + "」已移动，请同时选择「" + previous.title + "」和「" + section.title + "」更新或下线";
    owners.set(team.id, section);
  }
}
export function attachSectionTeam(sections: Section[], headingId: string, team: Team) {
  const section = findSection(sections, headingId);
  if (!section) return;
  section.teams = [...sectionTeams(section).filter(entry => entry.id !== team.id), team];
  section.team = section.teams[0];
  section.kind = "guide";
}
