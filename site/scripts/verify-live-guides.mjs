import { readFileSync } from "node:fs";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { canonicalGuidePath, guideBoardSearchAliases, resolveBoardTeamId, resolveGuideSectionId } from "../domain/guide-slugs.ts";
import { buildFamilyCatalog, currentGuideSeason } from "./export-family-catalog.mjs";

const defaultOrigin = "https://tftnotes.com";
const boardKey = ({ sectionId, teamId }) => `${sectionId}/${teamId}`;
const boardFields = ["guide", "board", "edition", "kind", "stage", "roles", "style", "rollLevel", "special", "augment", "emblems"];

function indexBoards(boards, label, errors) {
  const index = new Map();
  for (const board of boards) {
    if (!board?.sectionId || !board.teamId || !Array.isArray(board.units)) {
      errors.push(`${label}含缺少稳定 ID 或名单的棋盘`);
      continue;
    }
    const key = boardKey(board);
    if (index.has(key)) errors.push(`${label}重复棋盘 ${key}`);
    index.set(key, board);
  }
  return index;
}

export function compareGuideCatalog(expected, live) {
  if (!Array.isArray(live?.boards)) return ["正式目录未返回棋盘列表"];
  const errors = [];
  if (live.seasonId !== expected.seasonId) errors.push(`赛季目录不一致（候选 ${expected.seasonId}，正式 ${live.seasonId}）`);
  const expectedByKey = indexBoards(expected.boards, "候选目录", errors);
  const liveByKey = indexBoards(live.boards, "正式目录", errors);
  for (const [key, board] of expectedByKey) {
    const current = liveByKey.get(key);
    if (!current) {
      errors.push(`正式目录漏盘 ${board.guide} · ${board.board} (${key})`);
      continue;
    }
    const fields = boardFields.filter(field => !isDeepStrictEqual(board[field], current[field]));
    if (!isDeepStrictEqual([...board.units].sort(), [...current.units].sort())) fields.push("units");
    if (fields.length) errors.push(`正式棋盘内容错配 ${board.guide} · ${board.board} (${key}) · ${fields.join("、")}`);
  }
  for (const [key, board] of liveByKey) {
    if (!expectedByKey.has(key)) errors.push(`正式目录多出未在候选登记的棋盘 ${board.guide} · ${board.board} (${key})`);
  }
  return errors;
}

const noScripts = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const decodeHTML = text => text.replace(/&(amp|quot|apos|#x27|#39|lt|gt);/gi, (_, key) =>
  ({ amp: "&", quot: '"', apos: "'", "#x27": "'", "#39": "'", lt: "<", gt: ">" })[key.toLowerCase()]);

function matchesGuideURL(raw, origin, sectionId, teamId) {
  if (typeof raw !== "string" || !URL.canParse(raw, origin)) return false;
  const href = new URL(raw, origin);
  const target = new URL(canonicalGuidePath(sectionId, teamId), origin);
  return href.origin === origin && href.pathname === target.pathname &&
    (teamId === undefined || href.searchParams.get("team") === target.searchParams.get("team"));
}

export function verifyRenderedBoard(html, board, legacyNames) {
  const markup = noScripts(html);
  const grid = markup.indexOf('aria-label="4 排 7 列阵容棋盘"');
  if (grid < 0) return false;
  const precedingGrid = markup.slice(0, grid);
  const container = precedingGrid.match(/(<div\b[^<>]*\bclass="read-board"[^<>]*>)<div\b[^<>]*$/i)?.[1];
  const selected = container?.match(/\bdata-guide-team-id="([^"]+)"/)?.[1];
  if (selected !== undefined) return selected === board.teamId;
  if (!legacyNames) return false;
  const hexLabels = [...markup.slice(grid).matchAll(/aria-label="第[1-4]排第[1-7]格 ([^"]+)"/g)].slice(0, 28);
  if (hexLabels.length !== 28) return false;
  const actual = hexLabels.flatMap(([, text]) => {
    const occupant = decodeHTML(text).match(/^(.+) [1-4]星(?: 装备：.*)?$/);
    return occupant ? [occupant[1]] : [];
  }).sort();
  return isDeepStrictEqual(actual, legacyNames);
}

async function checkGuideAccess({ origin, boards, teamId, request, legacyNames }) {
  const { sectionId, guide, special } = boards[0];
  const errors = [];
  const listPath = special === "英雄强化" ? "/?view=hero-augments" : "/?sort=category";
  const list = await request(listPath).then(response => response.text());
  const links = [...noScripts(list).matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)];
  if (!links.some(([, href]) => matchesGuideURL(decodeHTML(href), origin, sectionId))) {
    errors.push(`${guide} (${sectionId}) 未在 ${listPath} 的真实链接中找到`);
  }
  async function checkSearch(query, expectedTeamId) {
    const result = await request(`/api/search?${new URLSearchParams({ q: query })}`).then(response => response.json());
    const hits = (result.groups ?? []).flatMap(group => group.hits ?? []);
    if (!hits.some(hit => matchesGuideURL(hit.href, origin, sectionId, expectedTeamId))) {
      errors.push(`搜索「${query}」未定位 ${canonicalGuidePath(sectionId, expectedTeamId)}`);
    }
  }
  await checkSearch(guide);
  for (const board of boards) {
    if (teamId && teamId !== board.teamId) continue;
    const path = canonicalGuidePath(sectionId, board.teamId);
    const response = await request(path);
    if (!matchesGuideURL(response.url, origin, sectionId, board.teamId) ||
        !verifyRenderedBoard(await response.text(), board, legacyNames?.(board))) {
      errors.push(`${path} 没有渲染目标棋盘 ${board.teamId}`);
    }
    for (const alias of guideBoardSearchAliases(sectionId, board.teamId)) await checkSearch(alias, board.teamId);
  }
  return errors;
}

async function main() {
  const { values } = parseArgs({ options: {
    origin: { type: "string", default: defaultOrigin },
    guide: { type: "string", multiple: true, default: [] },
    "data-at": { type: "string" },
    "allow-legacy": { type: "boolean" },
  } });
  const origin = new URL(values.origin).origin;
  if (!/^https?:\/\//.test(origin)) throw new Error("--origin 须为 HTTP(S) 站点");
  const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
  const snapshot = read("../data/public-preview.json");
  const expected = buildFamilyCatalog(snapshot);
  const targets = values.guide.map(input => {
    const [guide, board, extra] = input.split(":");
    if (!guide || extra !== undefined || board === "") throw Error(`目标格式应为攻略短链或 攻略短链:棋盘短链（收到 ${input}）`);
    const sectionId = resolveGuideSectionId(guide);
    const teamId = resolveBoardTeamId(sectionId, board);
    const boards = expected.boards.filter(entry => entry.sectionId === sectionId);
    if (!boards.length || (teamId && !boards.some(entry => entry.teamId === teamId))) throw Error(`候选目录找不到 ${input}`);
    return { input, boards, teamId };
  });
  const expectedTime = values["data-at"] === "candidate" ? read("../data/guide-family-stats.json").updatedAt : values["data-at"];
  if (expectedTime !== undefined && !Number.isFinite(Date.parse(expectedTime))) throw Error("--data-at 须为有效时间戳或 candidate");
  const request = async path => {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!response.ok) throw new Error(`${path} 返回 HTTP ${response.status}`);
    return response;
  };
  const live = await request("/api/guides/catalog").then(response => response.json());
  const errors = compareGuideCatalog(expected, live);
  let actualTime;
  if (expectedTime) {
    const home = noScripts(await request("/").then(response => response.text()));
    actualTime = home.match(/class="home-patch-sample"[^>]*>[^<]*<time\s+dateTime="([^"]+)"/)?.[1];
    if (Date.parse(actualTime) !== Date.parse(expectedTime)) {
      errors.push(`首页体系批次不一致（预期 ${expectedTime}，实际 ${actualTime ?? "未显示"}）`);
    }
  }
  const legacyNames = values["allow-legacy"] ? board => {
    const units = snapshot.sections.find(section => section.id === board.sectionId)?.gameData?.units ?? currentGuideSeason.units;
    const names = new Map(units.map(unit => [unit.id, unit.name]));
    return board.units.map(id => names.get(id)).sort();
  } : undefined;
  for (const target of targets) {
    try {
      errors.push(...await checkGuideAccess({ origin, ...target, request, legacyNames }));
    } catch (error) {
      errors.push(`${target.input}：${error.message}`);
    }
  }
  console.log(JSON.stringify({ origin, seasonId: live.seasonId, expectedBoards: expected.boards.length,
    liveBoards: live.boards?.length, checkedRoutes: values.guide, expectedTime, actualTime, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
