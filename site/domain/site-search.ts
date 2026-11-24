import { guideSearchKey } from "./guide-search.ts";

export type SiteSearchKind = "guides" | "heroes" | "traits" | "gear" | "augments";
export type SiteSearchIntent = "browse" | "holders" | "comps";

type SearchLink = { id: string; name: string; href: string; image?: string };
export type WearerHit = SearchLink & { games: number; mean?: number };
export type BoardHit = SearchLink & { detail?: string; category?: string };
export type SearchGearDetail = {
  type: "emblem" | "artifact" | "item";
  holders: WearerHit[];
  examples: BoardHit[];
  examplesAvailable: boolean;
  snapshot?: { label: string; href: string };
  totalGames?: number;
  exclude?: string;
};
export type SiteSearchHit = BoardHit & { gear?: SearchGearDetail };
export type SiteSearchGroup = { kind: SiteSearchKind; title: string; hits: SiteSearchHit[] };
export type SiteSearchResponse = { query: string; intent: SiteSearchIntent; groups: SiteSearchGroup[] };

export function siteSearchIntent(query: string) {
  const compared = query.normalize("NFKC");
  const holderAction = /(?:给谁带|给谁用|给谁|谁用|谁拿|谁带|谁能用|适合谁|适合给谁|谁适合|使用者)/;
  const compAction = /(?:有什么阵容能用|能玩什么阵容|能玩什么|玩什么阵容|玩什么|打什么阵容|打什么|配什么阵容|用什么阵容|适合什么阵容|能走什么阵容|找阵容|阵容推荐)/;
  const lowCostFilter = /只看\s*(?:1\s*[–—-]\s*3\s*费(?:卡)?|低费(?:卡)?)/;
  const exclusionFilter = /(?:排除|剔除|不看)\s*([^，。！？,!?；;\s]+)/;
  const holderMatch = holderAction.exec(compared);
  const compMatch = compAction.exec(compared);
  const intent: SiteSearchIntent = holderMatch && (!compMatch || holderMatch.index < compMatch.index)
    ? "holders" : compMatch ? "comps" : "browse";
  const excluded = exclusionFilter.exec(compared)?.[1];
  const lowCosts = lowCostFilter.test(compared);
  const text = compared
    .replace(exclusionFilter, "")
    .replace(lowCostFilter, "")
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

export function indexedEmblemTerms(itemNames: string[], traitNames: string[]) {
  const bases = [...itemNames.map(name => name.replace(/纹章$/, "")), ...traitNames];
  return [...new Set(bases.filter(Boolean).flatMap(name => [name, name + "纹章", name + "转", name + "转职"]))];
}

type Sample = { unitId: string; games: number; mean?: number | null };
export function rankedWearers(rows: Sample[], minGames: number, displayMinimum = minGames) {
  // Prefer qualified averages. When the source is sparse, prioritize carry counts.
  const available = rows.filter(row => row.games > 0);
  const qualified = available.filter(row => row.games >= minGames && typeof row.mean === "number");
  if (qualified.length) return qualified
    .sort((a,b) => a.mean! - b.mean! || b.games - a.games)
    .slice(0, 3).map(({unitId, games, mean}) => ({ unitId, games, mean: mean! }));
  return available
    .sort((a,b) => b.games - a.games)
    .slice(0, 3).map(({unitId, games, mean}) => ({ unitId, games, mean: games >= displayMinimum ? mean ?? undefined : undefined }));
}
