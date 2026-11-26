import { season, unitMap, traitMap } from "@/data";
import { augmentArtPath } from "@/data/augment-art";
import augments from "@/data/augment-catalog.json";
import currentPatch from "@/data/current-patch.json";
import emblemSnapshot from "@/data/emblem-stats.json";
import familyStats from "@/data/guide-family-stats.json";
import { itemWearers } from "@/data/item-wearers";
import { specialItemWearers } from "@/data/special-item-wearers";
import coreStats from "@/data/patch-recommendation-stats.json";
import type { Publication, Section } from "@/domain/document";
import { readableSection, sectionTeams } from "@/domain/document-flow";
import { itemName, itemTerms } from "@/domain/gear-library";
import { gearSampleMinimum } from "@/domain/gear-wearer";
import { boardTitle } from "@/domain/guide-families";
import { canRankRecommendations, currentFamilyBatch, guideFamilyRows, recommendationTier } from "@/domain/guide-family-stats";
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
import { displayGuideName } from "@/domain/trait-names.mjs";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import { isVersionUpdate, sameEdition } from "@/domain/version-updates";
import { recommendationBoardSample } from "@/components/GuidePlacement";
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

function searchGuides(live: Publication | null) {
  if (!live) return [];
  const current = sameEdition(live.season.id, currentPatch.seasonId);
  const build = current ? currentPatch.build : undefined;
  const withFamilies = currentFamilyBatch(familyStats, live.season.id, currentPatch);
  const withCores = current && canRankRecommendations(coreStats, live.season.id, currentPatch);
  const recommendations = currentPatchRecommendations(live);
  const fixed = new Map(recommendations?.fixedBoardRecommendations?.map(row => [row.teamId, row]));
  const reviewed = new Set(recommendations?.entries.filter(row => row.status === "review")
    .map(row => row.sectionId + ":" + row.teamId));
  const cores = new Map((withCores ? coreStats.rows : []).map(row => [row.sectionId + ":" + row.teamId, row]));
  const labels = { recommended: "推荐", secondary: "次选", review: "待复核" };
  return live.sections.filter(section => readableSection(section) && !isEditorialSection(section) && !isVersionUpdate(section)).map(section => {
    const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
    const edition = section.gameData?.id ?? live.season.id;
    const families = withFamilies ? guideFamilyRows(familyStats, edition, section.id, teams) : [];
    const familiesByBoard = new Map<string, typeof families>();
    for (const row of families) for (const board of row.boards) {
      const list = familiesByBoard.get(board.id);
      if (list) list.push(row);
      else familiesByBoard.set(board.id, [row]);
    }
    const boardLabels = new Map(teams.map(board => {
      const id = section.id + ":" + board.id;
      const rows = familiesByBoard.get(board.id) ?? [];
      const core = edition === coreStats.seasonId ? cores.get(id) : undefined;
      const tiers = new Set(rows.map(row => recommendationTier(row.stat)));
      if (!tiers.size) tiers.add(recommendationTier(core ?? fixed.get(board.id) ??
        recommendationBoardSample(board, section, "fixed", build) ?? recommendationBoardSample(board, section, "core", build)));
      const [tier] = tiers;
      const label = section.category === heroAugmentCategory ? "英雄强化" : reviewed.has(id) ? "待复核" :
        tiers.size > 1 ? "全部攻略" : labels[tier];
      return [board.id, label] as const;
    }));
    return { section, teams, families, familiesByBoard, boardLabels };
  });
}

type SearchGuide = ReturnType<typeof searchGuides>[number];
type Context = {
  guides: SearchGuide[];
  extra: ReturnType<typeof siteSearchIntent>;
  exclusion?: string;
  live: Publication | null;
};

function searchRows<T extends { hit: SiteSearchHit; terms: string[] }>(rows: T[], term: string) {
  return rows.map(row => ({ ...row, rank:searchNameRank(term, row.terms) }))
    .filter(row => row.rank > 0)
    .sort((a,b) => b.rank - a.rank);
}

function guideHit(guide: SearchGuide, team: Team, detail?: string, unit?: Unit): BoardHit {
  const { section, boardLabels, teams } = guide;
  const name = guideBoardKind(section, team, teams[0]) === "过渡" ? section.title : boardTitle(section, team);
  const note = detail ?? team.webTitle;
  return {
    id:team.id, name, href:guideLink(section.id,team.id), image:unit?.image,
    detail:note && !name.endsWith(note) ? note : undefined, category:boardLabels.get(team.id),
  };
}

function namedGuides(context: Context, term: string, items: Item[]) {
  const gearQuery = items.length > 0;
  const titleTerm = key(displayGuideName(term));
  const rankTitle = (name: string) => Math.max(searchNameRank(term, [name]), searchNameRank(titleTerm, [displayGuideName(name)]));
  return context.guides.flatMap(guide => {
    const { section, teams, familiesByBoard } = guide;
    const titleRank = rankTitle(section.title);
    if (!teams.length || (gearQuery && titleRank !== 3)) return [];
    const augment = heroAugmentForGuide(section);
    return teams.flatMap(team => {
      const name = guideBoardName(team);
      const titleScore = team.id === teams[0].id ? titleRank * 2 : 0;
      const familyNames = familiesByBoard.get(team.id)?.map(({stat}) => rankTitle(stat.name)) ?? [];
      const boardScore = Math.max(rankTitle(name), rankTitle(boardTitle(section, team)), searchNameRank(term, [augment?.name ?? ""]), ...familyNames);
      const rank = Math.max(titleScore, boardScore);
      if (!rank) return [];
      const entry = titleScore && titleScore >= boardScore ? teams.find(board => board.id === section.reroll?.entryTeamId) : undefined;
      const hit = guideHit(guide, team, entry ? guideBoardName(entry) : team.id === teams[0].id ? undefined : name);
      return [{ rank, sectionId: section.id, hit: entry ? { ...hit, href: guideLink(section.id, entry.id) } : hit }];
    });
  }).sort((a,b) => b.rank - a.rank)
    .filter((entry,i,all) => all.findIndex(other => other.sectionId === entry.sectionId) === i)
    .slice(0,limit).map(row => row.hit);
}

function heroGuides(context: Context, search: ReturnType<typeof homeSearchIntent>, unit?: Unit) {
  return context.guides.flatMap(guide => {
    const { section, teams, families } = guide;
    const [match] = matchHomeGuide(search.text, {
      section, data: section.gameData ?? context.live?.season ?? season, catalog: season, teams, families, scope: search.scope,
      isTransition: board => guideBoardKind(section, board, teams[0]) === "过渡",
    });
    if (!match) return [];
    const detail = match.unitLabel ?? match.context ?? guideBoardName(match.board);
    return [{ rank: match.rank, hit: guideHit(guide, match.board, detail, unit) }];
  }).sort((a,b) => b.rank - a.rank).slice(0, limit).map(entry => entry.hit);
}

function equippedBoards(item: Item, context: Context) {
  const isCurrent = (section: Section) => context.live && sameEdition((section.gameData ?? context.live.season).id,season.id);
  return context.guides.filter(({section}) => isCurrent(section)).flatMap(guide => {
    const { section, teams } = guide;
    return equippedGuideRoutes(section, teams, teams, item.id, unitMap, context.exclusion, context.extra.lowCosts).map(({board, wearers, population}) => {
      const label = [...new Set(wearers.map(unit => unit.name))].join("、");
      const stage = board.id === teams[0].id ? population + "级" : guideBoardName(board);
      return guideHit(guide, board, stage + " · " + label + "携带", wearers[0]);
    });
  }).slice(0, limit);
}

function gearDetails(item: Item, context: Context): SearchGearDetail {
  const excluded = context.exclusion;
  const entry = item.traitId ? emblemRows[item.traitId] : undefined;
  const samples = specialItemWearers.items[item.id] ? specialItemWearers : itemWearers;
  const sampled = samples.items[item.id];
  const minGames = entry ? emblemSnapshot.minGames : samples.minGames;
  const pbe = entry ? emblemSnapshot.mode === "PBE" : /\bPBE\b/i.test(samples.version);
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
    holders: rankedWearers((entry?.holders ?? sampled?.rows ?? []).filter(eligible), minGames, gearSampleMinimum(item.category, pbe, minGames))
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
    guides: searchGuides(live),
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
