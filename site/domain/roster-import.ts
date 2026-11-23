import type { Item, Piece, Team, Unit } from "./types";
import { unitSearchNames } from "./unit-search.mjs";

type Placement = Omit<Piece, "instanceId">;
export type RosterPreview = { name: string; notes: string; pieces: Placement[]; errors: string[] };
const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s·'’().（）/_-]/g, "");
const levels: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3 };
export const itemAliases: Record<string, string> = {
  青龙刀: "朔极之矛", 法爆: "珠光护手", 无尽: "无尽之刃", 羊刀: "鬼索的狂暴之刃",
  轻语: "最后的轻语", 帽子: "灭世者的死亡之帽", 狂徒: "狂徒铠甲", 板甲: "石像鬼石板甲",
  龙牙: "巨龙之爪", 饮血: "饮血剑", 日炎: "日炎斗篷",
  科技枪: "海克斯科技枪刃", 鬼书: "莫雷洛秘典", 血手: "斯特拉克的挑战护手",
  链枷: "强袭者的链枷", 光明链枷: "光明版强袭者的链枷", 摇滚转: "摇滚乐纹章",
  混沌战士纹章: "非主流纹章",
};

export function parseRoster(input: string, units: Unit[], items: Item[]): RosterPreview {
  const result: RosterPreview = { name: "", notes: "", pieces: [], errors: [] };
  if (!input.trim()) return result;
  if (input.length > 14000) { result.errors.push("文本过长，请只粘贴一套阵容。"); return result; }
  const byName = new Map<string, Unit[]>();
  for (const unit of units) {
    const names = unitSearchNames(unit);
    for (const name of new Set(names.map(normalized))) {
      const matches = byName.get(name) ?? [];
      if (!matches.includes(unit)) matches.push(unit);
      byName.set(name, matches);
    }
  }
  const itemIds = new Map(items.flatMap(item => [[normalized(item.name),item.id], [normalized(item.id),item.id]] as [string,string][]));
  for (const [alias,name] of Object.entries(itemAliases)) {
    const id = itemIds.get(normalized(name));
    if (id) itemIds.set(normalized(alias), id);
  }
  const rows = input.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const countLine = rows.findIndex(line => /^\d+\s*人口$/.test(line));
  const isExport = countLine >= 0 && rows.some(line => /第\d+排第\d+格/.test(line));
  const remaining = isExport ? rows.slice(countLine + 1) : rows;
  if (isExport) result.name = (rows[countLine - 1] ?? "").slice(0,80);
  const occupied = new Set<number>();
  const pending: Placement[] = [];
  function decode(token: string) {
    const star = /(?:\s*(?:([一二两三\d]+)\s*星|(★+))\s*$)|(?:^\s*(?:([一二两三\d]+)\s*星|(★+))\s*)/.exec(token);
    const raw = star?.[1] ?? star?.[3];
    const stars = raw ? (levels[raw] ?? Number(raw)) : (star?.[2] ?? star?.[4])?.length ?? 1;
    const name = (star ? token.replace(star[0], "") : token).trim();
    return { name, stars, matches: byName.get(normalized(name)) ?? [] };
  }
  function add(token: string, slot = -1, gear: string[] = []) {
    const { name, stars, matches } = decode(token);
    if (!matches.length) { result.errors.push("未识别棋子「" + name + "」。"); return; }
    if (matches.length > 1) { result.errors.push("「" + name + "」有多种匹配，请写" + matches.map(unit => unit.name).join("或") + "。"); return; }
    if (![1,2,3].includes(stars)) { result.errors.push(name + "的星级须为 1、2 或 3。"); return; }
    const id = matches[0].id;
    if (id.startsWith("akali-") && pending.some(piece => piece.unitId.startsWith("akali-") && piece.unitId !== id)) {
      result.errors.push("同一棋盘只能使用一种阿卡丽形态。"); return;
    }
    if (slot === -1 && pending.some(piece => piece.unitId === id)) {
      result.errors.push(name + "出现两次。如需上两张，请给每张指定不同格子。"); return;
    }
    if (slot >= 0 && occupied.has(slot)) { result.errors.push(name + "的格子已被占用。"); return; }
    if (gear.length > 3) { result.errors.push(name + "最多可带三件装备。"); return; }
    const loadout = gear.map(item => itemIds.get(normalized(item)));
    if (loadout.some(id => !id)) { result.errors.push("未识别" + name + "的装备「" + gear.filter((_,i) => !loadout[i]).join("、") + "」。"); return; }
    if (slot >= 0) occupied.add(slot);
    pending.push({ unitId: id, position: slot, stars: stars as Piece["stars"], items: loadout as string[] });
  }
  function namesOnly(text: string) {
    if (decode(text).matches.length) { add(text); return; }
    const words = text.replace(/([一二两三\d]+)\s+星/g, "$1星").split(/\s+/);
    for (let i=0; i<words.length;) {
      let end = Math.min(i + 5, words.length);
      while (end > i + 1 && !decode(words.slice(i,end).join(" ")).matches.length) end--;
      add(words.slice(i,end).join(" ")); i = end;
    }
  }
  const notes: string[] = [];
  let afterRoster = false;
  for (const row of remaining) {
    const positioned = /^(.+?)\s*·\s*第\s*(\d+)\s*排\s*第\s*(\d+)\s*格(?:\s*·\s*(.*))?$/.exec(row);
    if (positioned) {
      const r = Number(positioned[2]), c = Number(positioned[3]);
      if (r < 1 || r > 4 || c < 1 || c > 7) result.errors.push("站位范围是第 1 至 4 排、第 1 至 7 格。");
      else add(positioned[1], (r-1)*7+c-1, (positioned[4] ?? "").split(/[、，,+＋]/).map(item => item.trim()).filter(Boolean));
    } else if (isExport && /^(已开常规|已开专属|未达档|动态待定)\s+\d/.test(row)) {
      afterRoster = true;
    } else if (isExport && afterRoster) {
      notes.push(row);
    } else {
      for (const token of row.split(/[、，,；;]+/).map(word => word.trim()).filter(Boolean)) namesOnly(token);
    }
  }
  result.notes = notes.join("\n");
  if (pending.length > 28) result.errors.push("棋盘最多容纳 28 枚棋子。");
  for (const piece of pending) {
    if (piece.position < 0) {
      let slot = 0;
      while (occupied.has(slot) && slot < 28) slot++;
      if (slot === 28) break;
      piece.position = slot; occupied.add(slot);
    }
    result.pieces.push(piece);
  }
  if (isExport && !result.errors.length) {
    const pop = result.pieces.reduce((sum,p) => sum + (p.unitId === "baron-nashor" ? 2 : 1),0);
    if (parseInt(rows[countLine],10) !== pop) result.errors.push("原文标注的人口和名单不一致，名单实际占 " + pop + " 人口。");
  }
  return result;
}

function copyBoard(board: { pieces: Placement[]; instrumentPositions?: Team["instrumentPositions"] }) {
  return {
    pieces: board.pieces.map(piece => ({ ...piece, instanceId: crypto.randomUUID(), items: [...piece.items] })),
    ...(board.instrumentPositions && { instrumentPositions: { ...board.instrumentPositions } }),
  };
}

export function independentDraft(
  source: Pick<Team, "name" | "category" | "notes" | "instrumentPositions" | "mainStage" | "stages" | "posterFormat"> & { pieces: Placement[] },
  empty: Team,
): Team {
  const draft: Team = { ...empty, name: source.name, category: source.category, notes: source.notes, ...copyBoard(source) };
  if (source.mainStage) draft.mainStage = source.mainStage;
  if (source.posterFormat) draft.posterFormat = source.posterFormat;
  for (const stage of ["early", "mid"] as const) {
    const board = source.stages?.[stage];
    if (board?.pieces.length) (draft.stages ??= {})[stage] = copyBoard(board);
  }
  return draft;
}
