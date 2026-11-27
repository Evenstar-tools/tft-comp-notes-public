import { guideSearchKey } from "./guide-search.ts";

export type SiteSearchKind = "guides" | "heroes" | "traits" | "gear" | "augments";
export type SiteSearchIntent = "browse" | "holders" | "comps";

type SearchLink = { id: string; name: string; href: string; image?: string };
export type WearerHit = SearchLink & { games: number; mean?: number };
export type BoardSearchCondition = {
  label: string; games: number; mean?: number; href: string; source: string; note?: string;
};
export type BoardHit = SearchLink & {
  detail?: string; category?: string; advice?: string; games?: number; mean?: number;
  evidence?: BoardSearchCondition[];
};
export type CarryHit = WearerHit & { detail?: string };
export type SearchGearDetail = {
  type: "emblem" | "artifact" | "item";
  holders: WearerHit[];
  holderOrder: "mean" | "games";
  carries: CarryHit[];
  examples: BoardHit[];
  examplesAvailable: boolean;
  routeNote?: string;
  stageBoards?: BoardHit[];
  snapshot?: { label: string; href: string };
  totalGames?: number;
  exclude?: string;
  includeSeven: boolean;
};
type AugmentSample = { label: string; games: number; mean?: number };
export type SearchHeroAugmentDetail = {
  hero: string; round: string; rarity: string; role: string; effect?: string;
  board?: { name: string; href: string; population: number; units: { id: string; name: string; image: string; cost: number; carry?: boolean }[];
    traits: { id: string; name: string; level: number; image?: string }[] };
  boardNote?: string;
  openConditions?: boolean;
  loadouts: { label: string; note?: string; items: { id: string; name: string; image: string; href: string }[]; evidence?: AugmentSample }[];
  conditions: string[];
  evidence?: AugmentSample & { href: string; source: string };
  reference?: { href: string; label: string };
  profileHref: string;
};
export type SiteSearchHit = BoardHit & { gear?: SearchGearDetail; heroAugment?: SearchHeroAugmentDetail };
export type SiteSearchGroup = { kind: SiteSearchKind; title: string; hits: SiteSearchHit[] };
export const searchStrategies = { reroll: "赌狗", fast8: "84", fast9: "95" } as const;
export type SearchStrategy = keyof typeof searchStrategies;
export type SiteSearchContext = {
  item?: string; augmentId?: string; level?: number; exclude?: string; lowCosts?: boolean; includeSeven?: boolean;
  boardLookup?: { group?: SearchStrategy; sectionId?: string; rollLevel?: number; terms?: string[] };
};
export type SiteSearchResponse = {
  query: string; intent: SiteSearchIntent; groups: SiteSearchGroup[];
  context?: SiteSearchContext; conditions?: string[]; answer?: string;
};

export const searchQueryLimit = 300;
const levelTokens = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
export const searchLevelToken = "(?:1[012]|[1-9]|十二|十一|十|[一二三四五六七八九])\\s*(?:级|人口)";
const levelPattern = new RegExp(`(?:^|[^0-9])(${searchLevelToken})`);

export function siteSearchLevel(text: string) {
  const match = levelPattern.exec(text.normalize("NFKC"))?.[1]?.replace(/\s*(?:级|人口)$/, "");
  return match ? Number(match) || levelTokens.indexOf(match) : undefined;
}

export function requiresSearchSubmit(text: string) {
  return /[?？]|^(?:我|那|刚(?:刚)?(?:合|拿|做)|然后|接着|只看|再看|排除|剔除|不含|不看|换成|改查|换查|改看)|这把|哪些阵容|怎么(?:玩|变阵|站|配装)/.test(text.trim());
}

export function siteSearchIntent(query: string) {
  const compared = query.normalize("NFKC");
  const holderAction = /(?:给谁带|给谁用|给谁|谁用|谁拿|谁带|谁能用|适合谁|适合给谁|谁适合|使用者)/;
  const compAction = /(?:(?:这把|这局)\s*)?(?:有什么阵容能用|(?:能|可以)(?:玩|走)(?:什么|哪些)(?:阵容)?|玩什么阵容|玩什么|打什么阵容|打什么|配什么阵容|用什么阵容|适合什么阵容|找阵容|阵容推荐)/;
  const lowCostFilter = /只看\s*(?:1\s*[–—-]\s*3\s*费(?:卡)?|低费(?:卡)?)/;
  const exclusionFilter = /(?:排除|剔除|不看)\s*([^，。！？,!?；;\s]+)/;
  const craftedPrefix = /^(?:我)?\s*(?:刚(?:刚)?|已经)?\s*(?:合了|合成了|合出来?了|做了|做出来?了)\s*(?:一件|一个)?\s*/;
  const holderMatch = holderAction.exec(compared);
  const compMatch = compAction.exec(compared);
  const intent: SiteSearchIntent = holderMatch && (!compMatch || holderMatch.index < compMatch.index)
    ? "holders" : compMatch ? "comps" : "browse";
  const excluded = exclusionFilter.exec(compared)?.[1].replace(/(?:呢|吧|可以吗)$/, "");
  const lowCosts = lowCostFilter.test(compared);
  const text = compared
    .replace(exclusionFilter, "")
    .replace(lowCostFilter, "")
    .replace(craftedPrefix, "")
    .replace(/^(?:换成|改查|换查|改看)\s*/, "")
    .replace(/^(?:我)?(?:刚)?(?:拿到了?|拿了|有了?|抽到了?|开到(?:了)?|选到了?)\s*(?:一件|一个|一枚)?/, "")
    .replace(/^(?:想查|查一下|帮我查)\s*/, "")
    .replace(holderAction, "")
    .replace(compAction, "")
    .replace(/[，。！？,!?；;「」『』]+/g, "")
    .replace(/(?:比较好|最合适|最好|好用|比较强|可以用)$/, "")
    .trim();
  return { text, intent, excluded, lowCosts };
}

export function searchNameRank(raw: string, names: string[]) {
  if (!raw) return 0;
  const keys = names.map(guideSearchKey);
  if (keys.includes(raw)) return 3;
  if (keys.some(key => key.startsWith(raw))) return 2;
  return keys.some(key => key.includes(raw)) ? 1 : 0;
}

export function indexedEmblemTerms(itemNames: string[], traitNames: string[], includeBare = true) {
  const bases = [...itemNames.map(name => name.replace(/(?:纹章|徽章)$/, "")), ...traitNames];
  return [...new Set(bases.filter(Boolean).flatMap(name => [
    ...(includeBare ? [name] : []), name + "纹章", name + "徽章", name + "转", name + "转职",
  ]))];
}

type Sample = { unitId: string; games: number; mean?: number | null };
const validMean = (mean: Sample["mean"]): mean is number => typeof mean === "number" && mean >= 1 && mean <= 8;
export const equipmentWearerLimit = 5;

export function rankedWearerEvidence(rows: Sample[], minGames: number, displayMinimum = minGames, limit = equipmentWearerLimit) {
  const available = rows.filter(row => Number.isSafeInteger(row.games) && row.games > 0);
  const qualified = available.filter(row => row.games >= minGames && validMean(row.mean));
  const order = qualified.length ? "mean" : "games";
  const sorted = qualified.length
    ? qualified.sort((a, b) => a.mean! - b.mean! || b.games - a.games)
    : available.sort((a, b) => b.games - a.games);
  return { order, holders: sorted.slice(0, limit).map(({ unitId, games, mean }) => ({
    unitId, games, mean: (order === "mean" || games >= displayMinimum) && validMean(mean) ? mean : undefined,
  })) } as const;
}

export function rankedWearers(rows: Sample[], minGames: number, displayMinimum = minGames) {
  return rankedWearerEvidence(rows, minGames, displayMinimum, 3).holders;
}

export function hasSevenCostUnit(pieces: readonly { unitId: string }[], units: ReadonlyMap<string, { cost: number }>) {
  return pieces.some(piece => units.get(piece.unitId)?.cost === 7);
}

export function selectEquipmentTerminals<T extends { id: string; familyId: string; mean: number; games: number }>(boards: T[]) {
  const families = new Set<string>();
  const ids = new Set<string>();
  return [...boards].sort((a, b) => a.mean - b.mean || b.games - a.games).filter(board => {
    if (families.has(board.familyId) || ids.has(board.id)) return false;
    families.add(board.familyId);
    ids.add(board.id);
    return true;
  });
}
