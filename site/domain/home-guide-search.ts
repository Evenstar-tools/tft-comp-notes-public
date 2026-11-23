import type { Section } from "./document";
import { authoredParagraphs, guideBody, guideUnitMatch, readingNotes, type GuideSearchScope } from "./guide-reading";
import type { GuideFamilyStat } from "./guide-family-stats";
import { guideSearchKey, guideStyleKey, guideTraitNames, guideWearerQuery, homeGuideFilter, matchOpeningSearch, openingSearch } from "./guide-search";
import { traitCounts, usedPopulation } from "./team";
import type { Season, Team } from "./types";
import { unitSearchNames } from "./unit-search.mjs";

type Match = { board: Team; rank: number; context?: string; unitLabel?: string; namedFamily?: boolean; kind: "board" | "opening" | "guide" };

export function familyNameMatches(stat: GuideFamilyStat, query: string) {
  const term = guideSearchKey(query);
  return !!term && [stat.name, stat.sourceName, ...(stat.aliases ?? [])].some(name => guideSearchKey(name).includes(term));
}

export function homeSearchIntent(query: string, scope: GuideSearchScope) {
  const prefix = query.trim().match(/^(主\s*C|含(?:这张)?棋子)[\s:：]*(.+)$/i);
  const suffix = query.trim().match(/^(.+?)[\s:：]*主\s*C$/i);
  if (prefix) return { scope: /^主/i.test(prefix[1]) ? "carry" as const : "unit" as const, text: prefix[2].trim() };
  return suffix ? { scope: "carry" as const, text: suffix[1].trim() } : { scope, text: query.trim() };
}

export function searchUnitIds(query: string, data: Season) {
  const term = guideSearchKey(query);
  if (!term) return new Set<string>();
  const exact = data.units.filter(unit => unitSearchNames(unit).some(name => guideSearchKey(name) === term));
  const matches = exact.length ? exact : data.units.filter(unit => unitSearchNames(unit).some(name => guideSearchKey(name).includes(term)));
  return new Set(matches.map(unit => unit.id));
}

export function matchHomeGuide(query: string, { section, data, catalog, teams, style, category, augment, itemAliases = {}, scope = "all", families = [], isTransition, hasCarrySample }: {
  section: Section;
  data: Season;
  catalog: Season;
  teams: Team[];
  style?: string;
  category?: string;
  augment?: { name: string; label: string };
  itemAliases?: Record<string, string>;
  scope?: GuideSearchScope;
  families?: { stat: GuideFamilyStat; team: Team; boards?: Team[] }[];
  isTransition: (board: Team) => boolean;
  hasCarrySample?: (board: Team, unitId: string, stars: number) => boolean;
}): Match[] {
  const wearer = guideWearerQuery(query);
  const unitQuery = wearer?.unit ?? query;
  const term = guideSearchKey(unitQuery);
  const entry = (board: Team, rank: number, kind: Match["kind"] = "board"): Match => ({ board, rank, kind });
  if (!query.trim()) return teams.map(board => entry(board, 0, "guide"));
  if (!term) return [];

  // Published guides can embed only the heroes on their own boards. Resolve a
  // season-wide nickname first, so 天使 never becomes a search for 大天使之杖.
  const exactUnits = catalog.units.filter(unit => unitSearchNames(unit).some(name => guideSearchKey(name) === term));
  const unitIds = exactUnits.length ? new Set(exactUnits.map(unit => unit.id)) : searchUnitIds(unitQuery, data);
  const exactUnit = exactUnits.length > 0 || data.units.some(unit => unitIds.has(unit.id) && unitSearchNames(unit).some(name => guideSearchKey(name) === term));
  const itemNames = (name: string) => [name, ...Object.entries(itemAliases)
    .filter(([, canonical]) => guideSearchKey(canonical) === guideSearchKey(name)).map(([alias]) => alias)];
  if (wearer || scope !== "all" || exactUnit) {
    if (!unitIds.size) return [];
    const wornName = wearer && guideSearchKey(wearer.item);
    const wornItems = wornName && new Map([...catalog.items, ...data.items]
      .filter(item => itemNames(item.name).some(name => guideSearchKey(name) === wornName))
      .map(item => [item.id, item]));
    if (wearer && (!wornItems || !wornItems.size)) return [];
    return teams.flatMap(board => {
      const pieces = board.pieces.filter(piece => unitIds.has(piece.unitId) &&
        (!wornItems || piece.items?.some(id => wornItems.has(id))));
      if (!pieces.length) return [];
      const roles = readingNotes(section, board, data).roles;
      const transition = isTransition(board);
      const hits = pieces.flatMap(piece => {
        const unit = data.units.find(member => member.id === piece.unitId) ?? exactUnits.find(member => member.id === piece.unitId);
        if (!unit) return [];
        const familyCarry = families.some(row => row.team.id === board.id && row.stat.carryIds.includes(unit.id));
        const sampled = !!hasCarrySample?.(board, unit.id, unit.cost <= 3 ? 3 : 2);
        const hit = guideUnitMatch(piece, unit, roles, data.items, { familyCarry, transition, sampled });
        if ((scope === "carry" || wearer?.carry) && !hit.mainCarry) return [];
        const item = wornItems && piece.items?.map(id => wornItems.get(id)).find(Boolean);
        return [{ ...entry(board, hit.rank), unitLabel: hit.unitLabel, context: item ? `${unit.name}携带${item.name}` : undefined }];
      }).sort((a, b) => b.rank - a.rank);
      return hits.slice(0, 1);
    }).sort((a, b) => b.rank - a.rank);
  }
  const filter = homeGuideFilter(query, catalog);
  if (filter?.kind === "population") {
    return teams.filter(board => usedPopulation(board.pieces) === filter.value).map(board => entry(board, 3));
  }
  if (filter?.kind === "style") {
    const actual = guideStyleKey(style ?? "");
    return (actual === filter.value || (filter.value === "慢搜" && actual.endsWith("慢搜")))
      ? teams.map(board => entry(board, 2, "guide")) : [];
  }
  if (filter?.kind === "trait") {
    return teams.filter(board => traitCounts(board.pieces, data.units, data.traits, data.items)
      .some(trait => filter.ids.includes(trait.id) && trait.active && trait.level === filter.value))
      .map(board => entry(board, 3));
  }

  const opening = openingSearch(query, catalog);
  if (opening) {
    return teams.flatMap(board => {
      const notes = readingNotes(section, board, data);
      const paragraphs = authoredParagraphs({ ...section, blocks: guideBody(section, board).current }).map(block => block.text ?? "");
      const match = matchOpeningSearch(opening, board, notes.opening, paragraphs, isTransition(board));
      return match.rank ? [{ ...entry(board, match.rank, match.rank === 2 ? "opening" : "board"), context: match.context }] : [];
    }).sort((a, b) => b.rank - a.rank);
  }

  const includes = (text: string) => guideSearchKey(text).includes(term);
  const named = families.filter(({ stat }) => familyNameMatches(stat, query));
  if (named.length && !unitIds.size) {
    return teams.filter(board => named.some(row => (row.boards ?? [row.team]).some(option => option.id === board.id))).map(board => ({ ...entry(board, 5), namedFamily: true }));
  }
  if (!unitIds.size && includes(section.title)) return teams.slice(0, 1).map(board => entry(board, 4));
  const exact = (text: string) => guideSearchKey(text) === term;
  const itemIds = new Set(data.items.filter(item => itemNames(item.name).some(includes)).map(item => item.id));
  const traitIds = new Set(data.traits.filter(trait => guideTraitNames(trait).some(includes)).map(trait => trait.id));
  const actual = teams.filter(board => board.pieces.some(piece => unitIds.has(piece.unitId) || piece.items?.some(id => itemIds.has(id))) ||
    (traitIds.size > 0 && traitCounts(board.pieces, data.units, data.traits, data.items).some(trait => trait.active && traitIds.has(trait.id))));
  if (actual.length) return actual.map(board => {
    const holder = board.pieces.find(piece => piece.items?.some(id => itemIds.has(id)));
    const unit = holder && data.units.find(member => member.id === holder.unitId);
    const item = holder && data.items.find(gear => itemIds.has(gear.id) && holder.items?.includes(gear.id));
    return { ...entry(board, 3), context: unit && item ? `${unit.name}携带${item.name}` : undefined };
  });

  // A known chess piece or item must be present, even if the guide merely mentions it as a swap.
  const boardTerm = catalog.units.some(unit => unitSearchNames(unit).some(exact)) ||
    catalog.items.some(item => itemNames(item.name).some(exact)) ||
    catalog.traits.some(trait => guideTraitNames(trait).includes(term));
  if (boardTerm) return [];
  if ([category ?? "", augment?.name ?? "", augment?.label ?? ""].some(includes)) {
    return teams.map(board => entry(board, 2, "guide"));
  }
  return teams.flatMap(board => {
    if (includes(board.name)) return [entry(board, 3)];
    const notes = readingNotes(section, board, data);
    return includes(notes.opening) ? [{ ...entry(board, 1, "opening"), context: notes.opening }] : [];
  }).sort((a, b) => b.rank - a.rank);
}
