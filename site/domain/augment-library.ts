import type { Unit } from "./types";
import { unitSearchNames } from "./unit-search.mjs";

export interface AugmentEntry {
  id: string;
  apiName: string;
  name: string;
  english: string;
  rarity: string;
  rounds: string[];
  effect: string;
  kind: string;
  icon: string;
}
export interface SelectionRow {
  id?: string;
  apiName: string;
  name: string;
  english?: string;
  rarity: string;
  grade?: string;
  effect?: string;
  round?: string;
  games?: number;
  mean?: number;
  top4?: number;
  win?: number;
}
export interface SelectionSnapshot {
  roundBasis?: "stage" | "pick-order";
  season: number;
  realm: string;
  patch?: string;
  date: string;
  source: string;
  sourceName?: string;
  scope?: string;
  rows: SelectionRow[];
}

// Older snapshots use the season as their storage key. Identity belongs to
// the source metadata so a live season and its PBE can both be kept.
export function selectionSnapshots(history: Record<string, SelectionSnapshot>): SelectionSnapshot[] {
  return Object.values(history).sort((a, b) => b.date.localeCompare(a.date));
}

export function currentSelectionSnapshot(snapshots: SelectionSnapshot[], season: number, realm: string, patch: string) {
  return snapshots.find(snapshot => snapshot.season === season && snapshot.realm === realm && snapshot.patch === patch &&
    snapshot.rows.some(row => row.games !== 0 && [row.mean, row.top4, row.win].some(Number.isFinite)));
}
export interface AugmentGuide {
  title: string;
  sectionId: string;
  primaryTeamId?: string;
  boardNames: Record<string, string>;
}

const keywords: Record<string, string> = {
  DA_Elise19_HeroAugment: "蜘蛛 咬痕 伊莉丝",
  DA_Annie19_HeroAugment: "骑熊安妮 安娜",
  DA_Renekton19_HeroAugment: "救生员 鳄鱼 雷克顿 芬妮",
  DA_Lillia19_HeroAugment: "毒舞 莉莉娅 莉莉亚",
  DA_Olaf19_HeroAugment: "远程奥拉夫 狂战士",
  DA_Sett19_HeroAugment: "飞拳瑟提 腕豪",
  DA_Kennen19_HeroAugment: "电能凯南 电耗子",
  DA_BronzeForLifeI: "终生黄铜 终身黄铜 凑羁绊",
  DA_BronzeForLifeII: "终生黄铜2 终身黄铜2 终生黄铜二 终身黄铜二 凑羁绊",
};
export const tierOrder = ["银色", "金色", "棱彩"];
export const rarityClass = (rarity: string) => ["silver", "gold", "prismatic"][tierOrder.indexOf(rarity)] || "";
export const gradeOrder = ["S", "A", "B", "C", "D"];
export const normalizeAugmentQuery = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\s·/]/g, "");
export function matchSelectionEntry(row: SelectionRow, entries: readonly AugmentEntry[]): AugmentEntry | undefined {
  if (row.id) return entries.find(entry =>
    entry.id === row.id && entry.apiName === row.apiName && entry.rarity === row.rarity
  );
  const name = normalizeAugmentQuery(row.name);
  const matches = entries.filter(entry => entry.apiName === row.apiName && entry.rarity === row.rarity &&
    [entry.name, entry.english].some(label => normalizeAugmentQuery(label) === name));
  return matches.length === 1 ? matches[0] : undefined;
}

export interface AugmentTableRow {
  id: string;
  name: string;
  english?: string;
  rarity: string;
  effect?: string;
  grade?: string;
  variantLabel?: string;
  mean?: number;
  games?: number;
  top4?: number;
  win?: number;
  "2-1"?: number;
  "3-2"?: number;
  "4-2"?: number;
}
export type AugmentTableColumn = Exclude<keyof AugmentTableRow, "id" | "rarity" | "effect" | "variantLabel">;

/** Only supply a catalog that belongs to the selected edition. Historical rows stand on their own. */
export function augmentTableRows(entries: readonly AugmentEntry[] | undefined, snapshot?: SelectionSnapshot, selectedRound = "all"): AugmentTableRow[] {
  const grouped = new Map<string, AugmentTableRow>();
  const names = new Map<string, AugmentEntry[]>();
  for (const entry of selectedRound === "all" ? entries ?? [] : []) {
    grouped.set(entry.id, { id: entry.id, name: entry.name, english: entry.english, rarity: entry.rarity, effect: entry.effect });
    const name = JSON.stringify([entry.name, entry.english]);
    const siblings = names.get(name);
    if (siblings) siblings.push(entry);
    else names.set(name, [entry]);
  }
  for (const siblings of names.values()) {
    if (siblings.length < 2) continue;
    const mixedTier = new Set(siblings.map(entry => entry.rarity)).size > 1;
    for (const entry of siblings) {
      const needsRound = siblings.some(other => other !== entry && other.rarity === entry.rarity);
      const round = needsRound && entry.rounds.length ? entry.rounds.join(" / ") + " 可选" : "";
      grouped.get(entry.id)!.variantLabel = [mixedTier && entry.rarity, round].filter(Boolean).join(" · ");
    }
  }
  for (const record of snapshot?.rows ?? []) {
    const round = record.round || "all";
    if (selectedRound !== "all" && round !== selectedRound) continue;
    const entry = entries && matchSelectionEntry(record, entries);
    if (entries && !entry) continue;
    const id = entry?.id ?? record.id ?? JSON.stringify([record.apiName, record.name, record.rarity]);
    let row = grouped.get(id);
    if (!row) {
      row = { id, name: entry?.name ?? record.name, english: entry?.english ?? record.english, rarity: record.rarity, effect: entry?.effect ?? record.effect };
      grouped.set(id, row);
    }
    if (round === selectedRound) {
      Object.assign(row, { mean: record.mean, games: record.games, top4: record.top4, win: record.win, grade: record.grade });
    } else if (round === "2-1" || round === "3-2" || round === "4-2") {
      row[round] = record.mean;
    }
  }
  return Array.from(grouped.values());
}

const tableCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
function gradeRank(value: string) {
  const index = gradeOrder.indexOf(value);
  return index < 0 ? gradeOrder.length : index;
}
export function compareAugmentRows(left: AugmentTableRow, right: AugmentTableRow, key: AugmentTableColumn, descending: boolean) {
  const a = left[key], b = right[key];
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  const comparison = key === "grade" ? gradeRank(String(a)) - gradeRank(String(b))
    : typeof a === "number" && typeof b === "number" ? a - b : tableCollator.compare(String(a), String(b));
  return descending ? -comparison : comparison;
}
export const augmentHref = (id: string) => "/augments?id=" + encodeURIComponent(id);
export const augmentCardId = (id: string) => "augment-card-" + id;

export function validAugmentReturn(value: unknown) {
  if (typeof value !== "string" || value.length > 1024 || !/^\/augments(?:[?#]|$)/.test(value) || /[\r\n\t\\]/.test(value)) return;
  const url = new URL(value, "https://tft.local");
  if (url.pathname === "/augments" && (!url.hash || /^#augment-card-[\w-]+$/.test(url.hash))) return value;
}
export const isBronzeAugment = (id: string) => id === "DA_BronzeForLifeI" || id === "DA_BronzeForLifeII";
export const augmentSearchText = (entry: AugmentEntry, guide?: AugmentGuide, unit?: Unit) =>
  normalizeAugmentQuery([entry.name, entry.english, entry.effect, keywords[entry.apiName], guide?.title,
    ...(unit ? unitSearchNames(unit) : [])].filter(Boolean).join(" "));
