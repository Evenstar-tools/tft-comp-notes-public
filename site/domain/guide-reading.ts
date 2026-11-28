import type { ContentBlock, Section } from "./document";
import type { Piece, Season, Team, Unit } from "./types";
import { unitSearchNames } from "./unit-search.mjs";
import { rerollRoute } from "./reroll-stages.ts";
import { guideBoardKind, usedPopulation } from "./team.ts";
import { AD_GRAVES_BOARD_IDS, GUIDE_SECTION_IDS, HYPERPOP_BLOCK_IDS, PYKE_GRAVES_BOARD_ID } from "./guide-identities.ts";
import { canonicalGuidePath } from "./guide-slugs.ts";
import { sourceSectionTitle } from "./source-category-display.ts";
import { displayGuideName } from "./trait-names.mjs";

export function allBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.flatMap(block => [block, ...allBlocks(block.children ?? [])]);
}

export function ownerGuideDefaultBoard(section: Section, teamId: string | undefined) {
  if (!teamId || !section.reroll?.added?.includes(teamId)) return teamId;
  return section.primaryTeamId ?? section.team?.id ?? teamId;
}

export function guideSectionWithCurrentNames(section: Section): Section {
  const renameTeam = (team: Team): Team => ({
    ...team,
    name: displayGuideName(team.name),
    ...(team.webTitle && { webTitle: displayGuideName(team.webTitle) }),
  });
  const renameHeadings = (blocks: ContentBlock[]): ContentBlock[] => blocks.map(block => {
    const title = (block.type === "heading" || block.label) && block.text ? displayGuideName(block.text) : block.text;
    return {
      ...block,
      ...(title !== block.text && {
        text: title,
        elements: block.elements?.map(element => element.text_run ? {
          ...element, text_run: { ...element.text_run, content: displayGuideName(element.text_run.content) },
        } : element),
      }),
      ...(block.children && { children: renameHeadings(block.children) }),
    };
  });
  return {
    ...section,
    title: displayGuideName(sourceSectionTitle(section)),
    ...(section.title === section.category ? { category: sourceSectionTitle(section) } : {}),
    blocks: renameHeadings(section.blocks),
    ...(section.team && { team: renameTeam(section.team) }),
    ...(section.teams && { teams: section.teams.map(renameTeam) }),
    ...(section.reroll && { reroll: { ...section.reroll, stages: section.reroll.stages.map(stage => ({
      ...stage, name: displayGuideName(stage.name),
    })) } }),
  };
}

const authoringInstructions = "在本篇文档维护 S19 阵容推荐。一级标题用于分类，二级标题用于阵容，三级标题用于变种与运营说明。网页同步后先进入草稿，预览并发布后才对访客可见。";
export const boardLoadoutHeading = "各棋盘配装";
const boardLoadoutPrefix = "棋盘配装 · ";

const creditLine = /^(B站|阵容原创)[：:][ \t]*(\S[^\r\n]*)$/u;

export function guideCredit(section: Section) {
  for (const block of section.blocks) {
    if (block.type !== "text") continue;
    const match = creditLine.exec(block.text?.trim() ?? "");
    if (match) return { id: block.id, label: match[1] + "：", name: match[2] };
  }
}

export function isBoardLoadout(block: ContentBlock) {
  return block.type === "text" && (block.text?.startsWith(boardLoadoutPrefix) ?? false);
}

export function isAuthoringIntroduction(section: Section) {
  if (section.id !== "introduction") return false;
  const blocks = allBlocks(section.blocks).filter(block => block.type !== "text" || block.text?.trim());
  if (blocks.length === 1 && blocks[0].type === "text" && blocks[0].text?.trim() === authoringInstructions) return true;
  const opening = blocks.filter(block => block.type !== "quote" || !!block.text || !block.children?.length);
  return opening.some(block => /^(?:更新预览|环境观察)/.test(block.text ?? "")) &&
    opening.every(block => block.type === "text" && /^(?:更新预览|环境观察)?\s*(?:[（(]?待编辑[)）]?)?$/.test(block.text?.trim() ?? ""));
}

export function isEditorialSection(section: Section) {
  if (isAuthoringIntroduction(section) || section.title.trim() === "阵容编辑示例（待填）" ||
      section.title.trim().endsWith("· 旧棋盘存档")) return true;
  return section.title === "更新记录" && section.blocks.length === 1 && section.blocks[0].type === "text" &&
    section.blocks[0].text?.trim() === "2026-11-16：建立 S19 编辑文档。游戏资料仍处于预览阶段，未公布阈值保留 X。";
}

export function authoredParagraphs(section: Section) {
  const generated = new Set(Object.values(section.generatedRegions ?? {}).map(region => region.textId));
  return allBlocks(section.blocks).filter(block =>
    block.type === "text" && !block.label && block.text?.trim() && !generated.has(block.id) &&
    !block.text.startsWith("【阵容构建器 · ") && !isBoardLoadout(block) && !creditLine.test(block.text.trim()),
  );
}

export function primaryFirst(teams: Team[], primaryId?: string): Team[] {
  const primary = teams.find(team => team.id === primaryId);
  return primary ? [primary, ...teams.filter(team => team.id !== primary.id)] : teams;
}

function cleanBoardName(name: string) {
  return name.replace(/^备选\s*·\s*|\s*·\s*[一二三四五六七八九十\d]+人口主阵容$/g, "");
}

export function guideBoardName(team: Team) {
  return cleanBoardName(team.webTitle ?? team.name);
}

function titleCore(text: string) {
  return text.toLowerCase().replace(/速[七八九\d]/g, "").replace(/[\s·•&/＋+\-—()（）一二三四五六七八九十\d]/g, "");
}

function isSubsequence(needle: string, haystack: string) {
  if (!needle) return false;
  let index = 0;
  for (const ch of haystack) if (ch === needle[index]) index += 1;
  return index === needle.length;
}

export function guideEditorTitle(sectionTitle: string, boardName: string, ...extras: (string | undefined)[]) {
  const s = sectionTitle.trim();
  const b = boardName.trim();
  const cs = titleCore(s);
  const cb = titleCore(b);
  const base = !b || b === s ? [s]
    : !s ? [b]
    : cs && cb && isSubsequence(cs, cb) ? [b]
    : cs && cb && cs.includes(cb) ? [s]
    : [s, b];
  return [...new Set([...base, ...extras.map(part => part?.trim() ?? "")].filter(Boolean))].join(" · ");
}

export function matchingGear(team: Team, data: Season, query: string, aliases: Record<string, string> = {}) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const ids = new Set(team.pieces.flatMap(piece => piece.items ?? []));
  return data.items.filter(item => ids.has(item.id) && (
    item.name.toLowerCase().includes(needle) ||
    Object.entries(aliases).some(([alias, canonical]) => canonical === item.name && alias.toLowerCase().includes(needle))
  ));
}

export function matchGuideTeams(teams: Team[], data: Season, query: string, aliases?: Record<string, string>) {
  const words = query.trim().toLowerCase();
  if (!words) return teams;
  const matches = (text?: string) => text?.toLowerCase().includes(words);
  return teams.filter(team => matches(team.name) || matchingGear(team, data, words, aliases).length || team.pieces.some(piece => {
    const unit = data.units.find(entry => entry.id === piece.unitId);
    return unit && (unitSearchNames(unit).some(matches) ||
      data.traits.some(trait => unit.traits.includes(trait.id) && [trait.name, trait.nameEn, ...(trait.aliases ?? [])].some(matches)));
  }));
}

export function sourceSummary(section: Section) {
  const paragraphs = authoredParagraphs(section);
  return paragraphs.find(block => block.id === section.summaryBlockId)?.text?.trim();
}

export type GuideSearchScope = "all" | "carry" | "unit";
export type GuideSort = "recommended" | "mean" | "category";
export type GuideFilters = { view?: string; q?: string; category?: string; style?: string; cost?: string; sort?: GuideSort; scope?: GuideSearchScope; exclude?: "rakan" | "none"; metric?: "pickRate" | "mean" | "topFourRate" | "winRate"; direction?: "asc" | "desc" };

export function parseGuideFilters(values: Record<string, string | string[] | undefined>): GuideFilters {
  const read = (key: keyof GuideFilters) => {
    const value = values[key];
    const text = Array.isArray(value) ? value.find(part => part.trim()) : value;
    return text?.trim().slice(0, 60) || undefined;
  };
  const view = read("view"), sort = read("sort"), cost = read("cost"), scope = read("scope"), style = read("style");
  const oldCategory = read("category");
  const category = oldCategory === "次选成熟阵容" || oldCategory === "次选阵容" || oldCategory === "暂不推荐"
    ? "次选" : oldCategory;
  const archiveTier = category && ["推荐", "次选", "待复核"].includes(category) ? category : undefined;
  const hero = view === "hero-augments" || oldCategory === "英雄强化阵容";
  const legacyStyle = oldCategory === "慢搜阵容" ? "慢搜" : oldCategory === "高费阵容" ? "高费运营" : undefined;
  const topic = oldCategory === "纹章阵容" ? "纹章" : undefined;
  const query = read("q");
  const exclude = read("exclude");
  const metric = read("metric"), direction = read("direction");
  return {
    view: view === "comp-trends" ? view : hero ? "hero-augments" : undefined,
    sort: sort === "mean" || sort === "category" ? sort : oldCategory && !archiveTier && !hero ? "category" : undefined,
    ...(scope === "carry" || scope === "unit" ? { scope } : {}),
    ...(exclude === "rakan" || exclude === "none" ? { exclude } : {}),
    ...(sort === "mean" && (metric === "pickRate" || metric === "mean" || metric === "topFourRate" || metric === "winRate") ? { metric } : {}),
    ...(sort === "mean" && (direction === "asc" || direction === "desc") ? { direction } : {}),
    q: topic && query !== topic ? [query, topic].filter(Boolean).join(" + ") : query,
    category: hero ? undefined : archiveTier,
    style: playstyleCode(style) ?? style ?? legacyStyle,
    cost: cost && /^[1-9]$/.test(cost) ? cost : undefined,
  };
}

export function guideLink(sectionId: string, teamId?: string, from?: string) {
  return canonicalGuidePath(sectionId, teamId, { from: from || undefined });
}

export function validVersionReturn(value: unknown) {
  if (typeof value !== "string" || value.length > 1024 || !/^\/updates(?:[?#]|$)/.test(value) || /[\r\n\t\\]/.test(value)) return;
  const url = new URL(value, "https://tft.local");
  if (url.pathname !== "/updates" || (url.hash && !/^#(?:patch-changes|patch-recommendations|eight-board-samples)$/.test(url.hash))) return;
  const keys = [...url.searchParams.keys()];
  if (keys.every(key => ["entry", "q", "category"].includes(key)) && keys.length === new Set(keys).size) return value;
}

// Editorial references to the author's published paragraphs. The words and numbers come
// from the section being read, so a later Feishu edit or a rollback uses its own text.
const hyperpop = {
  section: GUIDE_SECTION_IDS.hyperpopSeraphine,
  main: "00000000-0000-4000-8000-000000000042",
  jazz: "00000000-0000-4000-8000-000000000098",
  ...HYPERPOP_BLOCK_IDS,
};

function isHyperpopMain(section: Section, team: Team) {
  return section.id === hyperpop.section && team.id === hyperpop.main;
}

const legacyHyperpopBoardNote = "九人口主阵容按参考图摆位、配装。三星可酷伯单顶，二星斯维因和盖伦站第二排，底排依次为吉格斯、萨勒芬妮、提莫、崔丝塔娜、璐璐、奈德丽。八人口先用前八人，累计 900 热力后买到一星提莫即可开五高能，九人口补奈德丽开三编舞。九人口成型目标为两星提莫，盖伦、奈德丽按一星展示。";

export function legacyHyperpopFinalAdvice(section: Section, team: Team) {
  if (isHyperpopMain(section, team) && team.notes?.trim() === legacyHyperpopBoardNote)
    return "九级补奈德丽开三编舞。";
}

type RouteStep = { label: string; text: string; team?: Team };

export const oceanGravesGuideId = GUIDE_SECTION_IDS.oceanGraves;
export const oceanGravesUnlockBoardId = "00000000-0000-4000-8000-000000000062";

export function guideRoute(section: Section, teams: Team[], current: Team): { phases: RouteStep[]; choices?: RouteStep[]; opening?: string } | undefined {
  const oceanGraves = section.id === oceanGravesGuideId;
  const guide = section.id;
  if (guide === GUIDE_SECTION_IDS.jazzJinx) {
    const steps = [...teams].sort((a, b) => usedPopulation(a.pieces) - usedPopulation(b.pieces))
      .map(team => ({ label: guideBoardName(team), text: "", team }));
    return { phases: steps.slice(0, 1), choices: steps.slice(1) };
  }
  if (guide === GUIDE_SECTION_IDS.classicalJhin || guide === GUIDE_SECTION_IDS.threeJazzSmeech ||
      guide === GUIDE_SECTION_IDS.jazzPykeAurora) {
    const [primary] = primaryFirst(teams, section.primaryTeamId);
    const phases = teams.filter(team => team === primary || section.stageTeamIds?.includes(team.id))
      .sort((a, b) => usedPopulation(a.pieces) - usedPopulation(b.pieces));
    const step = (team: Team) => ({ label: guideBoardName(team), text: "", team });
    return { phases: phases.map(step), choices: teams.filter(team => !phases.includes(team)).map(step) };
  }
  if (section.id === "sample-block-1060") {
    const phases = [...teams].sort((a, b) => usedPopulation(a.pieces) - usedPopulation(b.pieces))
      .map(team => ({ label: guideBoardName(team), text: "", team }));
    return { phases };
  }
  const staged = rerollRoute(section, current);
  if (!oceanGraves && staged && (staged.stages.length || staged.variants.length)) {
    const phases = staged.stages.map(stage => ({ label: stage.name, text: "", team: stage.team }));
    if (!phases.some(step => step.team.id === staged.final.id)) {
      const population = usedPopulation(staged.final.pieces);
      const chase = isSlowRoll(authoredStrategy(section)) && staged.stages.some(stage => usedPopulation(stage.team.pieces) < population);
      const upper = isHyperpopMain(section, staged.final) || /^[一二三四五六七八九十\d]+级\s*上限/.test(guideBoardName(staged.final));
      const label = population + "级" + (upper ? "上限" : chase ? "补齐" : "成型");
      phases.push({ label, text: "", team: staged.final });
    }
    if (staged.stages.some(stage => stage.boardRole === "stage")) {
      phases.sort((a, b) => usedPopulation(a.team.pieces) - usedPopulation(b.team.pieces));
    }
    const choices = staged.variants.map(variant => ({ label: variant.name, text: variant.notes, team: variant.team }));
    return { phases, ...(choices.length && { choices }) };
  }
  const paragraphs = authoredParagraphs(section).flatMap(block => sentences(block.text ?? ""));
  const line = (start: string) => paragraphs.find(text => text.startsWith(start)) ?? "";
  const board = (start: string) => teams.find(team => displayGuideName(team.name).startsWith(start));
  const phase = (label: string, team?: Team, text = team?.notes ?? ""): RouteStep => ({ label, team, text });

  if (isHyperpopMain(section, current)) {
    const heat = line("到 900 热力");
    return { phases: [
      phase("六级慢搜", undefined, line("五级慢搜吉格斯") + line("六级上四高能")),
      phase("七级补位", undefined, line("七级上盖伦") + line("优先开四高能")),
      phase("八级等提莫", undefined, [heat, line("八级热力没满")].filter(Boolean).join("")),
      phase("9级上限", current, paragraphs.find(text => text.includes("九级补奈德丽开三编舞"))?.match(/九级补奈德丽开三编舞[^。]*。?$/)?.[0] ??
        legacyHyperpopFinalAdvice(section, current)),
    ].filter(step => step.team || step.text) };
  }
  if (oceanGraves) {
    if (AD_GRAVES_BOARD_IDS.some(id => id === current.id)) {
      const [landing, upgrade] = AD_GRAVES_BOARD_IDS.map(id => teams.find(team => team.id === id));
      return {
        phases: landing ? [phase(guideBoardName(landing), landing, "")] : [],
        choices: upgrade ? [phase(guideBoardName(upgrade), upgrade, "")] : [],
      };
    }
    if (current.id === PYKE_GRAVES_BOARD_ID) return { phases: [] };
    const find = (id: string) => teams.find(team => team.id === id);
    const step = (label: string, id: string, prefix: string) => phase(label, find(id) ?? board(prefix), section.reroll?.advice[id]);
    return {
      phases: [
        step("7级 · 解锁扎克", oceanGravesUnlockBoardId, "七级"),
        step("8级 · 七海成型", "00000000-0000-4000-8000-000000000075", "八级"),
        step("9级上限 · 七海岩雀", "00000000-0000-4000-8000-000000000076", "九级"),
      ].filter(entry => entry.team),
    };
  }
}

function textKey(text: string) {
  return text.replace(/^(?:备选|变阵|主阵|过渡|上限)[\s·：:]*/, "").replace(/[\s·]/g, "").trim();
}

function stageLabel(block: ContentBlock) {
  return block.type === "heading" || block.label === true;
}

/** Standalone bold labels and legacy H3s retain the same stage and variant boundaries. */
export function guideBody(section: Section, team: Team) {
  const roster = [...new Map([...(section.team ? [section.team] : []), ...(section.teams ?? []), team]
    .map(entry => [entry.id, entry])).values()];
  const primary = section.primaryTeamId ?? section.team?.id ?? section.teams?.[0]?.id;
  const groups: ContentBlock[][] = [[]];
  const captions = new Set(Object.values(section.generatedRegions ?? {}).map(region => region.textId));
  for (const block of section.blocks) {
    if (captions.has(block.id)) continue;
    if (stageLabel(block)) groups.push([]);
    groups.at(-1)!.push(block);
  }
  const boardLabel = (entry: Team) => entry.name ? textKey(cleanBoardName(entry.name)) : "";
  const stageLevel = (label: string) => {
    const raw = label.match(/^([一二三四五六七八九十]|\d{1,2})(?:级|人口)/)?.[1];
    return raw ? Number(raw) || "一二三四五六七八九十".indexOf(raw) + 1 : 0;
  };
  const visible = new Set<string>();
  const shared = new Set<string>();
  for (const content of groups) {
    const heading = content[0] && stageLabel(content[0]) ? content[0] : undefined;
    const label = textKey(heading?.text ?? "");
    if (heading?.text === boardLoadoutHeading) continue;
    const common = /^(?:通用|共用|共同)/.test(label);
    const stage = stageLevel(label);
    const named = label && roster.find(entry => boardLabel(entry) === label);
    const stageMatches = stage ? roster.filter(entry => stageLevel(boardLabel(entry)) === stage) : [];
    const jazz = section.id === hyperpop.section && heading &&
      content.some(block => block.id === hyperpop.jazzWhen || block.id === hyperpop.jazzItems);
    const owner = jazz ? hyperpop.jazz : named ? named.id : stageMatches.length === 1 ? stageMatches[0].id : undefined;
    const includeUnassigned = common || (owner ? owner === team.id : team.id === primary || !primary);
    const body = content.filter(block => block !== heading && !isBoardLoadout(block)).filter(block => {
      const marker = block.text?.split(/[。！：:\n]/, 1)[0].trim();
      const explicit = marker ? roster.find(entry => boardLabel(entry) === textKey(marker)) : undefined;
      if (explicit) return explicit.id === team.id;
      if (section.id === hyperpop.section && (block.id === hyperpop.jazzWhen || block.id === hyperpop.jazzItems))
        return team.id === hyperpop.jazz;
      return includeUnassigned;
    });
    if (heading && (body.length || (includeUnassigned && content.length === 1))) visible.add(heading.id);
    for (const block of body) {
      visible.add(block.id);
      if (common) shared.add(block.id);
    }
  }
  return {
    current: section.blocks.filter(block => visible.has(block.id)),
    remaining: section.blocks.filter(block => !visible.has(block.id) && !isBoardLoadout(block) && block.text !== boardLoadoutHeading),
    shared,
  };
}

const rollAtLevel = /(?<!不在)([456789四五六七八九])(?:级|人口)[\s·，,]*(?:再|先|留利息|卡利息|一起)?\s*(?:起搜|[慢大][搜D]|[搜D](?![a-z])|找(?:到)?[一两二三123]星|追[三3])/i;
const stopToRoll = /(?:停|卡)(?:在)?([456789四五六七八九])(?:级|人口)?[\s·，,]*(?:一起)?(?:[慢大]?[搜D]|追[三3])/i;

function authoredStrategy(section: Section, team?: Team) {
  const styleIn = (blocks: ContentBlock[]) => blocks.map(block => block.text?.match(/^(?:打法|运营类型)\s*[：:]\s*([^。；;，,\n]{1,18})/)?.[1]?.trim()).find(Boolean);
  const boardStyle = team && styleIn(authoredParagraphs({ ...section, blocks: guideBody(section, team).current }));
  return boardStyle || styleIn(authoredParagraphs(section)) || "";
}

function playstyleCode(style?: string) {
  if (/^(?:84|速[八8](?:运营)?)$/.test(style ?? "")) return "84";
  if (/^(?:95|速[九9](?:运营)?)$/.test(style ?? "")) return "95";
}

export function guidePlaystyle(section: Section, team?: Team): "84" | "95" | undefined {
  if (section.id === GUIDE_SECTION_IDS.oceanGraves && team?.id === PYKE_GRAVES_BOARD_ID) return "95";
  const style = authoredStrategy(section, team);
  if (style === "84" || style === "95") return style;
  return playstyleCode(style);
}

export function guideTitleWithoutPlaystyle(title: string, playstyle: ReturnType<typeof guidePlaystyle>) {
  if (!playstyle || !title.endsWith(playstyle)) return title;
  return title.slice(0, -playstyle.length).replace(/\s*·?\s*$/, "").trim() || title;
}

function isSlowRoll(style: string) {
  return /慢\s*[搜D]|追三/.test(style);
}

// Published routes whose formation needs an explicit editorial label.
const reviewedFormation: Record<string, string> = {
  "00000000-0000-4000-8000-000000000104": "9级成型",
  "00000000-0000-4000-8000-000000000093": "9级成型",
  "00000000-0000-4000-8000-000000000078": "8级稳血",
};

export function repeatsFormationLabel(style: string | undefined, strategy: string | undefined) {
  return (style === "84" && strategy === "8级成型") || (style === "95" && strategy === "9级成型");
}

export function guideStrategyLabel(section: Section, team: Team, data: Season, primary: Team) {
  const kind = guideBoardKind(section, team, primary);
  if (kind === "过渡") return;
  const { styleLabel } = guideFacets(section, team, data);
  if (styleLabel) return styleLabel;
  const reviewed = reviewedFormation[team.id];
  if (reviewed) return reviewed;
  const tag = guidePlaystyle(section, team);
  const formation = tag === "84" ? 8 : tag === "95" ? 9 : undefined;
  if (!formation) return;
  const population = usedPopulation(team.pieces);
  if (population === formation || (population > formation && kind !== "变阵")) return formation + "级成型";
}

/** Only explicit rolling instructions count. A final board's population may be higher. */
export function guideRollLevel(section: Section, team: Team): number | undefined {
  if (section.reroll?.stages.some(stage => stage.teamId === team.id && !stage.boardRole)) return usedPopulation(team.pieces);
  const { current } = guideBody(section, team);
  const paragraphs = authoredParagraphs({ ...section, blocks: current }).map(block => block.text ?? "");
  const bullets = current.filter(block => block.type === "bullet" || block.type === "ordered").map(block => block.text ?? "");
  const strategy = paragraphs.filter(text => /^(?:打法|运营类型)[：:]/.test(text));
  for (const text of [team.name, ...strategy, team.notes, ...paragraphs, ...bullets]) {
    const value = text?.match(rollAtLevel)?.[1] ?? text?.match(stopToRoll)?.[1];
    if (value) return Number(value) || "〇一二三四五六七八九".indexOf(value);
  }
}

export function guideFacets(section: Section, team: Team | undefined, data: Season) {
  if (!team) return { style: "", costs: [] as number[] };
  const paragraphs = authoredParagraphs(section).map(block => block.text ?? "");
  const line = (pattern: RegExp) => paragraphs.map(text => text.match(pattern)?.[1]?.trim()).find(Boolean) ?? "";
  // Future guides can declare these directly in their Feishu text.
  const authoredStyle = authoredStrategy(section, team);
  const authoredCarries = line(/^(?:主[ＣC]|核心输出)\s*[：:]\s*([^。；;\n]+)/i);
  const boardCarries = new Set(readingNotes(section, team, data).roles.filter(role => role.label === "主C" || role.label === "主输出").flatMap(role => role.units));
  const pilot = section.id === hyperpop.section && [hyperpop.main, hyperpop.jazz].includes(team.id);
  const carries = data.units.filter(unit => team.pieces.some(piece => piece.unitId === unit.id) && (
    boardCarries.size ? boardCarries.has(unit.id) :
      authoredCarries ? authoredCarries.split(/[、，,／/＋+和与]/).some(name => [unit.name, unit.nameEn].includes(name.trim())) : pilot && unit.id === "ziggs"
  ));
  const costs = [...new Set(carries.map(unit => unit.cost))].sort((a, b) => a - b);
  const style = authoredStyle || (pilot ? "低费慢搜" : "");
  const styleLabel = isHyperpopMain(section, team) ? "1/2费慢搜"
    : isSlowRoll(style) && costs.length && costs.every(cost => cost <= 3)
      ? costs.join("/") + "费慢搜" : undefined;
  return { style, styleLabel, costs };
}

export type GuideRole = { label: string; units: string[]; text: string };

export function guideUnitMatch(piece: Piece, unit: Unit, roles: GuideRole[], items: Season["items"], options: {
  familyCarry: boolean; transition: boolean; sampled: boolean;
}) {
  const authoredCarries = roles.filter(role => role.label === "主C" || role.label === "主输出").flatMap(role => role.units);
  const labels = roles.filter(role => role.units.includes(unit.id)).map(role => role.label);
  const secondary = labels.some(label => ["副C", "物理输出", "后期输出"].includes(label));
  const tank = labels.find(label => label === "主坦" || label === "副坦");
  const gloves = piece.items?.some(id => /Thie(?:fs|ves)Gloves/i.test(id));
  const carry = !gloves && (authoredCarries.includes(unit.id) || (!authoredCarries.length && !tank && !secondary && options.familyCarry));
  const mainCarry = carry && !options.transition;
  const completed = (piece.items ?? []).filter(id => items.some(item => item.id === id &&
    item.category !== "component" && item.category !== "team-size")).length;
  const geared = piece.stars === (unit.cost <= 3 ? 3 : 2) && completed === 3;
  // The conditional sample confirms the build. Its average placement never decides search relevance.
  const rank = mainCarry ? 10 + Number(geared) + 2 * Number(options.sampled) :
    options.transition ? 1 : secondary && !gloves ? 3 : 2;
  const role = carry ? (options.transition ? "过渡" : "主C") : tank ?? (secondary && !gloves ? "副C" : "上阵");
  const gear = carry && completed ? ` · ${completed}件成装` : "";
  const stars = piece.stars ? ` · ${piece.stars}星` : "";
  return { mainCarry, rank, unitLabel: `${unit.name.split(" · ")[0]} ${role}${stars}${gear}` };
}

const rolePriority = new Map([
  ["主C", 0], ["主输出", 0], ["前期输出", 0],
  ["主坦", 1],
  ["副C", 2], ["后期输出", 2], ["物理输出", 2],
  ["副坦", 3],
]);

export function guideRoster(team: Team, data: Season, roles: GuideRole[]) {
  const units = new Map(data.units.map(unit => [unit.id, unit]));
  const rolesByUnit = new Map<string, { label: string; priority: number; order: number }>();
  let order = 0;
  for (const { label, units: ids } of roles) {
    const priority = rolePriority.get(label) ?? 4;
    for (const id of ids) {
      const previous = rolesByUnit.get(id);
      if (!previous || priority < previous.priority) rolesByUnit.set(id, { label, priority, order });
      order++;
    }
  }

  return team.pieces.flatMap(piece => {
    const unit = units.get(piece.unitId);
    return unit ? [{ piece, unit, role: rolesByUnit.get(unit.id) }] : [];
  }).sort((a, b) => {
    const aCount = a.piece.items.length;
    const bCount = b.piece.items.length;
    const positionOrder = a.piece.position - b.piece.position;
    if (!aCount || !bCount) return bCount - aCount || positionOrder;
    return (a.role?.priority ?? 5) - (b.role?.priority ?? 5) ||
      (a.role?.order ?? order) - (b.role?.order ?? order) ||
      bCount - aCount || positionOrder;
  }).map(({ piece, unit, role }) => ({ piece, unit, role: role?.label }));
}

export type GuideShortcut = { label: string; blockId: string };
function sentences(text: string) { return text.match(/[^。！？]+[。！？]?/g)?.map(part => part.trim()) ?? []; }

function parseRoles(lines: string[], team: Team, data: Season): GuideRole[] {
  const members = data.units.filter(unit => team.pieces.some(piece => piece.unitId === unit.id));
  const roles: GuideRole[] = [];
  for (const line of lines) {
    const match = line.match(/^(主C|副C|主坦|副坦|功能装)[：:]\s*([^。]+)。\s*(.+)/i);
    if (!match) continue;
    const names = new Set(match[2].split(/[、，,]/).map(name => name.trim()));
    const units = [...names].flatMap(name => members.filter(unit => unit.name === name).map(unit => unit.id));
    roles.push({ label: match[1].toUpperCase(), units, text: match[3] });
  }
  return roles;
}

function authoredRoles(section: Section, team: Team, data: Season) {
  return parseRoles(authoredParagraphs({ ...section, blocks: guideBody(section, team).current }).map(block => block.text ?? ""), team, data);
}

function boardRoles(section: Section, team: Team, data: Season) {
  if (!team.name) return [];
  const name = displayGuideName(team.name);
  const block = allBlocks(section.blocks).find(entry => isBoardLoadout(entry) &&
    displayGuideName(entry.text!.split("\n", 1)[0].slice(boardLoadoutPrefix.length)) === name);
  return block?.text ? parseRoles(block.text.split("\n").slice(1), team, data) : [];
}

export function readingNotes(section: Section, team: Team, data?: Season) {
  const blocks = allBlocks(section.blocks);
  const body = guideBody(section, team);
  const current = allBlocks(body.current);
  const passage = (id: string) => blocks.find(block => block.id === id)?.text?.trim() ?? "";
  const isPrimary = team.id === (section.primaryTeamId ?? section.team?.id ?? section.teams?.[0]?.id);
  const source = isPrimary ? sourceSummary(section) : undefined;
  const originalMain = isHyperpopMain(section, team) && team.pieces.some(piece => piece.unitId === "nidalee");
  const jazz = section.id === hyperpop.section && team.id === hyperpop.jazz;
  const roles: GuideRole[] = [];
  const shortcuts: GuideShortcut[] = [];
  const paragraphs = authoredParagraphs({ ...section, blocks: current });
  const openings = paragraphs.filter(block => !/^(?:打法|运营类型|主C|副C|主坦|副坦|功能装|专属强化)[：:]/.test(block.text ?? ""));
  const stageIntro = openings.find(block => !body.shared.has(block.id));
  let opening = source ?? (stageIntro?.text || team.notes || openings[0]?.text || "");
  let stage = "", starHint = "";
  if (originalMain) {
    opening = source ?? sentences(passage(hyperpop.rolling)).find(line => line.includes("来得多")) ?? opening;
    stage = passage(hyperpop.transition);
    const teemo = passage(hyperpop.teemo);
    const target = team.pieces.find(piece => piece.unitId === "teemo")?.stars;
    if (target && teemo.includes("一星")) starHint = "提莫一星可上，图中为" + ["", "一星", "两星", "三星"][target] + "。";
    const carries = data ? authoredRoles(section, team, data).filter(role => role.label === "主C") : [];
    if (carries.length) roles.push(...carries);
    else roles.push({ label: "前期输出", units: ["ziggs", "seraphine"], text: passage(hyperpop.damage) });
    roles.push({ label: "主坦", units: ["swain"], text: passage(hyperpop.tank) },
      { label: "后期输出", units: ["teemo"], text: teemo });
    for (const [label, blockId] of [["开局解锁", hyperpop.opening], ["搜牌与升级", hyperpop.rolling], ["热力与提莫", hyperpop.heat]]) {
      if (passage(blockId)) shortcuts.push({ label, blockId });
    }
  } else if (jazz) {
    opening = source ?? sentences(passage(hyperpop.jazzWhen))[0] ?? opening;
    for (const [label, unit] of [["主坦", "kobuko"], ["主输出", "ziggs"], ["物理输出", "tristana"]]) {
      roles.push({ label, units: [unit], text: sentences(passage(hyperpop.jazzItems))[0] ?? "" });
    }
    if (passage(hyperpop.jazzWhen)) shortcuts.push({ label: "何时转三爵士", blockId: hyperpop.jazzWhen });
  } else if (data) {
    roles.push(...authoredRoles(section, team, data));
  }
  if (!shortcuts.length) for (const block of current.filter(b => stageLabel(b) && b.text && b.text !== boardLoadoutHeading).slice(0,5)) {
    shortcuts.push({ label: block.text!, blockId: block.id });
  }
  const assigned = data ? boardRoles(section, team, data) : [];
  const revised = section.reroll?.stages.find(entry => entry.teamId === team.id);
  const advice = section.reroll?.advice[team.id];
  return { opening: revised?.notes || advice || opening, stage, starHint,
    roles: revised?.roles?.length ? revised.roles.map(role => ({ ...role, text: "" }))
      : (assigned.length ? assigned : roles).filter(role => role.text && role.units.length),
    shortcuts: revised ? [] : shortcuts };
}
