import { season, unitMap, traitMap } from "@/data";
import { augmentArtPath } from "@/data/augment-art";
import augments from "@/data/augment-catalog.json";
import emblemSnapshot from "@/data/emblem-stats.json";
import { itemWearers, specialItemWearers } from "@/data/item-library";
import type { Publication, Section } from "@/domain/document";
import { readableSection, sectionTeams } from "@/domain/document-flow";
import { itemName, itemTerms } from "@/domain/gear-library";
import { guideBoardName, guideLink, isEditorialSection, primaryFirst } from "@/domain/guide-reading";
import { guideSearchKey, guideTraitNames, openingSearch } from "@/domain/guide-search";
import { heroAugmentCategory, heroAugmentForGuide } from "@/domain/hero-augments";
import { equippedGuideRoutes, homeSearchIntent, matchHomeGuide } from "@/domain/home-guide-search";
import { emblemLink, itemLink } from "@/domain/links";
import {
  indexedEmblemTerms, rankedWearers, searchNameRank, siteSearchIntent,
  type BoardHit, type SearchGearDetail, type SiteSearchGroup, type SiteSearchHit, type SiteSearchResponse,
} from "@/domain/site-search";
import type { Item, Team, Unit } from "@/domain/types";
import { guideBoardKind } from "@/domain/team";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import { isVersionUpdate, sameEdition } from "@/domain/version-updates";
import { currentPatchRecommendations } from "./patch-recommendations";
import { publicGuidePublication } from "./publication";

const limit = 6;
const emblemRows: Record<string, (typeof emblemSnapshot.emblems)[keyof typeof emblemSnapshot.emblems]> = emblemSnapshot.emblems;
const chinaDate = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" });
const key = guideSearchKey;

const heroIndex = season.units.map(unit => ({
  hit: { id:unit.id, name:unit.name, href:"/heroes?" + new URLSearchParams({ unit:unit.id }), image:unit.image, detail:unit.cost + " 费" },
  terms:unitSearchNames(unit),
}));
const traitIndex = season.traits.map(trait => ({
  hit: { id:trait.id, name:trait.gameName ?? trait.name, href:"/traits?" + new URLSearchParams({ trait:trait.id }), image:trait.image,
    detail:trait.thresholds.filter(Boolean).join(" / ") || undefined },
  terms:guideTraitNames(trait),
}));
const itemIndex = season.items.map(item => {
  const trait = item.traitId && traitMap.get(item.traitId);
  let terms = itemTerms(item);
  if (trait) terms = indexedEmblemTerms(terms, guideTraitNames(trait));
  if (item.category === "radiant") {
    const base = terms.filter(name => !name.startsWith("光明"));
    terms = [itemName(item), item.name, ...base.flatMap(name => ["光明" + name, "光明版" + name])];
  }
  const type = item.traitId ? "纹章" : item.category === "artifact" ? "神器" :
    item.category === "support" ? "辅助装" : item.category === "radiant" ? "光明装" : "装备";
  return { item, terms, hit:{ id:item.id, name:itemName(item), href:itemLink(item.id), image:item.image, detail:type } };
});
const augmentIndex = augments.rows.map(entry => ({
  hit:{ id:entry.id,name:entry.name, href:"/augments?" + new URLSearchParams({ id:entry.id }),image:augmentArtPath(entry),
    detail:[entry.rarity,...entry.rounds].join(" · ") },
  terms:[entry.name,entry.english],
}));

type Context = {
  sections: Section[];
  recommended: Set<string>;
  extra: ReturnType<typeof siteSearchIntent>;
  exclusion?: string;
  live: Publication | null;
};

function searchRows<T extends { hit: SiteSearchHit; terms: string[] }>(rows: T[], term: string) {
  return rows.map(row => ({ ...row, rank:searchNameRank(term, row.terms) }))
    .filter(row => row.rank > 0)
    .sort((a,b) => b.rank - a.rank);
}

function guideCategory(section: Section, team: Team, context: Context) {
  if (section.category === heroAugmentCategory) return "英雄强化";
  return context.recommended.has(section.id + ":" + team.id) ? "本版推荐" : "全部攻略";
}

function guideHit(section: Section, team: Team, context: Context, detail?: string, unit?: Unit): BoardHit {
  return {
    id:team.id, name:section.title, href:guideLink(section.id,team.id), image:unit?.image,
    detail:detail ?? team.webTitle, category:guideCategory(section, team, context),
  };
}

function namedGuides(context: Context, term: string, items: Item[]) {
  const gearQuery = items.length > 0;
  return context.sections.flatMap(section => {
    const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
    const titleRank = searchNameRank(term, [section.title]);
    if (!teams.length || (gearQuery && titleRank !== 3)) return [];
    const augment = heroAugmentForGuide(section);
    return teams.flatMap(team => {
      const name = guideBoardName(team);
      const titleScore = team.id === teams[0].id ? titleRank * 2 : 0;
      const boardScore = searchNameRank(term, [name, augment?.name ?? ""]);
      const rank = Math.max(titleScore, boardScore);
      if (!rank) return [];
      const entry = titleScore && titleScore >= boardScore ? teams.find(board => board.id === section.reroll?.entryTeamId) : undefined;
      const hit = guideHit(section, team, context, entry ? guideBoardName(entry) : team.id === teams[0].id ? undefined : name);
      return [{ rank, hit: entry ? { ...hit, href: guideLink(section.id, entry.id) } : hit }];
    });
  }).sort((a,b) => b.rank - a.rank)
    .filter((entry,i,all) => all.findIndex(other => other.hit.name === entry.hit.name) === i)
    .slice(0,limit).map(row => row.hit);
}

function heroGuides(context: Context, search: ReturnType<typeof homeSearchIntent>, unit?: Unit) {
  return context.sections.flatMap(section => {
    const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
    const [match] = matchHomeGuide(search.text, {
      section, data: section.gameData ?? context.live?.season ?? season, catalog: season, teams, scope: search.scope,
      isTransition: board => guideBoardKind(section, board, teams[0]) === "过渡",
    });
    if (!match) return [];
    const detail = match.unitLabel ?? match.context ?? guideBoardName(match.board);
    return [{ rank: match.rank, hit: guideHit(section, match.board, context, detail, unit) }];
  }).sort((a,b) => b.rank - a.rank).slice(0, limit).map(entry => entry.hit);
}

function equippedBoards(item: Item, context: Context) {
  const isCurrent = (section: Section) => context.live && sameEdition((section.gameData ?? context.live.season).id,season.id);
  return context.sections.filter(isCurrent).flatMap(section => {
    const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
    return equippedGuideRoutes(section, teams, teams, item.id, unitMap, context.exclusion, context.extra.lowCosts).map(({board, wearers, population}) => {
      const label = [...new Set(wearers.map(unit => unit.name))].join("、");
      const stage = board.id === teams[0].id ? population + "级" : guideBoardName(board);
      return guideHit(section, board, context, stage + " · " + label + "携带", wearers[0]);
    });
  }).slice(0, limit);
}

function gearDetails(item: Item, context: Context): SearchGearDetail {
  const excluded = context.exclusion;
  const entry = item.traitId ? emblemRows[item.traitId] : undefined;
  const samples = specialItemWearers.items[item.id] ? specialItemWearers : itemWearers;
  const sampled = samples.items[item.id];
  const eligible = (row: { unitId: string }) => {
    const unit = unitMap.get(row.unitId);
    return unit && row.unitId !== excluded && (!context.extra.lowCosts || unit.cost <= 3);
  };
  const snapshot = entry ? {
    href: "https://www.metatft.com/items/" + encodeURIComponent(entry.sourceId) + "?set=TFTSet19",
    label: [emblemSnapshot.source, emblemSnapshot.set + " " + emblemSnapshot.mode + " " + emblemSnapshot.patch,
      "近 " + emblemSnapshot.days + " 天", chinaDate.format(new Date(emblemSnapshot.updatedAt))].join(" · "),
  } : sampled ? {
    href: sampled.url, label:[samples.source,samples.version,samples.window,samples.date].join(" · "),
  } : undefined;
  return {
    type: item.traitId ? "emblem" : item.category === "artifact" ? "artifact" : "item",
    holders: rankedWearers((entry?.holders ?? sampled?.rows ?? []).filter(eligible), entry ? emblemSnapshot.minGames : samples.minGames)
      .flatMap(row => {
        const unit = unitMap.get(row.unitId);
        return unit ? [{ id:unit.id,name:unit.name,image:unit.image,games:row.games,mean:row.mean,
          href:item.traitId ? emblemLink(item.traitId,unit.id,excluded) : itemLink(item.id,unit.id) }] : [];
      }),
    examplesAvailable: Boolean(context.live),
    examples: equippedBoards(item, context),
    totalGames: entry?.games ?? sampled?.totalGames,
    snapshot,
    exclude: excluded,
  };
}

export async function performSiteSearch(input: string, exclude?: string, publication?: Publication | null): Promise<SiteSearchResponse> {
  const query = input.trim().slice(0,80);
  const extra = siteSearchIntent(query);
  const term = key(extra.text);
  if (!term) return { query, intent:extra.intent, groups:[] };
  const live = publication === undefined ? await publicGuidePublication().catch(() => null) : publication;
  const context: Context = {
    sections: live?.sections.filter(section => readableSection(section) && !isEditorialSection(section) && !isVersionUpdate(section)) ?? [],
    recommended: new Set(currentPatchRecommendations(live)?.entries.filter(row =>
      row.status === "recommended" || row.status === "conditional").map(row => row.sectionId + ":" + row.teamId)),
    extra,
    exclusion: exclude === "none" ? undefined : exclude && unitMap.has(exclude) ? exclude : extra.excluded
      ? heroIndex.find(row => searchNameRank(key(extra.excluded!), row.terms) === 3)?.hit.id : undefined,
    live,
  };

  const guideIntent = homeSearchIntent(extra.text, "all");
  const opening = openingSearch(guideIntent.text, season);
  const explicitEmblems = opening?.kind === "emblem" ? new Set(opening.itemIds) : new Set<string>();
  const namedItems = searchRows(itemIndex, term);
  const basedOnEmblem = explicitEmblems.size ? itemIndex.filter(row => explicitEmblems.has(row.item.id)).map(row => ({ ...row, rank:3 })) : [];
  const singleGear = basedOnEmblem.length ? basedOnEmblem : namedItems.filter(row => row.rank === 3);
  const gearRows = singleGear.length ? singleGear : namedItems;
  const knownGear = singleGear.map(row => row.item);
  const stars = guideIntent.scope === "all" && opening?.kind === "star" ? new Set(opening.unitIds) : undefined;
  const heroRows = stars?.size
    ? heroIndex.filter(row => stars.has(row.hit.id)).map(row => ({ ...row, rank: 3 }))
    : searchRows(heroIndex, key(guideIntent.text));
  const exactHeroes = heroRows.filter(row => row.rank === 3);
  const heroes = exactHeroes.length ? exactHeroes : heroRows;
  const traits = searchRows(traitIndex, term);
  const augmentRows = searchRows(augmentIndex, term);
  const gear: SiteSearchGroup = {
    kind:"gear",title:"装备与纹章",
    hits:gearRows.slice(0,limit).map(({hit,item,rank}) => ({
      ...hit,
      href:item.traitId ? emblemLink(item.traitId,undefined,context.exclusion) : itemLink(item.id),
      gear: rank === 3 && (singleGear.length === 1 || extra.intent !== "browse") ? gearDetails(item,context) : undefined,
    })),
  };
  const guideHits = exactHeroes.length || (guideIntent.scope !== "all" && heroes.length)
    ? heroGuides(context, guideIntent, heroes.length === 1 ? unitMap.get(heroes[0].hit.id) : undefined)
    : guideIntent.scope === "all" ? namedGuides(context, term, knownGear) : [];
  const guideGroup: SiteSearchGroup = { kind:"guides",title:"阵容攻略",hits:guideHits };
  const traitGroup: SiteSearchGroup = { kind:"traits",title:"羁绊",hits:traits.slice(0,limit).map(row => row.hit) };
  const heroGroup: SiteSearchGroup = { kind:"heroes",title:"棋子",hits:heroes.slice(0,limit).map(row => row.hit) };
  const augmentGroup: SiteSearchGroup = { kind:"augments",title:"海克斯",hits:augmentRows.slice(0,limit).map(row => row.hit) };
  // Bare trait names may also denote an emblem. Offer both directly so no query silently changes meaning.
  const bareTrait = Boolean(!explicitEmblems.size && knownGear.some(item => item.traitId) && traits.length);
  const directHero = extra.intent === "browse" && guideIntent.scope === "all" && !stars?.size && heroes[0]?.rank === 3;
  if (bareTrait && extra.intent === "browse") gear.hits.forEach(hit => { hit.gear = undefined; });
  const groups = knownGear.length
    ? (bareTrait && extra.intent === "browse" ? [traitGroup, gear, guideGroup, heroGroup, augmentGroup]
      : [gear, guideGroup, heroGroup, traitGroup, augmentGroup])
    : directHero ? [heroGroup,guideGroup,traitGroup,gear,augmentGroup]
    : [guideGroup,heroGroup,traitGroup,gear,augmentGroup];
  return { query, intent:extra.intent, groups:groups.filter(group => group.hits.length) };
}
