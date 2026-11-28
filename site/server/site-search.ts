import { season, unitMap, traitMap } from "@/data";
import { augmentArtPath } from "@/data/augment-art";
import augments from "@/data/augment-catalog.json";
import currentPatch from "@/data/current-patch.json";
import familyData from "@/data/guide-family-stats.json";
import { itemWearers } from "@/data/item-wearers";
import { specialItemWearers } from "@/data/special-item-wearers";
import { boardSearchQuery, type BoardSearchQuery } from "@/domain/board-search-query";
import type { Publication, Section } from "@/domain/document";
import { readableSection, sectionTeams } from "@/domain/document-flow";
import { emblemSnapshot, itemName, itemTerms } from "@/domain/gear-library";
import { currentEmblemSnapshot, currentWearerSnapshot, gearSampleMinimum, visibleGearSample } from "@/domain/gear-wearer";
import { boardTitle } from "@/domain/guide-families";
import { currentRecommendationEvidence, guideDirectoryTier, guideFamilyRows, guideTierLabels, recommendationGroup, recommendationTier,
  type GuideFamilyBatch } from "@/domain/guide-family-stats";
import { authoredDirectoryRoutes, isArchivedRerollBoard } from "@/domain/reroll-stages";
import { guideBoardName, guideFacets, guideLink, guidePlaystyle, guideRollLevel, guideUnitMatch, isEditorialSection, primaryFirst, readingNotes, sourceSummary } from "@/domain/guide-reading";
import { guideBoardBySearchAlias, guideSearchKey, guideTraitNames, guideWearerQuery, homeGuideFilter, openingSearch } from "@/domain/guide-search";
import { heroAugmentCategory, heroAugmentForGuide } from "@/domain/hero-augments";
import { heroAugmentSearchQuery } from "@/domain/hero-augment-search";
import { equippedGuideRoutes, homeSearchIntent, matchHomeGuide } from "@/domain/home-guide-search";
import { emblemLink, itemLink } from "@/domain/links";
import { emblemSearchNames } from "@/domain/item-search";
import { patchRecommendationLabels } from "@/domain/patch-recommendations";
import {
  equipmentWearerLimit, hasSevenCostUnit, indexedEmblemTerms, rankedWearerEvidence, searchLevelToken, searchNameRank, searchQueryLimit,
  searchStrategies, selectEquipmentTerminals, siteSearchIntent, siteSearchLevel,
  type BoardHit, type CarryHit, type SearchGearDetail, type SiteSearchContext, type SiteSearchGroup, type SiteSearchHit, type SiteSearchResponse,
} from "@/domain/site-search";
import type { Item, Team, Unit } from "@/domain/types";
import { guideBoardKind, traitCounts, usedPopulation } from "@/domain/team";
import { displayGuideName } from "@/domain/trait-names.mjs";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import { isLiveLaunchTransition, isVersionUpdate, sameEdition } from "@/domain/version-updates";
import { guideDirectoryCorePlacements } from "@/components/GuidePlacement";
import { boardSearchEvidence, currentSearchPlacements, fixedSearchSample } from "./board-search-evidence";
import { heroAugmentSearchHit } from "./hero-augment-search";
import { currentPatchRecommendations } from "./patch-recommendations";
import { publicGuidePublication } from "./publication";

const limit = 6;
const duringLaunch = isLiveLaunchTransition(currentPatch);
const familyStats = familyData as GuideFamilyBatch;
const emblemRows = emblemSnapshot.emblems;
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
  const names = itemTerms(item);
  const terms = trait ? indexedEmblemTerms(names, emblemSearchNames(item, trait)) : names;
  const type = item.traitId ? "纹章" : item.category === "artifact" ? "神器" :
    item.category === "support" ? "辅助装" : item.category === "radiant" ? "光明装" : "装备";
  return { item, terms, hit:{ id:item.id, name:itemName(item), href:itemLink(item.id), image:item.image, detail:type } };
});
const augmentIndex = augments.rows.map(entry => ({
  hit:{ id:entry.id,name:entry.name, href:"/augments?" + new URLSearchParams({ id:entry.id }),image:augmentArtPath(entry),
    detail:[entry.rarity,...entry.rounds].join(" · ") },
  terms:[entry.name,entry.english],
}));

const searchGuideIndexes = new WeakMap<Publication, ReturnType<typeof buildSearchGuideIndex>>();

function searchGuides(live: Publication | null) {
  if (!live) return [];
  const existing = searchGuideIndexes.get(live);
  if (existing) return existing;
  const index = buildSearchGuideIndex(live);
  searchGuideIndexes.set(live, index);
  return index;
}

function buildSearchGuideIndex(live: Publication) {
  const recommendations = currentPatchRecommendations(live);
  const withFamilies = currentRecommendationEvidence(familyStats, live.season.id, currentPatch, recommendations?.reviewedRollingPatch);
  const decisions = new Map(recommendations?.entries.map(row => [row.sectionId + ":" + row.teamId, row]));
  return live.sections.filter(section => readableSection(section) && !isEditorialSection(section) && !isVersionUpdate(section)).map(section => {
    const teams = primaryFirst(sectionTeams(section).filter(board => !isArchivedRerollBoard(section, board.id)), section.primaryTeamId);
    const edition = section.gameData?.id ?? live.season.id;
    const families = withFamilies ? guideFamilyRows(familyStats, edition, section.id, teams) : [];
    const familiesByBoard = new Map<string, typeof families>();
    for (const row of families) for (const board of row.boards) {
      const list = familiesByBoard.get(board.id);
      if (list) list.push(row);
      else familiesByBoard.set(board.id, [row]);
    }
    const hero = section.category === heroAugmentCategory;
    const cores = !hero && !duringLaunch ? guideDirectoryCorePlacements(section, teams, familyStats, recommendations?.reviewedRollingPatch) : undefined;
    const boardLabels = new Map(teams.map(board => {
      const id = section.id + ":" + board.id;
      const rows = familiesByBoard.get(board.id) ?? [];
      const status = decisions.get(id)?.status;
      const core = cores?.get(board.id);
      const tiers = new Set(rows.length ? rows.map(row => guideDirectoryTier(row.stat, status)) :
        [guideDirectoryTier(core?.mean === undefined ? undefined : { ...core, mean: core.mean }, status)]);
      const [tier] = tiers;
      const label = hero ? "英雄强化" : duringLaunch ? status ? patchRecommendationLabels[status] : "全部攻略"
        : tiers.size > 1 ? "全部攻略" : guideTierLabels[tier];
      return [board.id, label] as const;
    }));
    return { section, teams, families, familiesByBoard, boardLabels, decisions };
  });
}

type SearchGuide = ReturnType<typeof buildSearchGuideIndex>[number];
type Context = {
  guides: SearchGuide[];
  extra: ReturnType<typeof siteSearchIntent>;
  exclusion?: string;
  level?: number;
  includeSeven: boolean;
  live: Publication | null;
};

function exactUnits(term: string) {
  return heroIndex.filter(row => searchNameRank(key(term), row.terms) === 3).map(row => row.hit.id);
}

function boardRule(raw: string) {
  const negative = /^(?:排除|剔除|不含|不看)\s*/.exec(raw);
  const term = raw.slice(negative?.[0].length ?? 0).replace(/^(?:包含|含)\s*/, "");
  const wearer = guideWearerQuery(term);
  const ids = exactUnits(wearer?.unit ?? term);
  const stars = openingSearch(term, season);
  const trait = homeGuideFilter(displayGuideName(term.replace(/^至少\s*|\s*羁绊$/g, ""))
    .replace(/([\d一二三四五六七八九十])离子$/, "$1离子火花"), season);
  const items = wearer ? searchRows(itemIndex, key(wearer.item)).filter(row => row.rank === 3).map(row => row.item.id) : [];
  let matches: ((board: Team, data: Publication["season"], guide: SearchGuide) => boolean) | undefined;
  if (wearer && ids.length && items.length) {
    matches = (board, data, guide) => board.pieces.some(piece => ids.includes(piece.unitId) && piece.items.some(id => items.includes(id)) &&
      (!wearer.carry || mainCarry(guide, board, data, piece.unitId)));
  } else if (stars?.kind === "star" && stars.unitIds.length) {
    matches = board => board.pieces.some(piece => stars.unitIds.includes(piece.unitId) && piece.stars === stars.stars);
  } else if (trait?.kind === "trait") {
    matches = (board, data) => traitCounts(board.pieces, data.units, data.traits, data.items).some(row => row.active &&
      trait.ids.includes(row.id) && (term.startsWith("至少") ? row.level >= trait.value : row.level === trait.value));
  } else if (!wearer && ids.length) {
    matches = board => board.pieces.some(piece => ids.includes(piece.unitId));
  } else if (!wearer) {
    const traits = traitIndex.filter(row => searchNameRank(key(term), row.terms) === 3);
    if (traits.length) matches = (board, data) => traitCounts(board.pieces, data.units, data.traits, data.items)
      .some(row => row.active && traits.some(trait => trait.hit.id === row.id));
  }
  if (matches) return { matches, excluded: Boolean(negative), label: negative ? `排除 ${term}` : term };
}

function boardResults(query: string, request: BoardSearchQuery, context: Context): SiteSearchResponse | undefined {
  const terms = request.terms ?? [];
  const rules = terms.map(boardRule);
  const queryContext: SiteSearchContext = { level: request.level, boardLookup: {
    group: request.group, sectionId: request.sectionId, terms: request.terms, rollLevel: request.rollLevel,
  } };
  const conditions = [request.group && searchStrategies[request.group], request.level && `${request.level} 级`,
    request.rollLevel && `${request.rollLevel} 级搜牌`, ...rules.map((rule, index) => rule?.label ?? terms[index])].filter(isText);
  const result = { query, intent: "browse" as const, context: queryContext, conditions, groups: [] };
  if (rules.some(rule => !rule)) return { ...result, answer: "有条件未识别。可用英雄名、三星英雄、羁绊档位或「英雄携带装备」，用 + 连接。" };

  const requestedName = request.name && key(displayGuideName(request.name));
  const nameMatches = (value: string) => key(displayGuideName(value)) === requestedName;
  let guideFound = false;
  const candidates = context.guides.flatMap(guide => {
    const { section, teams, families } = guide;
    const data = section.gameData ?? context.live?.season ?? season;
    const primary = teams[0];
    if (!primary || !sameEdition(data.id, currentPatch.seasonId) || section.category === heroAugmentCategory ||
        (request.sectionId && request.sectionId !== section.id)) return [];
    const named = !requestedName || [section.title, ...families.flatMap(({ stat }) => [stat.name, ...(stat.aliases ?? [])])].some(nameMatches);
    if (named || teams.some(team => nameMatches(guideBoardName(team)))) guideFound = true;
    let options = teams.filter(team => named || nameMatches(guideBoardName(team)));
    options = options.filter(team => {
      const level = usedPopulation(team.pieces);
      if (request.level !== undefined && level !== request.level) return false;
      if (request.level === undefined && request.rollLevel === undefined && guideBoardKind(section, team, primary) === "过渡") return false;
      const facets = guideFacets(section, team, data);
      const primaryFacets = team === primary ? facets : guideFacets(section, primary, data);
      const roll = guideRollLevel(section, team) ?? guideRollLevel(section, primary);
      const strategy = recommendationGroup(guidePlaystyle(section, team) ?? (facets.style || primaryFacets.style),
        facets.costs.length ? facets.costs : primaryFacets.costs, roll);
      return (!request.group || request.group === strategy) && (request.rollLevel === undefined || request.rollLevel === roll) &&
        rules.every(rule => rule && rule.matches(team, data, guide) !== rule.excluded);
    });
    const team = options[0];
    if (!team) return [];
    const family = guide.familiesByBoard.get(team.id)?.[0]?.stat;
    const tier = isRejected(guide, team) ? 2 : { recommended: 0, secondary: 1, review: 2 }[recommendationTier(family)];
    return [{ guide, team, data, family, tier }];
  }).sort((a, b) => a.tier - b.tier || (a.family?.mean ?? 9) - (b.family?.mean ?? 9));
  if (requestedName && !guideFound) return;
  if (requestedName && candidates[0]) queryContext.boardLookup!.sectionId = candidates[0].guide.section.id;
  const hits = candidates.slice(0, limit).map(({ guide, team, data, family }) => {
    const detail = `${usedPopulation(team.pieces)} 级 · ${guideBoardName(team)}`;
    return { ...guideHit(guide, team, detail), evidence: boardSearchEvidence(guide.section, team, data.id, family) };
  });
  return hits.length ? { ...result, groups: [{ kind: "guides", title: request.group ? `${searchStrategies[request.group]} 阵容` : "阵容攻略", hits }] }
    : { ...result, answer: "暂无符合这些条件的已发布棋盘。" };
}

function isText(value: unknown): value is string { return typeof value === "string" && Boolean(value); }

function searchRows<T extends { hit: SiteSearchHit; terms: string[] }>(rows: T[], term: string) {
  return rows.map(row => ({ ...row, rank:searchNameRank(term, row.terms) }))
    .filter(row => row.rank > 0)
    .sort((a,b) => b.rank - a.rank);
}

function guideHit(guide: SearchGuide, team: Team, detail?: string, unit?: Unit): BoardHit {
  const { section, boardLabels, teams } = guide;
  const routeTitle = authoredDirectoryRoutes(section).find(route => route.teamId === team.id)?.directoryTitle;
  const name = routeTitle ?? (guideBoardKind(section, team, teams[0]) === "过渡" ? section.title : boardTitle(section, team));
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
    const candidates = teams.filter(board => (context.level === undefined || context.level === usedPopulation(board.pieces)) &&
      !hasSevenCostUnit(board.pieces, unitMap) && !isRejected(guide, board) && !board.pieces.some(piece => piece.unitId === context.exclusion));
    return equippedGuideRoutes(section, teams, candidates, item.id, unitMap, context.exclusion, context.extra.lowCosts)
      .map(({board, wearers, population}) => {
        const label = [...new Set(wearers.map(unit => unit.name))].join("、");
        return guideHit(guide, board, `${population}级 · ${label}携带`, wearers[0]);
      });
  }).slice(0, limit);
}

function isRejected(guide: SearchGuide, board: Team) {
  const status = guide.decisions.get(guide.section.id + ":" + board.id)?.status;
  return status === "avoid" || status === "review";
}

function mainCarry(guide: SearchGuide, board: Team, data: Publication["season"], unitId: string, familyCarry = false) {
  const piece = board.pieces.find(piece => piece.unitId === unitId);
  const unit = data.units.find(unit => unit.id === unitId);
  if (!piece || !unit) return false;
  const roles = readingNotes(guide.section, board, data).roles;
  return guideUnitMatch(piece, unit, roles, data.items, { familyCarry, transition: false, sampled: false }).mainCarry;
}

function openingTip(guide: SearchGuide, board: Team, data: Publication["season"]) {
  const note = guide.decisions.get(`${guide.section.id}:${board.id}`)?.note || sourceSummary(guide.section) ||
    readingNotes(guide.section, guide.teams[0], data).opening || readingNotes(guide.section, board, data).opening;
  return note.replace(/^【[^】]+】\s*/, "").split(/(?<=[。！？])|[；;]/, 1)[0].trim();
}

function gearRoutes(item: Item, context: Context, sampled: ReadonlySet<string>, qualified: ReadonlySet<string>, currentBatch: boolean) {
  const publication = context.live;
  const familyReady = publication && currentRecommendationEvidence(familyStats, publication.season.id, currentPatch,
    currentPatchRecommendations(publication)?.reviewedRollingPatch);
  const terminalsReady = Boolean(currentBatch && publication && familyReady && currentSearchPlacements(publication.season.id));
  const backups = new Map<string, string>();
  const terminals = context.guides.flatMap(guide => {
    const { section, teams, families } = guide;
    const data = section.gameData ?? publication?.season ?? season;
    if (!currentBatch || !sameEdition(data.id, currentPatch.seasonId) || section.category === heroAugmentCategory || !teams[0]) return [];
    const boards = new Map(teams.flatMap(board => {
      const population = usedPopulation(board.pieces);
      if (context.level !== undefined && population !== context.level || hasSevenCostUnit(board.pieces, unitMap) ||
          guideBoardKind(section, board, teams[0]) === "过渡" || isRejected(guide, board) ||
          board.pieces.some(piece => piece.unitId === context.exclusion)) return [];
      const wearers = board.pieces.filter(piece => sampled.has(piece.unitId) && piece.items.includes(item.id)).map(piece => piece.unitId);
      if (!wearers.length) return [];
      for (const id of wearers) {
        if (!backups.has(id) && mainCarry(guide, board, data, id)) backups.set(id, guideLink(section.id, board.id));
      }
      return [[board.id, { board, wearers, population }] as const];
    }));
    if (!terminalsReady || !boards.size) return [];
    return families.flatMap(({ stat, team, boards: familyBoards }) => {
      if (recommendationTier(stat) !== "recommended" || stat.heroAugment || isRejected(guide, team)) return [];
      const options = familyBoards.flatMap(familyBoard => {
        const entry = boards.get(familyBoard.id);
        if (!entry) return [];
        const { board, population, wearers } = entry;
        const carryIds = wearers.filter(id => qualified.has(id) && stat.carryIds.includes(id) && mainCarry(guide, board, data, id, true));
        if (!carryIds.length) return [];
        const fixed = fixedSearchSample(section, board, data.id);
        if (fixed?.mean === undefined || recommendationTier({ games: fixed.games, mean: fixed.mean, winRate: fixed.winRate }) !== "recommended") return [];
        return [{ board, population, carryIds, fixed: { ...fixed, mean: fixed.mean } }];
      });
      const original = options.find(entry => entry.board.id === stat.landingTeamId) ?? options.find(entry => entry.board.id === team.id) ?? options[0];
      if (!original) return [];
      const best = options.filter(entry => entry.population === original.population && entry.fixed.scope === original.fixed.scope &&
        entry.fixed.roster !== original.fixed.roster && entry.fixed.mean < original.fixed.mean &&
        original.carryIds.every(id => entry.carryIds.includes(id)))
        .sort((a, b) => a.fixed.mean - b.fixed.mean || b.fixed.games - a.fixed.games)[0] ?? original;
      const carries = best.carryIds.flatMap(id => unitMap.get(id) ?? []);
      const tip = openingTip(guide, best.board, data);
      return [{ ...guideHit(guide, best.board, `${best.population}级 · ${carries.map(unit => unit.name).join("、")}主C`, carries[0]),
        name: displayGuideName(stat.name), familyId: String(stat.clusterId), carryIds: best.carryIds,
        mean: stat.mean, games: stat.games, category: "推荐", advice: tip }];
    });
  });
  return { terminals: selectEquipmentTerminals(terminals), backups, terminalsReady };
}

function gearDetails(item: Item, context: Context): SearchGearDetail {
  const excluded = context.exclusion;
  const samples = specialItemWearers.items[item.id] ? specialItemWearers : itemWearers;
  const emblemCurrent = sameEdition(context.live?.season.id ?? season.id, currentPatch.seasonId) &&
    currentEmblemSnapshot(emblemSnapshot, currentPatch);
  const rawEntry = item.traitId && (!duringLaunch || emblemCurrent) ? emblemRows[item.traitId] : undefined;
  const rawSample = !duringLaunch || currentWearerSnapshot(samples, currentPatch) ? samples.items[item.id] : undefined;
  const entry = rawEntry && visibleGearSample(item.category, rawEntry.games) ? rawEntry : undefined;
  const sampled = rawSample && visibleGearSample(item.category, rawSample.totalGames) ? rawSample : undefined;
  const minGames = entry ? emblemSnapshot.minGames : samples.minGames;
  const eligible = (row: { unitId: string }) => {
    const unit = unitMap.get(row.unitId);
    return unit && row.unitId !== excluded && (!context.extra.lowCosts || unit.cost <= 3);
  };
  const displayMinimum = gearSampleMinimum(item.category, minGames);
  const totalGames = entry?.games ?? sampled?.totalGames;
  const snapshot = entry && emblemSnapshot.updatedAt && (!duringLaunch || entry.games >= displayMinimum) ? {
    href: "https://www.metatft.com/items/" + encodeURIComponent(entry.sourceId) + "?set=TFTSet19",
    label: [emblemSnapshot.source, emblemSnapshot.set + " " + emblemSnapshot.mode + " " + emblemSnapshot.patch,
      "近 " + emblemSnapshot.days + " 天", chinaDate.format(new Date(emblemSnapshot.updatedAt))].join(" · "),
  } : sampled && (!duringLaunch || (totalGames ?? 0) >= displayMinimum) ? {
    href: sampled.url, label:[samples.source,samples.version,samples.window,samples.date].join(" · "),
  } : undefined;
  const rows = (entry?.holders ?? sampled?.rows ?? []).filter(row => eligible(row) &&
    visibleGearSample(item.category, row.games) && (!duringLaunch || row.games >= displayMinimum));
  const ranked = rankedWearerEvidence(rows.filter(row => context.includeSeven || unitMap.get(row.unitId)?.cost !== 7), displayMinimum);
  const wearerHit = ({ unitId, games, mean }: typeof ranked.holders[number], href?: string): CarryHit => {
    const unit = unitMap.get(unitId)!;
    return { id: unit.id, name: unit.name, image: unit.image, games, mean,
      href: href ?? (item.traitId ? emblemLink(item.traitId, unit.id, excluded) : itemLink(item.id, unit.id)) };
  };
  const currentBatch = entry ? context.live !== null && emblemCurrent : Boolean(sampled && currentWearerSnapshot(samples, currentPatch));
  const candidateRows = rows.filter(row => row.games > 0 && unitMap.get(row.unitId)?.cost !== 7);
  const candidates = rankedWearerEvidence(candidateRows, displayMinimum, displayMinimum, Infinity);
  const qualified = candidates.order === "mean" ? candidates.holders : [];
  const represented = new Set(qualified.map(row => row.unitId));
  const ordered = [...qualified, ...candidateRows.filter(row => !represented.has(row.unitId)).sort((a, b) => b.games - a.games)
    .map(row => ({ unitId: row.unitId, games: row.games, mean: undefined }))];
  const { terminals, backups, terminalsReady } = gearRoutes(item, context,
    new Set(ordered.map(row => row.unitId)), represented, currentBatch);

  const carries: CarryHit[] = [];
  const chosen = new Set<string>();
  const chosenTerminals = new Set<string>();
  for (const terminal of terminals) for (const id of terminal.carryIds) {
    if (chosen.has(id) || carries.length >= equipmentWearerLimit) continue;
    const row = ordered.find(row => row.unitId === id);
    if (row) {
      chosen.add(id);
      chosenTerminals.add(terminal.id);
      carries.push(wearerHit(row, terminal.href));
    }
  }
  for (const row of ordered) {
    const href = backups.get(row.unitId);
    if (!href || chosen.has(row.unitId) || carries.length >= equipmentWearerLimit) continue;
    carries.push({ ...wearerHit(row, href), detail: "攻略配装" });
  }
  for (const terminal of terminals) {
    if (chosenTerminals.size >= 4) break;
    chosenTerminals.add(terminal.id);
  }
  const examples = terminals.filter(board => chosenTerminals.has(board.id)).map(({ familyId, carryIds, ...board }) => board);
  const matching = !examples.length ? equippedBoards(item, context) : [];
  const routeNote = examples.length ? undefined : !context.live ? "暂时读不到阵容笔记。" :
    !terminalsReady && (rows.length > 0 || matching.length > 0) ? "当前构建的战绩批次尚未齐备。" :
    context.level !== undefined || excluded || context.extra.lowCosts ? "当前条件下暂无合格的实戴终盘。" :
    matching.length ? "已有实戴棋盘，当前暂无达到推荐门槛的终盘。" : "暂无实戴这件装备的已发布棋盘。";
  return {
    type: item.traitId ? "emblem" : item.category === "artifact" ? "artifact" : "item",
    holders: ranked.holders.map(row => wearerHit(row)), holderOrder: ranked.order, carries,
    examplesAvailable: Boolean(context.live),
    examples, routeNote, includeSeven: context.includeSeven,
    stageBoards: matching,
    totalGames: !duringLaunch || (totalGames ?? 0) >= displayMinimum ? totalGames : undefined,
    snapshot,
    exclude: excluded,
  };
}

const gearLevel = new RegExp(`(?:^|\\s*的?\\s*)${searchLevelToken}(?:的?(?:阵容|终盘|棋盘))?(?:呢|吗)?$`);
const gearFollowup = new RegExp(`^(?:那(?:就|只看|再看|看)?|再看|只看|看)?\\s*${searchLevelToken}(?:的?(?:阵容|终盘|棋盘))?(?:呢|吗)?[？?。]*$`);

export async function performSiteSearch(input: string, exclude?: string, publication?: Publication | null,
  { previous, includeSeven }: { previous?: SiteSearchContext; includeSeven?: boolean } = {},
): Promise<SiteSearchResponse> {
  const query = input.trim().slice(0, searchQueryLimit);
  const extra = siteSearchIntent(query);
  const term = key(extra.text);
  if (!query) return { query, intent:extra.intent, groups:[] };
  const filterFollowup = gearFollowup.test(query.normalize("NFKC")) || !term && Boolean(extra.excluded || extra.lowCosts) ||
    /^(?:那|再|然后|接着|这件)/.test(query) && /给谁|谁带|阵容|排除|低费|终盘/.test(query);
  const inherited = Boolean(filterFollowup && previous?.item && itemIndex.some(row => row.item.id === previous.item));
  const level = siteSearchLevel(query) ?? (inherited ? previous?.level : undefined);
  const excludeByName = extra.excluded && exactUnits(extra.excluded)[0];
  const invalidExclusion = extra.excluded && !excludeByName;
  const exclusion = exclude === "none" ? undefined : exclude && unitMap.has(exclude) ? exclude :
    excludeByName || (inherited ? previous?.exclude : undefined);
  const include = includeSeven ?? (inherited && previous?.includeSeven === true);
  const lowCosts = extra.lowCosts || Boolean(inherited && previous?.lowCosts);
  const live = publication === undefined ? await publicGuidePublication().catch(() => null) : publication;
  const context: Context = {
    guides: searchGuides(live), extra: { ...extra, lowCosts }, live, exclusion, level, includeSeven: include,
  };

  // A registered board name may include a level that would otherwise be parsed as a filter.
  if (extra.intent === "browse" && !extra.excluded && !extra.lowCosts) {
    const hits = context.guides.flatMap(guide => {
      const board = guideBoardBySearchAlias(guide.section.id, guide.teams, term);
      return board ? [guideHit(guide, board)] : [];
    }).slice(0, limit);
    if (hits.length) return { query, intent: "browse", groups: [{ kind: "guides", title: "阵容攻略", hits }] };
  }

  const standaloneFilter = homeGuideFilter(displayGuideName(extra.text), season);
  const boardQuery = boardSearchQuery(query, previous) ??
    (extra.intent === "browse" && standaloneFilter?.kind === "trait" ? { terms: [extra.text] } : undefined);
  if (boardQuery && (boardQuery.group || boardQuery.terms?.length || boardQuery.inherited)) {
    const result = boardResults(query, boardQuery, context);
    if (result) return result;
  }

  const requestedAugment = heroAugmentSearchQuery(query, season.units, previous);
  const augmentHits = requestedAugment?.augments.flatMap(augment => heroAugmentSearchHit(augment, live, requestedAugment) ?? []) ?? [];
  const exactHeroLookup = exactUnits(query).length > 0;
  if (requestedAugment && augmentHits.length && !exactHeroLookup) {
    const [augment] = requestedAugment.augments;
    const conditions = [!requestedAugment.browse && augment.label,
      requestedAugment.level && `${requestedAugment.level} 级`, requestedAugment.picksOnly && "强化实选"].filter(isText);
    return { query, intent: "browse", conditions, context: requestedAugment.browse ? undefined : { augmentId: augment.id, level: requestedAugment.level },
      groups: [{ kind: "augments", title: "英雄强化", hits: augmentHits }] };
  }

  if (invalidExclusion && exclude !== "none") return { query, intent: extra.intent, groups: [], context: previous,
    answer: `未识别要排除的棋子「${extra.excluded}」。可以输入英雄的正式名称。` };

  const lookupText = extra.text.replace(gearLevel, "").trim();
  const guideIntent = homeSearchIntent(lookupText || extra.text, "all");
  const opening = openingSearch(guideIntent.text, season);
  const explicitEmblems = opening?.kind === "emblem" ? new Set(opening.itemIds) : new Set<string>();
  const namedItems = searchRows(itemIndex, key(lookupText));
  const exactGear = namedItems.filter(row => row.rank === 3);
  const basedOnEmblem = explicitEmblems.size ? itemIndex.filter(row => explicitEmblems.has(row.item.id)).map(row => ({ ...row, rank:3 })) : [];
  const carriedItem = inherited && !exactGear.length ? itemIndex.find(row => row.item.id === previous?.item) : undefined;
  const singleGear = exactGear.length ? exactGear : basedOnEmblem.length ? basedOnEmblem : carriedItem ? [{ ...carriedItem, rank: 3 }] : [];
  const gearRows = singleGear.length ? singleGear : namedItems;
  const knownGear = singleGear.map(row => row.item);
  if (boardQuery && !singleGear.length) {
    const result = boardResults(query, boardQuery, context);
    if (result) return result;
  }
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
  const item = singleGear.length === 1 && gear.hits[0]?.gear ? knownGear[0] : undefined;
  const conditions = item && [itemName(item), level && `${level} 级`, exclusion && `排除 ${unitMap.get(exclusion)?.name ?? exclusion}`,
    lowCosts && "只看 1–3 费"].filter(isText);
  const filteredGroups = (carriedItem ? [gear] : exactHeroLookup && augmentHits.length
    ? [{ kind: "augments" as const, title: "英雄强化", hits: augmentHits }, ...groups.filter(group => group.kind !== "augments")]
    : groups).filter(group => group.hits.length);
  if (exactHeroLookup && requestedAugment && augmentHits.length === 1) {
    const [augment] = requestedAugment.augments;
    return { query, intent: extra.intent, groups: filteredGroups, context: { augmentId: augment.id }, conditions: [augment.label] };
  }
  return { query, intent:extra.intent, groups:filteredGroups, ...(item && { conditions,
    context: { item: item.id, level, exclude: exclusion || undefined, lowCosts, includeSeven: include } }) };
}
