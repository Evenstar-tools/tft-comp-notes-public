import type { Section } from "./document";
import { sectionTeams } from "./document-flow";
import { allBlocks, authoredParagraphs, guideBoardName, guideBody, guideRoster, legacyHyperpopFinalAdvice, primaryFirst, readingNotes } from "./guide-reading";
import { heroAugmentForGuide } from "./hero-augments";
import { unlockText } from "./unlocks";
import { traitCounts, usedPopulation } from "./team";
import { rerollRoute } from "./reroll-stages";
import { boardStages, readTeamStage, stageLabels } from "./team-stages";
import type { Season, Team } from "./types";

export type PosterFormat = NonNullable<Team["posterFormat"]>;
export const posterFormats: Record<PosterFormat, string> = { quick: "站位配装", full: "完整攻略" };
export const maxPosterStages = 2;

export function defaultPosterFormat(team: Team, section?: Section): PosterFormat {
  const route = section && rerollRoute(section, team);
  return team.posterFormat ?? (team.stages || (route?.final.id === team.id && route.stages.some(stage => stage.team.id !== team.id)) ? "full" : "quick");
}

export function orderPosterStages(teams: Team[], ids: string[]) {
  const byId = new Map(teams.map(team => [team.id, team]));
  return [...new Set(ids)].flatMap(id => byId.get(id) ?? [])
    .sort((a, b) => usedPopulation(a.pieces) - usedPopulation(b.pieces));
}

function mainBoard(section: Section) {
  return primaryFirst(sectionTeams(section), section.primaryTeamId)[0];
}

export function posterStageOptions(section: Section | undefined, current: Team): Team[] {
  if (current.stages || current.mainStage) {
    return boardStages.flatMap(stage => {
      if (stage === (current.mainStage ?? "late")) return [];
      const board = readTeamStage(current, stage);
      if (!board.pieces.length) return [];
      return [{ ...board, id: current.id + "-" + stage, mainStage: stage, stages: undefined, notes: "" }];
    });
  }
  if (!section) return [];
  const route = rerollRoute(section, current);
  if (route && route.stages.length) {
    return [...new Map([...route.stages.map(stage => stage.team), route.final]
      .filter(board => board.id !== current.id).map(board => [board.id, board])).values()];
  }
  const main = mainBoard(section);
  if (!main) return [];
  const stages = orderPosterStages(sectionTeams(section), section.stageTeamIds ?? [])
    .filter(team => team.id !== main.id);
  if (current.id === main.id) return stages;
  if (!stages.some(team => team.id === current.id)) return [];
  const timeline = [...stages, main].sort((a, b) => usedPopulation(a.pieces) - usedPopulation(b.pieces));
  return timeline.slice(timeline.findIndex(team => team.id === current.id) + 1);
}

export function posterStages(section: Section | undefined, team: Team, ids?: string[]) {
  const options = posterStageOptions(section, team);
  if (team.stages && ids === undefined) return options;
  if (ids === undefined && section?.reroll) {
    const population = new Set([usedPopulation(team.pieces)]);
    const defaults = options.filter(board => {
      const size = usedPopulation(board.pieces);
      if (population.has(size)) return false;
      population.add(size);
      return true;
    });
    return defaults.slice(0, maxPosterStages);
  }
  return (ids === undefined ? options.slice(0, 1) : options.filter(option => ids.includes(option.id))).slice(0, maxPosterStages);
}

const levelPattern = /^([一二三四五六七八九十]|\d{1,2})\s*(?:级|人口)/;
function levelOf(text: string) {
  const value = text.match(levelPattern)?.[1];
  if (!value) return 0;
  return Number(value) || "一二三四五六七八九十".indexOf(value) + 1;
}

function shortText(text: string) {
  return text.trim().replace(/[ \t]+/g, " ").replace(/慢搜/g, "慢 D").replace(/D(?=[\u3400-\u9fff])/g, "D ").replace(/开锁/g, "解锁")
    .replace(/第?([一二三四五六七八九十])\s*级/g, (_, level: string) => ("一二三四五六七八九十".indexOf(level) + 1) + "级");
}

function teamCaption(team: Team) {
  const label = shortText(guideBoardName(team));
  const capPrefix = /^(?:[一二三四五六七八九十]|\d{1,2})\s*(?:级|人口)上限(?=$|[\s·])/;
  const cap = capPrefix.test(label);
  const name = label.replace(cap ? capPrefix : levelPattern, "").replace(/^[\s·|｜：:]+/, "").replace(/^成型\s*[·|｜]\s*/, "");
  const level = usedPopulation(team.pieces) + (cap ? "级上限" : "级");
  return { level, name };
}

export function posterStageTitle(team: Team) {
  if (team.mainStage || team.stages) return stageLabels[team.mainStage ?? "late"] + " · " + usedPopulation(team.pieces) + "人口";
  const { level, name } = teamCaption(team);
  return level + (name ? " " + name : "");
}

export function posterTitle(section: Section | undefined, team: Team) {
  const title = /^备选\s*·\s*/.test(team.name) ? guideBoardName(team) : section?.title ?? team.name;
  if (team.mainStage || team.stages) return { title, subtitle: posterStageTitle(team) };
  const { level, name } = teamCaption(team);
  return { title, subtitle: level + (name && !title.includes(name) ? " · " + name : "") };
}

export function posterFilename(section: Section | undefined, team: Team, format: PosterFormat) {
  const { title, subtitle } = posterTitle(section, team);
  const safe = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
  const formatName = posterFormats[format];
  const suffix = safe(subtitle.replace(" · ", "-")) + "-" + formatName;
  const readableTitle = safe(title);
  const name = readableTitle + "-" + suffix;
  if (name.length <= 86) return name + ".png";
  const compactSuffix = usedPopulation(team.pieces) + "级-" + formatName;
  return readableTitle.slice(0, 85 - compactSuffix.length).replace(/[.\s-]+$/, "") + "-" + compactSuffix + ".png";
}

const mainRoles = new Set(["主C", "主输出", "前期输出", "主坦"]);
export function posterGear(section: Section | undefined, team: Team, data: Season) {
  const roles = section ? readingNotes(section, team, data).roles : [];
  const equipped = guideRoster(team, data, roles).filter(member => member.piece.items.length);
  const core = equipped.filter(member => member.role && mainRoles.has(member.role));
  const extra = equipped.filter(member => member.role && !mainRoles.has(member.role));
  if (!core.length) return (extra.length ? extra : equipped).slice(0, 4);
  return [...core, ...extra.slice(0, Math.max(0, 4 - core.length))];
}

export function posterRequirements(section: Section | undefined, team: Team, data: Season) {
  const notes = section && readingNotes(section, team, data);
  const augment = section && heroAugmentForGuide(section);
  const requiredUnit = augment && data.units.find(unit => unit.id === augment.unitId);
  const emblem = team.pieces.flatMap(piece => piece.items
    .filter(id => id.startsWith("emblem-")).map(id => ({
      unit: data.units.find(unit => unit.id === piece.unitId),
      item: data.items.find(item => item.id === id),
    }))).find(entry => entry.unit && entry.item);
  return [
    requiredUnit && augment && augment.round + " 拿到" + requiredUnit.name + "专属强化",
    notes && notes.starHint.replace(/。$/, ""),
    emblem && emblem.unit && emblem.item && emblem.unit.name + "带" + emblem.item.name,
  ].filter((text): text is string => !!text);
}

function actions(text: string) {
  return text.split(/[。！？\r\n]+/).map(line => shortText(line)
    .replace(/^[^、，]+(?:、[^、，]+){3,}，(?=\d+级|先|再|补|换)/, ""))
    .filter(line => line &&
      !/^[\d一二三四五六七八九十]+人口(?:备选|主阵容|示例)/.test(line) &&
      !/底排依次|按参考图|按图站位|^S19|^PBE|MetaTFT|DataTFT|TFTFlow|Mobalytics|^打法\s*[:：]/i.test(line));
}

function distinct(lines: string[], limit: number) {
  return [...new Set(lines.filter(Boolean))].slice(0, limit);
}

const operatingHeading = /解锁|开锁|运营|过渡|追三|慢搜|搜牌|开局|留牌|升级|升[七八九]|(?:[一二三四五六七八九十]|\d+)级|^男爵$/;
const authorsAction = /慢 D|D\s|追|升|补|先|再|上|打工|接装|换|开|解锁|热力|刷/;
const upgradeAction = /就升|再升|升\d级|解锁提示|接.+装|稳血|代持|就换/;
type Operation = { level: number; lines: string[]; board?: Team; label?: string };

export function posterOperationTitle(step: Operation) {
  return step.board ? posterStageTitle(step.board) : step.label ?? (step.level ? step.level + "级" : "开局");
}

function guideActions(section: Section, hasBaron: boolean, includeInlineHeadings: boolean) {
  const paragraphs = new Set(authoredParagraphs(section).map(block => block.id));
  const byLevel = new Map<number, string[]>();
  let heading = "";
  for (const block of allBlocks(section.blocks)) {
    if (block.type === "heading" || (includeInlineHeadings && block.label)) {
      heading = block.text ?? "";
      continue;
    }
    if (!paragraphs.has(block.id) || !operatingHeading.test(heading) || (heading === "男爵" && !hasBaron)) continue;
    for (const line of actions(block.text ?? "")) {
      if (!authorsAction.test(line)) continue;
      // Explicit round labels in the author's notes take precedence over the heading.
      const level = levelOf(line) || levelOf(heading) || (heading === "男爵" ? 9 : 0);
      const lines = byLevel.get(level) ?? [];
      lines.push(line);
      byLevel.set(level, lines);
    }
  }
  const opening = byLevel.get(0);
  const heatStage = [...byLevel].find(([level, lines]) => level > 0 && lines.some(line => /热力.*加里奥/.test(line)));
  if (opening && heatStage) {
    const key = /900\s*热力/;
    const milestones = opening.filter(line => key.test(line));
    byLevel.set(0, opening.filter(line => !key.test(line)));
    heatStage[1].unshift(...milestones);
  }
  return byLevel;
}

const unlockName: Record<string, string> = { seraphine: "芬妮", tristana: "小炮", nasus: "狗头" };

function unlockLines(boards: Team[], data: Season, story: string[]) {
  const seen = new Set<string>();
  const units = new Map(data.units.map(unit => [unit.id, unit]));
  const names = new Map(data.traits.flatMap(trait => (trait.aliases ?? []).map(alias => [alias, trait.name] as const)));
  return new Map(boards.map(board => [board.id, board.pieces.flatMap(piece => {
    if (seen.has(piece.unitId)) return [];
    seen.add(piece.unitId);
    const unit = units.get(piece.unitId);
    if (!unit) return [];
    const text = unlockText(unit);
    if (!text) return [];
    const name = unlockName[unit.id] ?? unit.name;
    if (story.some(line => {
      const compact = line.replace(/\s+/g, "");
      return [unit.name, name].some(label => compact.includes("开" + label) ||
        compact.includes("解锁" + label) || compact.includes(label + "解锁"));
    })) return [];
    const condition = text.replace(/^额外条件[：:]\s*/, "").replace(/。$/, "")
      .replace(/「([^」]+)」/g, (quoted, word: string) => names.has(word) ? "「" + names.get(word) + "」" : quoted);
    return ["解锁" + name + " · " + condition];
  })]));
}

function fitsBoard(line: string, team: Team, data: Season) {
  const suggestion = line.replace(levelPattern, "").trim();
  const add = suggestion.match(/^(?:先)?(?:上|补)([^，。]+)/)?.[1];
  if (add) {
    const names = add.split(/[、和]/).map(name => name.trim());
    const mentioned = data.units.filter(unit => names.includes(unit.name) || unit.aliases.some(alias => names.includes(alias)));
    if (mentioned.some(unit => !team.pieces.some(piece => piece.unitId === unit.id))) return false;
  }
  const goal = suggestion.match(/^优先([二三四五六七八九十]|\d+)([^，。]+)/);
  if (goal) {
    const [, count, name] = goal;
    const counts = traitCounts(team.pieces, data.units, data.traits, data.items);
    const trait = counts.find(entry => entry.name === name) ?? counts.find(entry => entry.aliases?.includes(name));
    const amount = Number(count) || "一二三四五六七八九十".indexOf(count) + 1;
    if (trait && trait.level < amount) return false;
  }
  return true;
}

export function posterOperations(section: Section | undefined, current: Team, data: Season, stages: Team[]): Operation[] {
  if (section?.reroll && rerollRoute(section, current)?.stages.length) {
    return [...stages, current].sort((first, second) => usedPopulation(first.pieces) - usedPopulation(second.pieces)).map(board => ({
      level: usedPopulation(board.pieces), board, label: posterStageTitle(board),
      lines: actions(readingNotes(section, board, data).opening).slice(0, 3),
    }));
  }
  const main = section && mainBoard(section);
  const sequence = current.id === main?.id ? [...stages, current] : [current, ...stages];
  const ordered = sequence.sort((a, b) => usedPopulation(a.pieces) - usedPopulation(b.pieces));
  const onMainLine = main && (current.id === main.id || section?.stageTeamIds?.includes(current.id));
  const mainLine = section && onMainLine ? [main, ...posterStageOptions(section, main)] : [];
  const routeBlocks = section && new Set(mainLine.flatMap(board => guideBody(section, board).current.map(block => block.id)));
  const finalAdvice = section && onMainLine && legacyHyperpopFinalAdvice(section, current);
  const authored = section && onMainLine && routeBlocks
    ? guideActions({ ...section, blocks: section.blocks.filter(block => routeBlocks.has(block.id)) },
      ordered.some(board => board.pieces.some(piece => piece.unitId === "baron-nashor")), !!finalAdvice)
    : new Map<number, string[]>();
  if (finalAdvice) {
    const level = usedPopulation(current.pieces);
    const lines = authored.get(level) ?? [];
    if (!lines.some(line => /补奈德丽.*三编舞/.test(line)))
      authored.set(level, [...lines.filter(line => line !== "9级补奈德丽"), ...actions(finalAdvice)]);
  }
  const editorial = [...authored.values()].flat();
  const newlyUnlocked = unlockLines(ordered, data, editorial);
  const columns: Operation[] = [];
  const currentLevel = usedPopulation(current.pieces);
  if (!section || !onMainLine) {
    const opening = (section && readingNotes(section, current, data).opening) || current.notes;
    const blocks = section ? authoredParagraphs({ ...section, blocks: guideBody(section, current).current }) : [];
    const notes = [opening, ...blocks.map(block => block.text ?? "")]
      .flatMap(actions).filter(line => authorsAction.test(line) || /错过|来得多/.test(line));
    const resolved = unlockLines([current], data, notes);
    return [{ level: 0, label: section ? "变阵" : "打法", lines: distinct(notes, 2).concat(resolved.get(current.id) ?? []) }];
  }
  const firstLevel = current.id === main?.id ? 0 : currentLevel;
  const relevantLevels = [...new Set([...authored.keys(), ...stages.map(board => usedPopulation(board.pieces)), currentLevel])]
    .filter(level => level >= firstLevel).sort((a, b) => a - b);
  for (const level of relevantLevels) {
    const stageBoards = stages.filter(board => usedPopulation(board.pieces) === level);
    const written = (authored.get(level) ?? []).filter(line => level !== currentLevel || stageBoards.length || fitsBoard(line, current, data));
    for (const [index, stage] of stageBoards.entries()) {
      const ownNotes = actions(stage.notes);
      const tip = index === 0 ? written.find(line => upgradeAction.test(line) && !ownNotes.includes(line)) : undefined;
      columns.push({ level, board: stage, lines: distinct([...ownNotes, tip ?? ""], 2).concat(newlyUnlocked.get(stage.id) ?? []) });
    }
    if (!stageBoards.length) {
      const ownNotes = level === currentLevel ? actions(current.notes).filter(line => /接.+装|接.+输出|代持|换装/.test(line)) : [];
      const lines = distinct([...written, ...ownNotes], level === 0 ? 6 : 3);
      if (level === currentLevel) lines.push(...(newlyUnlocked.get(current.id) ?? []));
      if (lines.length) columns.push({ level, lines });
    } else if (level === currentLevel) {
      // A same-level unlock board is still a separate stage from the selected finished board.
      const lines = distinct(actions(current.notes).filter(line => /接.+装|代持|换装/.test(line)), 2);
      lines.push(...(newlyUnlocked.get(current.id) ?? []));
      if (lines.length) columns.push({ level, label: level + "级成型", lines });
    }
  }
  return columns;
}

export function posterLayout(section: Section | undefined, team: Team, data: Season, format: PosterFormat, stageIds?: string[]) {
  const stages = format === "full" ? posterStages(section, team, stageIds) : [];
  const phased = !!(team.stages || team.mainStage);
  const boards = phased ? [...stages, team] : [team];
  const notes = format === "full" ? posterOperations(section, team, data, phased ? [] : stages) : [];
  const operations = notes.map(step => step.board && (phased || step.board.id === team.id)
    ? { ...step, label: posterOperationTitle(step), board: undefined } : step)
    .filter(step => step.board || step.lines.length);
  return {
    stages,
    boards,
    operations,
    filename: posterFilename(section, team, format),
  };
}
