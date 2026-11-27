import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { currentGuideSeason as season, prepareFamilyPublication as prepareAuditPublication } from "./export-family-catalog.mjs";
import currentPatch from "../data/current-patch.json" with { type: "json" };
import { boardNeighbors } from "../domain/board-layout.ts";
import { sectionTeams } from "../domain/document-flow.ts";
import { allBlocks, readingNotes } from "../domain/guide-reading.ts";
import { sameEdition } from "../domain/version-updates.ts";

export { prepareAuditPublication };

export const featuredGuideIds = [
  "0243", "0420", "0229", "1020", "1110", "0051", "0338", "0307", "0251", "0854", "0006", "0275", "0171", "0281",
].map(id => "sample-block-" + id);

const stoneplate = "TFT_Item_GargoyleStoneplate";
const spectral = "TFT_Item_SpectralGauntlet";
const ionic = "TFT_Item_IonicSpark";
const whisper = "TFT_Item_LastWhisper";
// The S19 roster currently omits attack range. These are the reviewed defaults
// for the featured carries; future snapshots can supply attackRange directly.
const s19BacklineCarries = new Set(["ahri", "draven", "jhin", "jinx", "kai-sa", "kayle", "malzahar", "miss-fortune",
  "seraphine", "vayne", "xayah", "ziggs"]);
const s19Fighters = new Set(["baron-nashor", "briar", "graves", "gwen", "olaf", "pyke", "renekton", "smeech", "viego", "yone"]);
const amumuNeighbors = new Set(boardNeighbors(4));
const positioningRules = new Set(["amumu-position", "amumu-front-row", "amumu-adjacent", "amumu-carry-side",
  "stoneplate-front", "stoneplate-crowded", "crowded-frontline", "shred-side", "long-range-carry", "melee-flank"]);

const validPosition = position => Number.isInteger(position) && position >= 0 && position < 28;
const column = position => position % 7;
const sameSide = (a, b) => (column(a) <= 3 && column(b) <= 3) || (column(a) >= 3 && column(b) >= 3);
const onFlank = position => position >= 7 && position <= 13 && (column(position) <= 1 || column(position) >= 5);

export function auditGuideBoard(team, roles, data, { rangedOlaf = false } = {}) {
  const issues = [];
  const flag = (rule, message, piece, severity = "error") => issues.push({ rule, severity, message,
    ...(piece && { unitId: piece.unitId, position: piece.position }) });
  const pieces = team.pieces;
  const units = new Map(data.units.map(unit => [unit.id, unit]));
  const items = new Set(data.items.map(item => item.id));
  const roster = new Set(pieces.map(piece => piece.unitId));
  const positions = new Set(pieces.map(piece => piece.position));
  const instanceIds = new Set(pieces.map(piece => piece.instanceId));
  const alternateUnits = new Set();
  const carries = pieces.filter(piece => roles.some(role => ["主C", "主输出"].includes(role.label) && role.units.includes(piece.unitId)));
  const tanks = pieces.filter(piece => roles.some(role => role.label === "主坦" && role.units.includes(piece.unitId)));
  const carriesAndFighters = pieces.filter(piece => carries.includes(piece) || roles.some(role =>
    ["副C", "物理输出", "后期输出"].includes(role.label) && role.units.includes(piece.unitId)));
  const range = ({ unitId }) => unitId === "olaf" && rangedOlaf ? 4 : units.get(unitId)?.attackRange ?? units.get(unitId)?.stats?.range ??
    (s19BacklineCarries.has(unitId) ? 4 : s19Fighters.has(unitId) ? 1 : undefined);

  if (!carries.length || !tanks.length) flag("missing-roles", "棋盘需明确标注上场主C和主坦");
  if (positions.size !== pieces.length || pieces.some(piece => !validPosition(piece.position))) {
    flag("invalid-positions", "棋盘有重叠或越界的上场棋子");
  }
  if (instanceIds.size !== pieces.length || pieces.some(piece => !piece.instanceId)) {
    flag("instance-id", "上场棋子的实例 ID 须存在且唯一");
  }
  const markers = Object.values(team.instrumentPositions ?? {});
  if (new Set(markers).size !== markers.length || markers.some(position => !validPosition(position) || positions.has(position))) {
    flag("instrument-position", "乐器或地狱偶像与棋子重叠、越界或占用同一格");
  }

  const amumu = tanks.find(piece => piece.unitId === "amumu");
  if (amumu) {
    if (amumu.position !== 4) flag("amumu-position", "阿木木主坦须站第一排右数第三格（pos 4）", amumu);
    if (pieces.some(piece => piece !== amumu && piece.position < 7)) flag("amumu-front-row", "阿木木须独占第一排", amumu);
    if (pieces.some(piece => piece !== amumu && amumuNeighbors.has(piece.position))) flag("amumu-adjacent", "阿木木的相邻格须留空", amumu);
    for (const carry of carries) {
      const edge = range(carry) >= 4 ? carry.position === 27 : [12, 13].includes(carry.position);
      if (!edge || amumuNeighbors.has(carry.position)) flag("amumu-carry-side", "阿木木盘主C须站同侧外沿（远程 27、近战 12/13）", carry);
    }
  }

  if (pieces.filter(piece => piece.position < 7).length >= 4) flag("crowded-frontline", "第一排已有四名或更多棋子，可将副坦和战士错开", undefined, "warning");
  for (const tank of tanks.filter(piece => piece.items.includes(stoneplate))) {
    if (tank.position >= 7) flag("stoneplate-front", "石像鬼主坦优先站第一排", tank, "warning");
    else if (tank.position > 0 && tank.position < 6 && positions.has(tank.position - 1) && positions.has(tank.position + 1)) {
      flag("stoneplate-crowded", "石像鬼主坦左右两格均被友军占用", tank);
    }
  }
  const frontline = pieces.filter(piece => piece.position < 14 || tanks.includes(piece));
  for (const piece of frontline.filter(piece => piece.items.includes(spectral) || piece.items.includes(ionic))) {
    if (carries.length && !carries.some(carry => sameSide(piece.position, carry.position))) {
      flag("shred-side", "薄暮或离子持有者与主C分站两侧", piece);
    }
  }
  if (frontline.some(piece => piece.items.includes(spectral))) for (const carry of carries) {
    if (carry.items.includes(whisper)) flag("duplicate-sunder", "前排薄暮与主C轻语重复破甲", carry);
  }
  for (const piece of carriesAndFighters) {
    if (carries.includes(piece) && range(piece) >= 4 && piece.position < 21) {
      flag("long-range-carry", "射程四格及以上的主C默认站第四排", piece, "warning");
    } else if (range(piece) <= 2 && !onFlank(piece.position)) {
      flag("melee-flank", "近战输出优先站第二排侧翼（7/8 或 12/13）", piece, "warning");
    }
  }

  if (pieces.filter(piece => piece.alternate).length > 2) flag("alternate-limit", "每盘最多两个叠放替补");
  for (const piece of pieces) {
    if (!units.has(piece.unitId)) flag("invalid-unit", "上场棋子不在当前赛季名单", piece);
    const alternate = piece.alternate;
    if (alternate) {
      if (!units.has(alternate.unitId)) flag("invalid-alternate", `替补 ${alternate.unitId} 不在当前赛季名单`, piece);
      if (roster.has(alternate.unitId) || alternateUnits.has(alternate.unitId)) {
        flag("duplicate-alternate", `替补 ${alternate.unitId} 已在场或已叠放`, piece);
      }
      alternateUnits.add(alternate.unitId);
      if (!alternate.instanceId || instanceIds.has(alternate.instanceId)) flag("alternate-instance-id", "替补实例 ID 缺失或重复", piece);
      instanceIds.add(alternate.instanceId);
    }
    for (const loadout of alternate ? [piece, alternate] : [piece]) for (const id of loadout.items) {
      if (!items.has(id)) flag("invalid-item", `${loadout.unitId} 的装备 ${id} 不在当前赛季名单`, piece);
    }
  }
  return issues;
}

function linksCurrentFixedSample(block) {
  const { patch, bPatch = "" } = currentPatch.metaTftPatch;
  if (!block.text?.startsWith(`PBE ${patch}${bPatch} `)) return false;
  return block.elements?.some(element => {
    const link = element.text_run?.text_element_style?.link?.url;
    if (!link || !URL.canParse(link)) return false;
    const url = new URL(link);
    const params = url.searchParams;
    return url.origin === "https://www.metatft.com" && url.pathname === "/explorer" &&
      params.get("queue") === "PBE" && params.get("patch") === patch && (params.get("b_patch") ?? "") === bPatch &&
      params.get("tab") === "comps" && params.has("level") && params.has("days");
  });
}

const videoDomain = /(?<![\w.-])(?:[\w-]+\.)*(?:bilibili\.com|b23\.tv|youtube\.com|youtu\.be|douyin\.com)(?![\w-]|\.[\w-])/i;

export function auditGuideCopy(section) {
  const passages = [...allBlocks(section.blocks).map(block => ({
    blockId: block.id,
    text: block.text,
    linkedSample: linksCurrentFixedSample(block),
    richText: block.elements?.flatMap(({ text_run, mention_doc }) => [
      text_run?.content, text_run?.text_element_style?.link?.url, mention_doc?.url,
    ]),
  })),
    ...sectionTeams(section).map(team => ({ teamId: team.id, text: team.notes })),
    ...(section.reroll?.stages ?? []).map(stage => ({ teamId: stage.teamId, text: stage.notes })),
    ...Object.entries(section.reroll?.advice ?? {}).map(([teamId, text]) => ({ teamId, text }))];
  const oldUnlock = /薇恩[^。！？\n]{0,24}(?:打满|打|挂满|战斗|上场)[^。！？\n]{0,12}[三3]\s*回合|(?:打满|打|挂满|战斗|上场)[^。！？\n]{0,12}[三3]\s*回合[^。！？\n]{0,24}(?:开|解锁)[^。！？\n]{0,4}薇恩/;
  const oldStats = /(?:\bPBE\s*)?\b19\.1[a-z]?\b[^。！？\n]{0,40}\d[\d,，]*\s*场|棋盘均名\s*·/i;
  return passages.flatMap(({ text = "", linkedSample, richText = [], ...source }) => [
    ...(oldUnlock.test(text) ? [{ rule: "obsolete-unlock", severity: "error", message: "正文仍有薇恩旧版三回合解锁说明", ...source }] : []),
    ...(!linkedSample && oldStats.test(text) ? [{ rule: "obsolete-stats", severity: "error", message: "正文仍有写死的旧战绩", ...source }] : []),
    ...([text, ...richText].some(value => value && videoDomain.test(value))
      ? [{ rule: "video-link", severity: "error", message: "正文仍有视频平台外链", ...source }] : []),
  ]);
}

export function auditGuidePublication(publication, recommendations, { sectionIds = featuredGuideIds, overrides = [], current = season } = {}) {
  const guides = sectionIds.map(sectionId => {
    const section = publication.sections.find(entry => entry.id === sectionId);
    if (!section) return { sectionId, boards: [], issues: [{ rule: "missing-guide", severity: "error", message: "公开快照缺少攻略" }] };
    const teams = sectionTeams(section);
    const targets = new Set([
      ...teams.map(team => team.id),
      section.primaryTeamId,
      section.reroll?.entryTeamId,
      ...recommendations.entries.filter(entry => entry.sectionId === sectionId &&
        ["recommended", "conditional"].includes(entry.status)).map(entry => entry.teamId),
    ].filter(Boolean));
    const data = section.gameData ?? publication.season;
    const validData = sameEdition(data.id, current.id) ? current : data;
    const boards = [...targets].map(teamId => {
      const team = teams.find(entry => entry.id === teamId);
      if (!team) return { teamId, issues: [{ rule: "missing-board", severity: "error", message: "攻略入口或推荐棋盘不存在" }] };
      const roles = readingNotes(section, team, data).roles;
      const issues = auditGuideBoard(team, roles, validData, { rangedOlaf: sectionId === "sample-block-0281" }).map(issue => {
        const exception = positioningRules.has(issue.rule) && overrides.find(override => override.sectionId === sectionId &&
          override.teamId === teamId && override.rule === issue.rule && override.reason?.trim() &&
          (!override.unitId || override.unitId === issue.unitId));
        return exception ? { ...issue, severity: "waived", reason: exception.reason } : issue;
      });
      return { teamId, name: team.webTitle ?? team.name, roles: roles.map(({ label, units }) => ({ label, units })), issues };
    });
    const issues = auditGuideCopy(section);
    if (!boards.length) issues.push({ rule: "missing-board", severity: "error", message: "攻略没有可巡检的棋盘" });
    return { sectionId, title: section.title, boards, issues };
  });
  const issues = guides.flatMap(guide => [...guide.issues, ...guide.boards.flatMap(board => board.issues)]);
  const count = severity => issues.filter(issue => issue.severity === severity).length;
  return { summary: { guides: guides.length, boards: guides.reduce((sum, guide) => sum + guide.boards.length, 0),
    errors: count("error"), warnings: count("warning"), waived: count("waived") }, guides };
}

function main() {
  const { values } = parseArgs({ options: { strict: { type: "boolean" }, json: { type: "boolean" },
    guide: { type: "string", multiple: true }, overrides: { type: "string" } } });
  const read = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
  const overrides = values.overrides ? JSON.parse(readFileSync(values.overrides, "utf8")) : [];
  if (!Array.isArray(overrides)) throw new Error("站位豁免文件须为 JSON 数组");
  const report = auditGuidePublication(prepareAuditPublication(read("public-preview")), read("patch-recommendations"), {
    sectionIds: values.guide && [...new Set(values.guide)], overrides,
  });
  const { summary } = report;
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else {
    for (const guide of report.guides) {
      console.log(`${guide.sectionId} ${guide.title ?? ""} · ${guide.boards.length} 盘`);
      for (const issue of guide.issues) console.log(`  ${issue.severity} [${issue.rule}] ${issue.message}`);
      for (const board of guide.boards) for (const issue of board.issues) {
        console.log(`  ${issue.severity} ${board.name ?? board.teamId} [${issue.rule}] ${issue.message}${issue.unitId ? ` (${issue.unitId})` : ""}${issue.reason ? ` · ${issue.reason}` : ""}`);
      }
    }
    console.log(`${summary.guides} 篇 · ${summary.boards} 盘 · ${summary.errors} 错误 · ${summary.warnings} 提示 · ${summary.waived} 豁免`);
  }
  if (summary.errors || (values.strict && summary.warnings)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
