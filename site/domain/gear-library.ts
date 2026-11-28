import { itemMap, season, traitMap, unitMap } from "@/data";
import { itemReference } from "@/data/item-reference";
import rawEmblemSnapshot from "@/data/emblem-stats.json";
import { emblemItemId } from "./links";
import { gearWearerMatches, type GearOrder } from "./gear-wearer";
import { emblemSearchNames, makeItemSearchTerms } from "./item-search";
import { itemAliases } from "./roster-import";
import { legacyEmblemNames } from "./trait-names.mjs";
import type { Item } from "./types";

export { compareGearWearerSamples, gearWearerStats, type GearOrder, type GearWearerSample } from "./gear-wearer";

export const gearGroups = {
  all: "全部", completed: "成装", component: "散件", craft: "锅铲合成",
  emblems: "纹章", special: "神器 / 辅助装", radiant: "光明装",
} as const;
export type GearGroup = keyof typeof gearGroups;
export type ItemGroup = Exclude<GearGroup, "emblems">;
export type GearFilters = { query: string; order: GearOrder; excluded: readonly string[]; wearer: string };
export const maxExcludedWearers = 2;
export type GearPageParams = {
  q?: string; order?: string; sort?: string; exclude?: string; wearer?: string;
  item?: string; view?: string; unit?: string; trait?: string; from?: string; builds?: string;
};

export const cookware = new Set(["TFT_Item_Spatula", "TFT_Item_FryingPan"]);
export const isCookRecipe = (item: Item) => item.components?.some(id => cookware.has(id));
export const itemName = (item: Item) => item.id === "TFT_Item_GuinsoosRageblade"
  ? "羊刀"
  : itemReference.items[item.id]?.name ?? item.name;
export const recipeParts = (item: Item) => (item.components ?? []).flatMap(id => itemMap.get(id) ?? []);

export const itemsByGroup: Record<ItemGroup, Item[]> = {
  all: season.items.filter(item => item.category !== "emblem" || isCookRecipe(item)),
  completed: season.items.filter(item => item.category === "completed" || item.category === "team-size"),
  component: season.items.filter(item => item.category === "component"),
  craft: season.items.filter(isCookRecipe),
  special: season.items.filter(item => item.category === "artifact" || item.category === "support"),
  radiant: season.items.filter(item => item.category === "radiant"),
};
export type EmblemSample = { games: number; mean: number | null; winRate: number | null };
type EmblemHolder = { unitId: string; games: number; mean: number; winRate: number; delta: number | null };
export type EmblemStat = EmblemSample & { sourceId: string; holders: EmblemHolder[] };
export const emblemSnapshot: {
  set: string; mode: string; patch: string; updatedAt?: string | null; source: string; days: number; minGames: number;
  emblems: Record<string, EmblemStat>;
} = rawEmblemSnapshot;
export const emblemEntries = Object.entries(emblemSnapshot.emblems)
  .filter(([id]) => itemMap.has(emblemItemId(id)));

export const selectableWearers = [...season.units]
  .sort((a, b) => Number(b.id === "rakan") - Number(a.id === "rakan") || a.name.localeCompare(b.name, "zh-CN"));

export function reverseWearerCandidates(query: string) {
  return gearWearerMatches(selectableWearers, query).map(({ unit }) => unit);
}

export function reverseWearerExact(query: string) {
  const [first, second] = gearWearerMatches(selectableWearers, query);
  if (first?.rank === 3 && second?.rank !== 3) return first.unit;
}

export function gearFilters(params: GearPageParams): GearFilters {
  const order = params.order ?? params.sort;
  const ids = typeof params.exclude === "string" ? params.exclude.split(",") : [];
  const excluded = [...new Set(ids.filter(id => unitMap.has(id)))].slice(0, maxExcludedWearers);
  return {
    query: (typeof params.q === "string" ? params.q : "").slice(0, 80),
    order: order === "games" ? "games" : order === "wins" || order === "winRate" ? "wins" : "mean",
    excluded,
    wearer: params.wearer && unitMap.has(params.wearer) ? params.wearer : "",
  };
}

export function gearHref(group: GearGroup, filters?: GearFilters, selection: GearPageParams = {}) {
  const params = new URLSearchParams();
  for (const key of ["item", "unit", "trait", "from"] as const) {
    const value = selection[key];
    if (value) params.set(key, value);
  }
  if (group !== "emblems") params.set("view", group);
  if (filters?.query.trim()) params.set("q", filters.query.trim());
  if (filters?.order && filters.order !== "mean") params.set("order", filters.order);
  if (filters?.excluded.length) params.set("exclude", filters.excluded.join(","));
  const wearer = filters?.wearer ?? selection.wearer;
  if (wearer && unitMap.has(wearer)) params.set("wearer", wearer);
  return (group === "emblems" ? "/emblems" : "/items") + (params.size ? "?" + params : "");
}

const normalize = (text: string) => text.normalize("NFKC").trim().toLowerCase();
const normalizeEmblem = (text: string) => normalize(text).replace(/[\s/|]/g, "").replace(/纹章|转职|转/g, "");

const aliases = new Map<string, string[]>();
for (const [alias, name] of Object.entries({ ...legacyEmblemNames, ...itemAliases })) {
  const entries = aliases.get(name) ?? [];
  entries.push(alias);
  aliases.set(name, entries);
}
export const itemTerms = makeItemSearchTerms(season.items, item => {
  const name = itemName(item);
  const officialName = itemReference.items[item.id]?.name ?? item.name;
  return [name, officialName, item.name, ...(aliases.get(item.name) ?? []), ...(aliases.get(officialName) ?? [])];
});

function matchingParts(item: Item, term: string) {
  return [...new Set(recipeParts(item))].filter(part => itemTerms(part).some(name => normalize(name).includes(term)));
}

export function gearMatches(item: Item, query: string) {
  const term = normalize(query);
  return !term || itemTerms(item).some(name => normalize(name).includes(term)) || matchingParts(item, term).length > 0;
}

export function searchGear(group: ItemGroup, query: string) {
  const term = normalize(query);
  const exact: Item[] = [];
  const names: Item[] = [];
  const recipes: { item: Item; matches: Item[] }[] = [];
  for (const item of itemsByGroup[group]) {
    const terms = itemTerms(item).map(normalize);
    if (term && terms.includes(term)) exact.push(item);
    else if (!term || terms.some(name => name.includes(term))) names.push(item);
    else {
      const matches = matchingParts(item, term);
      if (matches.length) recipes.push({ item, matches });
    }
  }
  return { named: [...exact, ...names], recipes };
}

export function filterGear(group: ItemGroup, query: string) {
  const { named, recipes } = searchGear(group, query);
  return [...named, ...recipes.map(({ item }) => item)];
}

export function emblemMatches(id: string, query: string) {
  const term = normalizeEmblem(query);
  if (!term) return true;
  const trait = traitMap.get(id);
  const item = itemMap.get(emblemItemId(id));
  const itemNames = item ? [...itemTerms(item), ...recipeParts(item).flatMap(itemTerms)] : [];
  return [...itemNames, ...(item && trait ? emblemSearchNames(item, trait) : [])]
    .some(text => text && normalizeEmblem(text).includes(term));
}

export function filterEmblems(query: string) {
  return emblemEntries.filter(([id]) => emblemMatches(id, query));
}
