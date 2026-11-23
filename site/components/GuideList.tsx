"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import { guideRerollTargets } from "@/domain/reroll-targets";
import familyStats from "@/data/guide-family-stats.json";
import recommendationStats from "@/data/patch-recommendation-stats.json";
import { canRankRecommendations, guideFamilyRows, recommendationGroup, selectRecommendationRoutes, type GuideFamilyStat, type RecommendationStats } from "@/domain/guide-family-stats";
import { carryMinGames, guideCarryRows } from "@/domain/guide-carry-stats";
import { sectionTeams } from "@/domain/document-flow";
import { boardTitle, groupGuides, type GuideFamily } from "@/domain/guide-families";
import { guideBoardName, guideFacets, guideLink, guidePlaystyle, guideRollLevel, guideRoster, guideRoute, guideStrategyLabel, guideTitleWithoutPlaystyle, matchingGear, parseGuideFilters, primaryFirst, readingNotes, type GuideFilters, type GuideSearchScope, type GuideSort } from "@/domain/guide-reading";
import { patchRecommendationLabels, type PatchRecommendationBatch } from "@/domain/patch-recommendations";
import { homeGuideFilter, guideWearerQuery, searchPhaseNote, splitGuideConditions, guideSearchKey } from "@/domain/guide-search";
import { familyNameMatches, homeSearchIntent, matchHomeGuide, searchUnitIds } from "@/domain/home-guide-search";
import { itemAliases } from "@/domain/roster-import";
import { usedPopulation } from "@/domain/team";
import type { Section } from "@/domain/document";
import type { Season, Team } from "@/domain/types";
import { orderByPlacement, placementSortTier } from "@/domain/guide-placement";
import { heroAugmentForGuide } from "@/domain/hero-augments";
import { homeGuideReturn } from "@/lib/home-position";
import { guideNavigationChange, guideNavigationHref } from "@/domain/guide-navigation";
import { HomeGuideBanner } from "./GuideNavigation";
import { SiteSearchResults, useSiteSearch } from "./SiteSearchResults";
import type { SiteSearchResponse } from "@/domain/site-search";
import { guideBoardKind, PlacementBadge, teamPlacement } from "./GuidePlacement";
import { PatchRecommendationList, type RecommendationCard } from "./PatchRecommendationList";

const backupCategory = "次选";
const smallSample = "小样本";
const noSample = "暂无对应体系均名";
const categoryOrder = ["连胜成型", "连败", "条件阵容", "慢搜", "高费", "史密奇", "纹章"];
type View = "regular" | "hero-augments";
type ArchiveSort = Exclude<GuideSort, "recommended">;
type Selections = { category: string; style: string; cost: number };
type Choices = Partial<Record<View, Selections>>;
const emptyFilters = { category: "", style: "", cost: 0 };

function categoryLabel(category: string) {
  if (category.startsWith("次选")) return backupCategory;
  if (category === "条件定阵阵容" || category === "条件定阵") return "条件阵容";
  return category;
}

function categoryDisplay(category: string) {
  return category.startsWith("连胜成型") ? "连胜开局" : category;
}

function categoryPriority(category: string) {
  if (category === backupCategory) return categoryOrder.length + 4;
  if (category === smallSample) return categoryOrder.length + 2;
  if (category === noSample) return categoryOrder.length + 3;
  if (/^PBE\s*试阵/.test(category)) return categoryOrder.length + 1;
  const index = categoryOrder.findIndex(prefix => category.startsWith(prefix));
  return index < 0 ? categoryOrder.length : index;
}

function browseCategory(section: Section, playstyle?: string) {
  if (section.category === "慢搜阵容" && playstyle) return "高费阵容";
  return categoryLabel(section.category);
}

function defaultSort(view: View, filters: GuideFilters): GuideSort {
  const backup = view === "regular" && categoryLabel(filters.category ?? "") === backupCategory;
  return filters.sort ?? (backup ? "category" : "recommended");
}

function homeLink(view: View, query: string, { category, style, cost }: Selections, sort: GuideSort, scope: GuideSearchScope, fromItem?: string, exclude?: GuideFilters["exclude"]) {
  const archiveCategory = view === "regular" && sort === "recommended" && category === backupCategory ? "" : category;
  return guideNavigationHref("/", { view: view === "hero-augments" ? view : undefined, q: query, category: archiveCategory, style, cost: cost ? String(cost) : undefined, sort, scope, exclude }, fromItem);
}

// Compact forms of the current authored intros. Future source edits take precedence.
const shortOpenings: Record<string, readonly [source: string, short: string]> = {
  "四国风霞": ["霞来得早、场面能赢就走四国风。八级用四心之钢打工，先让霞上场做任务。", "霞来得早、场面能赢，八级用四心之钢打工。"],
  "高能流行芬妮&炸弹": ["六级上四高能、芬妮、斯维因，二费来得多再一起追三。", "六级追芬妮、璐璐和小炮。四个三星开巨星。"],
  "五天才玛尔扎哈": ["玛尔扎哈、艾克来得多就停七一起追三。五天才七级成型。", "玛尔扎哈、艾克来得多，七级一起追三。"],
  "四酷炫德莱文": ["德莱文、布隆来得早，有青龙刀或无尽就走。前期两星韦鲁斯带输出装，两星俄洛伊带肉装。德莱文、布隆各自两星再接装，预留一张韦鲁斯和俄洛伊补羁绊。七级优先追德莱文和布隆，卡莎顺手留。", "德莱文、布隆来得早，有青龙刀或无尽就七级一起追三。"],
  "五杀天使": ["炸弹人带羊刀，纳尔带肉。七级上纳尔、奥拉夫、死歌、炸弹人开天使，八级天使、约里克两星接装。不同名五杀合计 10 星开铁男，没开先用乌鸦，开了换铁男，九级补回乌鸦。", "七级开天使，八级找天使和约里克两星。"],
  "双电子泽丽": ["青龙刀、无尽先给芸阿娜，两星凯尔或卢锡安接装。八级掉大血就先 D 前排，稳住再上九。优先两星泽丽；女枪先两星就上她和卢锡安。蒙多两星再接蕾欧娜的肉装。", "八级掉血先 D 前排，九级泽丽或女枪谁先两星谁接装。"],
  "七海洋扎克男枪": ["奥拉夫带男枪装，鳄鱼带两件肉装开艾希。七级上五个不同的海洋或主唱开扎克，塔里克只算一个。八级搜男枪、扎克，谁两星谁接装，留一张空装鳄鱼。", "七级凑五个不同的海洋或主唱开扎克，八级找扎克、男枪两星。"],
  "史密奇95": ["饮血、血手、泰坦先合给战士打工。八级先稳血，九级摆八个非唯一羁绊开史密奇。上限看两星主坦和先来的副 C。", "八级稳血，九级开八个非唯一羁绊解锁。"],
  "爵士乐史密奇": ["九级同时开出至少 8 个非唯一羁绊，确认解锁后再 D 史密奇。五杀线优先，烬先两星走四爵士，亚索早到走真伤。", "五杀优先，烬先两星走四爵士，亚索早到走真伤。"],
  "三爵士女枪泽丽": ["女枪或泽丽谁先二星谁先接装。第二套输出装和前排齐备再做双 C，有战士装且已开锁时，补史密奇从边路切进去。", "女枪或泽丽谁先两星谁接装，装备够再做双 C。"],
  "K/DA转芬妮": ["有 K/DA 纹章再走。二阶段选秀前刷 4 次解锁芬妮。金铲铲加大棒可合纹章。", "有 K/DA 转再走，二阶段选秀前刷 4 次开芬妮。"],
  "K/DA毒舞莉莉娅": ["2-1 拿到莉莉娅专属，先合离子或正义。五级先拼双保镖、五颗 K/DA 星。", "五级追莉莉娅，先合离子或正义。"],
  "救生员鳄鱼": ["2-1 拿到雷克顿专属，有大剑、反曲弓或锁子甲再走。雷克顿先穿两件装备开艾希，未解锁前用佐伊凑三海洋。", "鳄鱼先穿两件开艾希，六级追三。"],
  "骑熊安妮": ["2-1 拿到安妮专属才走。先做纳什或法爆，看到提伯斯就买。强化已解锁提伯斯，低星熊没成型时让内瑟斯扛。", "先合纳什或法爆，五级追安妮三星。"],
  "咬痕伊莉丝": ["2-1 拿 Bite Marks。伊莉丝张数多、大棒能合装时走。五级同追伊莉丝和瑟提，尽早开 3 离子火花积攒格温的欢呼。", "伊莉丝多、大棒能合装时，五级同追伊莉丝和瑟提。"],
};

function homeOpening(text: string, title: string, augment?: ReturnType<typeof heroAugmentForGuide>) {
  if (augment) {
    text = text.replace(new RegExp("^" + augment.round + "\\s*(?:拿到?|选到?)\\s*[^。！；，,]+[。！，,；][\\s，,]*"), "");
  }
  const firstLine = text.trim();
  const prefix = firstLine.match(/^([一二三四五六七八九十\d]+级)\s*·\s*/)?.[0] ?? "";
  for (const separator of ["：", ":"]) {
    const heading = prefix + title + separator;
    if (firstLine.startsWith(heading)) {
      text = (prefix ? prefix.split("·")[0].trim() + "：" : "") + firstLine.slice(heading.length).trimStart();
      break;
    }
  }
  return text.match(/^[^。！；\n]+[。！；]?/)?.[0].trim() ?? "";
}

export function GuideList({ sections, heroSections, season, initial = {}, initialSearch, recommendations, patch, fromItem }: {
  sections: Section[]; heroSections: Section[]; season: Season; initial?: GuideFilters;
  initialSearch?: SiteSearchResponse;
  recommendations?: PatchRecommendationBatch;
  patch?: { build: string; label: string; updateId: string; effectiveAt: string };
  fromItem?: string;
}) {
  const initialView: View = initial.view === "hero-augments" ? "hero-augments" : "regular";
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState(initial.q ?? "");
  const [choices, setChoices] = useState<Choices>({
    [initialView]: { category: categoryLabel(initial.category ?? ""), style: initial.style ?? "", cost: Number(initial.cost) || 0 },
  });
  const [sort, setSort] = useState<GuideSort>(defaultSort(initialView, initial));
  const [archiveSort, setArchiveSort] = useState<ArchiveSort>(initial.sort === "mean" ? "mean" : "category");
  const [scope, setScope] = useState<GuideSearchScope>(initial.scope ?? "all");
  const [exclude, setExclude] = useState(initial.exclude);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const filterPanel = useRef<HTMLDetailsElement>(null);
  const recommended = view === "regular" && sort === "recommended";
  const selections = choices[view] ?? emptyFilters;
  const active = recommended && selections.category === backupCategory ? { ...selections, category: "" } : selections;
  const { category, style, cost } = active;
  const hasFilter = Boolean(category || style || cost);
  const needle = query.trim();
  const inputIntent = homeSearchIntent(needle, scope);
  const hasUnitQuery = Boolean(inputIntent.text && searchUnitIds(inputIntent.text, season).size);
  const intent = hasUnitQuery || inputIntent.scope !== scope ? inputIntent : { ...inputIntent, scope: "all" as const };
  const conditions = splitGuideConditions(needle);
  const lookup = useSiteSearch(conditions.length === 1 && scope === "all" && !guideWearerQuery(needle) ? needle : "", exclude, initialSearch, initial.exclude);
  const equipmentQuery = lookup.phase === "ready" && lookup.result.groups.some(group => group.kind === "gear" &&
    group.hits.some(hit => hit.gear?.type === "artifact" || hit.gear?.type === "emblem"));
  const home = homeLink(view, query, active, sort, scope, fromItem, exclude);
  const homeUrl = useRef(home);

  useEffect(() => {
    const hash = window.location.hash;
    if (homeUrl.current !== home && hash.startsWith("#guide-card-")) {
      window.history.replaceState(window.history.state, "", home);
    } else {
      window.history.replaceState(window.history.state, "", home + hash);
    }
    homeUrl.current = home;
    window.dispatchEvent(new Event(guideNavigationChange));
  }, [home]);

  useEffect(() => {
    const restore = () => {
      if (window.location.pathname !== "/") return;
      const params = parseGuideFilters(Object.fromEntries(new URLSearchParams(window.location.search)));
      const tab: View = params.view === "hero-augments" ? "hero-augments" : "regular";
      setView(tab);
      setQuery(params.q ?? "");
      setSort(defaultSort(tab, params));
      if (params.sort && params.sort !== "recommended") setArchiveSort(params.sort);
      setScope(params.scope ?? "all");
      setExclude(params.exclude);
      setChoices(previous => ({ ...previous, [tab]: {
        category: categoryLabel(params.category ?? ""), style: params.style ?? "", cost: Number(params.cost) || 0,
      } }));
      setFiltersOpen(false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;
    const panel = filterPanel.current;
    const sheet = panel?.querySelector(".guide-filter-sheet");
    const narrow = window.matchMedia("(max-width: 580px)");
    if (narrow.matches) sheet?.querySelector<HTMLElement>("select, button")?.focus();
    const handlePointer = (event: PointerEvent) => {
      if (!panel?.contains(event.target as Node)) setFiltersOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        panel?.querySelector("summary")?.focus();
      }
      if (event.key === "Tab" && narrow.matches) {
        const controls = [...(sheet?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)") ?? [])];
        const first = controls[0], last = controls.at(-1);
        const activeElement = document.activeElement;
        if (!first || !last) return;
        if (!sheet?.contains(activeElement) || activeElement === (event.shiftKey ? first : last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [filtersOpen]);

  const library = useMemo(() => {
    const regularFamilies = groupGuides(sections, season, () => undefined);
    const heroFamilies = groupGuides(heroSections, season, () => undefined);
    const familyBySection = new Map([...regularFamilies, ...heroFamilies]
      .flatMap(family => family.sections.map(section => [section.id, family] as const)));
    const prepare = (all: Section[]) => all.map(section => {
      const data = section.gameData ?? season;
      const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
      const facet = guideFacets(section, teams[0], data);
      const family = familyBySection.get(section.id);
      const rows = guideFamilyRows(familyStats, data.id, section.id, teams);
      const costsByBoard = new Map(teams.filter(team => guideBoardKind(section, team, teams[0]) !== "过渡")
        .map(team => [team.id, guideFacets(section, team, data).costs]));
      const rowCosts = (row: GuideFamilyStat) => data.units.filter(unit => row.carryIds.includes(unit.id)).map(unit => unit.cost);
      const costOptions = [...costsByBoard.values()].flat().concat(rows.flatMap(({stat}) => rowCosts(stat)));
      const playstyle = guidePlaystyle(section);
      const filterStyle = playstyle ?? facet.style;
      const viewCategory = browseCategory(section, playstyle);
      return { section, data, teams, facet, family, rows, costsByBoard, rowCosts, costOptions, playstyle, filterStyle, viewCategory, augment: heroAugmentForGuide(section) };
    });
    return { regular: prepare(sections), "hero-augments": prepare(heroSections) };
  }, [sections, heroSections, season]);

  const visible = library[view];
  const availableFacets = view === "regular" ? [...visible, ...library["hero-augments"]] : visible;
  const categories = [...new Set([...visible.map(section => section.viewCategory).filter(Boolean), ...(category ? [category] : [])])]
    .filter(name => !recommended || name !== backupCategory)
    .sort((a, b) => categoryPriority(a) - categoryPriority(b));
  const styles = [...new Set([...availableFacets.map(entry => entry.filterStyle).filter(Boolean), ...(style ? [style] : [])])];
  const costs = [...new Set([...availableFacets.flatMap(entry => entry.costOptions), ...(cost ? [cost] : [])])].sort((a,b) => a-b);
  const decisions = new Map((recommendations?.entries ?? []).map(record => [`${record.sectionId}:${record.teamId}`, record]));
  const secondaryGuides = new Set(recommendations?.entries.filter(record => record.status === "avoid").map(record => record.sectionId));
  function canShowBoard(section: Section, team: Team) {
    if (!recommended) return true;
    const status = decisions.get(`${section.id}:${team.id}`)?.status;
    const reviewedForRecommendation = status === "recommended" || status === "conditional";
    return !secondaryGuides.has(section.id) && status !== "review" &&
      (reviewedForRecommendation || categoryLabel(section.category) !== backupCategory);
  }
  const nextSelections = (target: View) => {
    if (choices[target]) return choices[target]!;
    const entries = library[target];
    return {
      category: "",
      style: entries.some(entry => entry.filterStyle === style) ? style : "",
      cost: entries.some(entry => entry.costOptions.includes(cost)) ? cost : 0,
    };
  };
  const changeView = (event: MouseEvent<HTMLAnchorElement>, target: View, targetSort = sort) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (target === view && targetSort === sort) return;
    const selections = nextSelections(target);
    window.history.pushState({ ...window.history.state, homeGuideVisit: null }, "", homeLink(target, query, selections, targetSort, scope, fromItem, exclude));
    window.dispatchEvent(new Event(guideNavigationChange));
    setChoices({ ...choices, [target]: selections });
    setFiltersOpen(false);
    setView(target);
    setSort(targetSort);
    if (target === "regular" && targetSort !== "recommended") setArchiveSort(targetSort);
  };
  const choose = (next: Partial<Selections>) => setChoices(previous => ({
    ...previous, [view]: { ...(previous[view] ?? emptyFilters), ...next },
  }));
  const clearQuery = () => { setQuery(""); setScope("all"); setExclude(undefined); searchInput.current?.focus(); };
  function changeQuery(value: string) {
    setQuery(value);
    if (scope !== "all" && !searchUnitIds(homeSearchIntent(value, "all").text, season).size) setScope("all");
  }

  function candidatesFor(entries: typeof visible, terms = conditions, recommendationsOnly = recommended) {
    return entries.flatMap(entry => {
      const { section, data, teams, filterStyle, augment, viewCategory } = entry;
      if ((category && viewCategory !== category) || (style && filterStyle !== style) || (cost && !entry.costOptions.includes(cost))) return [];
      const searchTeams = recommendationsOnly ? teams.filter(board => canShowBoard(section, board)) : teams;
      if (recommendationsOnly && !searchTeams.length) return [];
      const one = (term: string) => {
        const part = homeSearchIntent(term, terms.length === 1 ? intent.scope : "all");
        const component = season.items.find(item => item.category === "component" && guideSearchKey(item.name) === guideSearchKey(part.text.replace(/^散件[：:]?\s*/, "")));
        const args: Parameters<typeof matchHomeGuide>[1] = {
        section, data, catalog: season, teams: searchTeams, style: filterStyle, category: viewCategory, augment, itemAliases, scope: part.scope, families: entry.rows,
        isTransition: board => guideBoardKind(section, board, teams[0]) === "过渡",
        hasCarrySample: (board, id, stars) => guideCarryRows(data.id, section.id, board.id)
          .some(row => row.carryId === id && row.stars === stars && row.slots === 3 && row.games >= carryMinGames),
        };
        if (component) return searchTeams.flatMap(board => {
          const equipped = new Set(board.pieces.flatMap(piece => piece.items ?? []));
          const result = data.items.find(item => equipped.has(item.id) && (item.id===component.id || item.components?.includes(component.id)));
          return result ? [{board,rank:3,kind:"board" as const, context:`${component.name}可用于${result.name}`,unitLabel:undefined,namedFamily:false}] : [];
        });
        return matchHomeGuide(part.text,args);
      };
      const hits = terms.length ? terms.map(one) : [one("")];
      const matches = hits[0].flatMap(hit => {
        const subset = hits.slice(1).map(list => list.find(row => row.board.id===hit.board.id));
        if (subset.some(row=>!row)) return [];
        return [{...hit,rank:subset.reduce((sum,row)=>sum+(row?.rank??0),hit.rank),context:[...new Set([hit.context,...subset.map(row=>row?.context)].filter(Boolean))].join(" · ") || undefined,
          unitLabel:hit.unitLabel??subset.find(row=>row?.unitLabel)?.unitLabel}];
      }).sort((a,b)=>b.rank-a.rank).filter(({ board }) => !cost || entry.costsByBoard.get(board.id)?.includes(cost) ||
        entry.rows.some(row => row.team.id === board.id && entry.rowCosts(row.stat).includes(cost)));
      if ((needle || cost) && !matches.length) return [];
      const head = matches[0];
      return [{ ...entry, team: head?.board ?? searchTeams[0], matches, rank: head?.rank ?? 0, context: head?.context, unitLabel: head?.unitLabel }];
    });
  }

  const candidates = equipmentQuery ? [] : candidatesFor(visible);
  const isHeroList = view === "hero-augments";
  const seen = new Set<string>();
  type Candidate = (typeof candidates)[number];
  type Result = Candidate & { siblings: Candidate[]; family?: GuideFamily };
  const canUseUnmatchedLead = !recommended && !needle && !cost;
  const grouped = candidates.flatMap<Result>(candidate => {
    const family = candidate.family;
    if (!family) return [{ ...candidate, siblings: [] }];
    if (seen.has(family.lead.section.id)) return [];
    seen.add(family.lead.section.id);
    const related = candidates.filter(entry => entry.family === family);
    const mostRelevant = related.reduce((best, entry) => entry.rank > best.rank ? entry : best);
    const head = mostRelevant.rank ? mostRelevant : related.find(entry => entry.section.id === family.lead.section.id &&
      (canUseUnmatchedLead || entry.matches.some(match => match.board.id === family.lead.team.id))) ?? related[0];
    const team = !head.rank && head.section.id === family.lead.section.id &&
      (canUseUnmatchedLead || head.matches.some(match => match.board.id === family.lead.team.id)) ? family.lead.team : head.team;
    return [{ ...head, team, siblings: related.filter(entry => entry !== head) }];
  });
  const ranked = sort === "mean" && !isHeroList;
  const carryQuery = intent.scope === "carry" && needle ? searchUnitIds(intent.text, season) : undefined;
  const matchingRows = (entry: Candidate) => entry.rows.flatMap(({ stat, boards }) => {
    if ((cost && !entry.rowCosts(stat).includes(cost)) || (carryQuery && !stat.carryIds.some(id => carryQuery.has(id)))) return [];
    const hits = boards.flatMap(board => {
      const hit = entry.matches.find(match => match.board.id === board.id && (!match.namedFamily || familyNameMatches(stat, intent.text)));
      return hit ? [{ board, rank:hit.rank }] : [];
    }).sort((a,b) => b.rank-a.rank);
    if (!hits.length) return [];
    return [{ stat, team:hits[0].board, boards:hits.map(hit => hit.board) }];
  });
  type Card = Result & { rating?: GuideFamilyStat; routes?: Team[]; cardId: string };
  const rated: Card[] = ranked ? candidates.flatMap<Card>(entry => {
    const matches = matchingRows(entry);
    const canonical = entry.rows.find(row => row.team.id === entry.teams[0]?.id) ?? entry.rows[0];
    if (!matches.length) return [{ ...entry, siblings: [], cardId: entry.section.id }];
    const cards: Card[] = matches.map(({ stat, team, boards }) => {
      const own = entry.matches.find(match => match.board.id === team.id);
      return { ...entry, rank: own?.rank ?? 0, context: own?.context, unitLabel: own?.unitLabel, team, rating: stat, routes:stat.landingTeamId ? boards : undefined, siblings: [],
        cardId: stat === canonical?.stat ? entry.section.id : entry.section.id + "-" + stat.clusterId };
    });
    if (entry.unitLabel && !cards.some(card => card.rank >= entry.rank)) {
      cards.push({ ...entry, cardId: entry.section.id + "-" + entry.team.id, siblings: [] });
    }
    return cards;
  }) : grouped.map(entry => {
    const team = entry.team;
    const matching = matchingRows(entry).filter(row => row.boards.some(board => board.id === team?.id));
    const match = !isHeroList && matching.length === 1 ? matching[0] : undefined;
    const routes = match?.stat.landingTeamId && team &&
      match.boards.some(board => usedPopulation(board.pieces) !== usedPopulation(team.pieces)) ? match.boards : undefined;
    return { ...entry, cardId: entry.section.id,
      routes, rating: match?.stat };
  });
  const results = ranked ? orderByPlacement(rated) : rated;
  if (needle) results.sort((a, b) => b.rank - a.rank);
  const byCategory = !needle && sort === "category" && !isHeroList;
  const categoryGroups = new Map<string, typeof rated>();
  for (const entry of results) {
    const tier = ranked && !needle ? placementSortTier(entry.rating) : "ranked";
    const categoryName = tier === "low" ? smallSample : tier === "missing" ? noSample
      : byCategory ? entry.viewCategory : "";
    const group = categoryGroups.get(categoryName);
    if (group) group.push(entry);
    else categoryGroups.set(categoryName, [entry]);
  }
  const groupPriority = (name: string) => {
    if (name === "") return -2;
    if (name === backupCategory && ranked) return -1;
    return categoryPriority(name);
  };
  const groups = [...categoryGroups].sort(([a], [b]) => groupPriority(a) - groupPriority(b));
  const groupLinks = byCategory && groups.length > 1 ? groups.map(([name], index) => ({
    label: categoryDisplay(name).replace(/成型阵容$|阵容$/, ""), id: name === backupCategory ? "backup-guides" : "guide-group-" + index,
  })) : [];

  const snapshot: RecommendationStats = recommendationStats;
  const hasCurrentStats = patch && canRankRecommendations(snapshot, season.id, patch);
  const selectedRoutes = recommended && hasCurrentStats ? selectRecommendationRoutes(snapshot.rows.flatMap(rating => {
    const entry = candidates.find(result => result.section.id === rating.sectionId);
    const team = entry?.teams.find(board => board.id === rating.teamId);
    if (!entry || !team || !canShowBoard(entry.section, team)) return [];
    const exact = entry.matches.find(match => match.board.id === team.id);
    if ((needle || cost) && !exact) return [];
    const { section, data } = entry;
    const facet = guideFacets(section, team, data);
    const strategy = guideStrategyLabel(section, team, data, entry.teams[0]);
    const group = recommendationGroup(entry.playstyle ?? strategy ?? facet.style, facet.costs, guideRollLevel(section, team));
    if (!group) return [];
    const conditional = decisions.get(`${section.id}:${team.id}`)?.status === "conditional";
    return [{ entry, team, group, rating, strategy, exact, conditional, familyId: entry.family?.lead.section.id ?? section.id }];
  })) : [];
  const recommendationCards: RecommendationCard[] = selectedRoutes.map(({ entry, exact, team, group, rating, strategy, conditional }) => {
    const { section, data } = entry;
    const notes = readingNotes(section, team, data);
    const record = decisions.get(`${section.id}:${team.id}`);
    const primary = entry.teams[0]?.id === team.id;
    const [original, short] = shortOpenings[guideTitleWithoutPlaystyle(section.title, entry.playstyle)] ?? [];
    const opening = record?.note ?? rating.opening ?? (primary && notes.opening.trim() === original ? short : homeOpening(notes.opening, rating.name));
    const roles = notes.roles;
    const roster = guideRoster(team, data, roles);
    const lineup: RecommendationCard["avatars"] = roster.map(({ unit, role }) => ({
      unit, role: role === "主输出" || role === "主C" ? "主C" : role === "主坦" ? "主坦" : undefined,
    }));
    const leads = lineup.filter(({ role }) => role);
    const tank = leads.find(({ role }) => role === "主坦");
    const ordered = [...leads.slice(0, 2), ...(tank ? [tank] : []), ...leads, ...lineup];
    const avatars = ordered.filter(({ unit }, index) =>
      ordered.findIndex(entry => entry.unit.id === unit.id) === index
    ).slice(0, 3);
    const route = guideRoute(section, entry.teams, team)?.phases ?? [];
    const population = usedPopulation(team.pieces);
    const stages = new Map<string, { team: Team; label: string }>();
    for (const phase of route) {
      const board = phase.team;
      if (!board || board.id === team.id || usedPopulation(board.pieces) >= population || stages.has(board.id)) continue;
      if (decisions.get(`${section.id}:${board.id}`)?.status === "avoid") continue;
      if ((needle || cost) && !entry.matches.some(match => match.board.id === board.id)) continue;
      stages.set(board.id, { team: board, label: phase.label });
    }
    return {
      group, rating, team, title: guideTitleWithoutPlaystyle(rating.name, entry.playstyle), avatars, opening, conditional,
      entryTeamId: primary && (!needle || exact?.namedFamily) ? section.reroll?.entryTeamId : undefined,
      stages: [...stages.values()],
      strategy,
      badgeLabel: route.find(phase => phase.team?.id === team.id)?.label || population + " 人口",
      hit: exact?.unitLabel ?? exact?.context,
    };
  });
  const showReview = Boolean(needle) || (view === "regular" && sort === "category");
  const reviewFor = (sectionId: string, teamId?: string) => {
    const record = showReview && teamId ? decisions.get(`${sectionId}:${teamId}`) : undefined;
    return record?.status === "review" ? record : undefined;
  };
  const displayedCount = recommended ? recommendationCards.length : results.length;
  const crossTab = needle && !displayedCount && !equipmentQuery && (!recommended || hasUnitQuery)
    ? candidatesFor(library[recommended || isHeroList ? "regular" : "hero-augments"], conditions, false)
      .sort((a,b) => b.rank - a.rank).slice(0, 8)
    : [];
  const lookupGroups = lookup.phase === "ready" ? lookup.result.groups.filter(group =>
    group.kind === "gear" || (!equipmentQuery && group.kind !== "guides") || (!recommended &&
    !hasFilter && !displayedCount && !crossTab.length && !equipmentQuery)) : [];
  const showLookup = Boolean(lookupGroups.length);
  const searching = !displayedCount && !crossTab.length && lookup.phase === "loading";
  const relaxed = !displayedCount && !crossTab.length && conditions.length>1 ? conditions.flatMap((term,i)=>{
    const rest=conditions.filter((_,j)=>j!==i);
    return candidatesFor(availableFacets,rest).length ? [{term,rest}] : [];
  }) : [];
  const archiveLink = <a className="text-link" href={homeLink("regular", query, nextSelections("regular"), archiveSort, scope, fromItem, exclude)}
    onClick={event => changeView(event, "regular", archiveSort)}>查看全部攻略</a>;
  const emptyState = <div className="empty-inline quick-condition-empty"><p>{needle || hasFilter
    ? recommended ? "没有匹配的本版推荐" : "没有匹配的阵容"
    : "暂无已发布阵容"}</p>
    {relaxed.map(({term,rest})=><button key={term} type="button" onClick={()=>changeQuery(rest.join(" + "))}>去掉「{term}」再找</button>)}
    {hasFilter && <button type="button" onClick={()=>choose(emptyFilters)}>清除筛选</button>}
    {recommended && archiveLink}
  </div>;

  const renderCards = (group: typeof rated, groupName: string, eager: boolean) => {
    const CardTitle = groupName ? "h3" : "h2";
    return <div className="guide-list reader-list">{group.map(({ section, data, team, teams, matches, augment, siblings, family, rating: matchedRating, routes, cardId, context: searchContext, unitLabel, facet, playstyle }, index) => {
      const primary = teams[0];
      const kind = team && guideBoardKind(section, team, primary);
      const alternative = team && team.id !== primary.id;
      const review = reviewFor(section.id, team?.id);
      const rating = review && !ranked ? undefined : matchedRating;
      const coreRating = !rating && !review && !ranked && !isHeroList && !augment && team && team.id === primary?.id
        ? teamPlacement(team, section, "core") : undefined;
      const showCore = coreRating?.mean !== undefined;
      const useGuideEntry = team?.id === primary?.id && (!needle || matches.some(match => match.board.id === team?.id && match.namedFamily));
      const link = guideLink(section.id, (useGuideEntry ? section.reroll?.entryTeamId : undefined) ?? team?.id,
        homeGuideReturn(home, cardId, team?.id));
      const notes = team && readingNotes(section, team, data);
      const roles = notes?.roles ?? [];
      const cardRoles = ranked && rating?.carryIds.length && !roles.some(role => role.label === "主C" || role.label === "主输出")
        ? [{ label: "主C", units: rating.carryIds.filter(id => !roles.some(role => role.units.includes(id) && ["主坦", "副坦", "副C"].includes(role.label))), text: "" }, ...roles]
        : roles;
      const decision = !needle && team ? decisions.get(`${section.id}:${team.id}`) : undefined;
      const entryNote = decision?.status === "recommended" || decision?.status === "conditional" ? decision.note : undefined;
      const intro = searchContext ?? entryNote ?? notes?.opening ?? "";
      const guideName = guideTitleWithoutPlaystyle(section.title, playstyle);
      const [sourceIntro, compactIntro] = shortOpenings[guideName] ?? [];
      const title = guideTitleWithoutPlaystyle(ranked && rating ? rating.name : team ? boardTitle(section, team) : section.title, playstyle);
      const opening = entryNote && !searchContext ? entryNote
        : !searchContext && !alternative && intro.trim() === sourceIntro ? compactIntro : homeOpening(intro, title, augment);
      const stage = section.reroll?.stages.find(entry => entry.teamId === team?.id);
      const chaseTargets = team ? guideRerollTargets(section.id, team.id, stage?.parentTeamId) : [];
      const namedRoute = routes?.length && matches.some(match => match.board.id === team?.id && match.namedFamily);
      const hasRoutes = routes && routes.length > 1;
      const population = team && usedPopulation(team.pieces);
      const titleShowsPopulation = needle && alternative &&
        [...title.normalize("NFKC").matchAll(/[\d一二两三四五六七八九十]+\s*(?:人口|级)/g)].some(([label]) => {
          const filter = homeGuideFilter(label, data);
          return filter?.kind === "population" && filter.value === population;
        });
      const phase = needle && population !== undefined && !namedRoute && !hasRoutes && !titleShowsPopulation ? population + " 人口" : "";
      const phaseNote = needle && team && !namedRoute && !(hasRoutes && unitLabel)
        ? searchPhaseNote(team, intro, notes?.stage ?? "")?.replace(/^八人口备选[。．]?\s*/, "") : undefined;
      const searchDetails = [unitLabel, phase, phaseNote && !opening.includes(phaseNote) ? phaseNote : ""].filter(Boolean).join(" · ");
      const gearMatches = team && !unitLabel ? matchingGear(team, data, needle, itemAliases) : [];
      const titleId = "guide-title-" + cardId;
      const ratingId = "guide-placement-" + cardId;
      const reviewId = "guide-review-" + cardId;
      const detailsIds = [rating?.games || showCore ? ratingId : "", review ? reviewId : ""].filter(Boolean).join(" ") || undefined;
      const strategy = team && guideStrategyLabel(section, team, data, primary);
      const description = ranked && rating && title !== guideName && alternative ? guideName + " · " + kind
        : augment ? [augment.round, augment.label || augment.name, strategy].filter(Boolean).join(" · ")
        : alternative && team?.id !== family?.lead.team.id && kind && !title.includes(kind)
          ? [kind, strategy].filter(Boolean).join(" · ") : strategy ?? (playstyle ? "" : facet.style);
      const variants = [...new Map([{ section, teams, matches }, ...siblings].flatMap(entry => {
        const options = needle ? entry.matches.filter(match => match.kind === "board").map(match => match.board) : entry.teams;
        return options.filter(option => canShowBoard(entry.section, option) && option.id !== team?.id && !routes?.some(board => board.id === option.id) && (needle || guideBoardKind(entry.section, option, entry.teams[0]) !== "过渡"))
          .map(option => [option.id, { option, origin: entry.section, original: entry.teams[0] }] as const);
      })).values()];
      const variantLinks = variants.length > 0 && <ul className="guide-variant-links" aria-label="阵容方案">{variants.map(({ option, origin, original }) => {
        const kind = guideBoardKind(origin, option, original);
        const name = origin.id !== section.id ? boardTitle(origin, option) : guideBoardName(option);
        const label = kind;
        const variantReview = reviewFor(origin.id, option.id);
        return <li key={option.id}><a href={guideLink(origin.id, option.id, homeGuideReturn(home, cardId, option.id))} data-home-board={option.id}>
          {!name.includes(label) && <span className="guide-variant-kind">{label}</span>}
          <span>{name}</span>
          {variantReview && <span className="guide-review-badge" title={variantReview.note}>待复核</span>}
        </a></li>;
      })}</ul>;
      return <article key={cardId} className="guide-result" id={"guide-card-" + cardId}>
        <a className="guide-result-main" href={link} data-home-board={team?.id} aria-labelledby={titleId} aria-describedby={detailsIds}>
          <div className="guide-title-row">
            <div className="guide-card-heading">
              <CardTitle className="guide-result-title" id={titleId}>{title}</CardTitle>
              {playstyle && <span className="guide-playstyle-tag" title="打法">{playstyle}</span>}
              {review && <span className="guide-review-badge" id={reviewId} title={review.note}>待复核</span>}
            </div>
            {rating && <span id={ratingId} className={"guide-placement " + (rating.mean < 4.5 ? "strong" : rating.mean > 4.5 ? "weak" : "middle")}
              title={familyStats.patch + " · 前四 " + (100 * rating.topFourRate).toFixed(1) + "% · 吃鸡 " + (100 * rating.winRate).toFixed(1) + "%"}>
              <span>{rating.landingTeamId === team?.id && rating.teamId !== team?.id ? "体系均名" : "均名"}</span> <strong>{rating.mean.toFixed(2)}</strong><small>{rating.games.toLocaleString("zh-CN")} 场</small>
            </span>}
            {showCore && <PlacementBadge rating={coreRating} id={ratingId} />}
          </div>
          {description && <small className="guide-result-meta">{description}</small>}
          {gearMatches.length > 0 && <small className="guide-result-meta">带 {gearMatches.map(item => item.name).join("、")}</small>}
          {opening && <p>{opening}</p>}
          {needle && searchDetails && <small className="guide-result-meta">{searchDetails}</small>}
          {team && <div className="guide-avatars">{guideRoster(team, data, cardRoles).map(({ piece, unit, role }) => {
            const chaseThree = piece.stars === 3 && chaseTargets.includes(unit.id);
            const displayName = unit.id === "renata-glasc" ? "烈娜塔" : unit.name.split(" · ")[0];
            const displayRole = piece.items.length ? role : undefined;
            return <span key={piece.instanceId} className={"cost-" + unit.cost} title={chaseThree ? unit.name + " · 追三星" : unit.name}>
              <img src={unit.image} alt="" width={72} height={72} loading={eager && index === 0 ? "eager" : "lazy"} decoding="async" />
              <small className="guide-avatar-name">{displayName}</small>
              {(displayRole || chaseThree) && <small className="guide-avatar-role">
                {displayRole && <span>{displayRole}</span>}
                {chaseThree && <span className="guide-avatar-chase" role="img" aria-label="追三星">★★★</span>}
              </small>}
            </span>;
          })}</div>}
        </a>
        {routes && routes.length > 1 && <nav className="guide-lineup-routes" aria-label={section.title + "的棋盘"}>
          {routes.map(board => {
            const routeReview = board.id !== team?.id && reviewFor(section.id, board.id);
            return <a key={board.id} data-home-board={board.id}
              href={guideLink(section.id, board.id, homeGuideReturn(home, cardId, board.id))}>
              <span>{usedPopulation(board.pieces)} 级{guideBoardKind(section, board, primary)}</span>
              {guideBoardName(board).split("·").at(-1)?.trim()}
              {routeReview && <span className="guide-review-badge" title={routeReview.note}>待复核</span>}
            </a>;
          })}
        </nav>}
        {augment && isHeroList ? variantLinks : variantLinks && (!ranked || !rating || cardId === section.id) &&
          <details className="guide-family-fold" data-home-fold={"family-" + cardId} key={"variants-" + query} open={needle ? true : undefined}>
            <summary>变阵（{variants.length}）</summary>
            {variantLinks}
          </details>}
      </article>;
    })}</div>;
  };

  const filterChips = [
    ...(category ? [{ id: "category", text: categoryDisplay(category), remove: () => choose({ category: "" }) }] : []),
    ...(style ? [{ id: "style", text: style, remove: () => choose({ style: "" }) }] : []),
    ...(cost ? [{ id: "cost", text: cost + " 费主C", remove: () => choose({ cost: 0 }) }] : []),
  ];
  const closeFilters = () => {
    setFiltersOpen(false);
    filterPanel.current?.querySelector("summary")?.focus();
  };

  return <div className="home-guide-library">
    <HomeGuideBanner patch={patch} />
    {fromItem && <a className="text-link guide-gear-return" href={fromItem}>返回装备图鉴</a>}
    <div className="home-browse-controls">
      <div className="guide-order-row">
        <nav className="guide-library-tabs home-patch-tabs" aria-label="阵容分栏">
          <a href={homeLink("regular", query, nextSelections("regular"), "recommended", scope, fromItem, exclude)}
            aria-current={recommended ? "page" : undefined} onClick={event => changeView(event, "regular", "recommended")}>本版推荐</a>
          <a href={homeLink("regular", query, nextSelections("regular"), archiveSort, scope, fromItem, exclude)}
            aria-current={view === "regular" && !recommended ? "page" : undefined} onClick={event => changeView(event, "regular", archiveSort)}>全部攻略</a>
          {heroSections.length > 0 && <a href={homeLink("hero-augments", query, nextSelections("hero-augments"), sort, scope, fromItem, exclude)}
            aria-current={view === "hero-augments" ? "page" : undefined} onClick={event => changeView(event, "hero-augments")}>英雄强化</a>}
        </nav>
      </div>
      <div className="filters guide-filters">
        <div className="guide-search-field">
          <input ref={searchInput} type="search" aria-label="搜索阵容" placeholder="搜阵容、棋子或装备" title="多个条件用 +，如 凯尔主C + 羊刀" maxLength={60} value={query} onChange={event => changeQuery(event.target.value)} />
          {query && <button type="button" className="guide-search-clear" aria-label="清空搜索" onClick={clearQuery}>×</button>}
        </div>
        {(categories.length > 1 || styles.length > 0 || costs.length > 0) && <details ref={filterPanel} className="guide-extra-filters" open={filtersOpen}>
          <summary onClick={event => { event.preventDefault(); setFiltersOpen(!filtersOpen); }}>筛选{hasFilter ? <span className="guide-filter-number">{filterChips.length}</span> : null}</summary>
          <div className="guide-filter-sheet" role="region" aria-label="筛选阵容">
            <div className="guide-filter-sheet-heading"><button type="button" onClick={closeFilters}>完成</button></div>
            {categories.length > 1 && <select aria-label="阵容分类筛选" value={category} onChange={event => choose({ category: event.target.value })}>
              <option value="">全部分类</option>
              {categories.map(value => <option key={value} value={value}>{categoryDisplay(value).replace(/阵容$/, "") || value}</option>)}
            </select>}
            {styles.length > 0 && <select aria-label="按打法筛选" value={style} onChange={event => choose({ style: event.target.value })}>
              <option value="">全部打法</option>{styles.map(tag => <option key={tag}>{tag}</option>)}
            </select>}
            {costs.length > 0 && <select aria-label="按主C费用筛选" value={cost} onChange={event => choose({ cost: Number(event.target.value) })}>
              <option value={0}>全部主C费用</option>{costs.map(gold => <option key={gold} value={gold}>{gold} 费主C</option>)}
            </select>}
          </div>
          <div className="guide-filter-backdrop" onClick={closeFilters} aria-hidden="true" />
        </details>}
        {(hasUnitQuery || hasFilter || (needle && displayedCount > 0) || conditions.length>1) && <div className="guide-filter-chips">
          {conditions.length>1 && <div className="quick-conditions" aria-label="查询条件">{conditions.map(term=><button type="button" key={term} className="guide-filter-chip" aria-label={"移除"+term} onClick={()=>changeQuery(conditions.filter(t=>t!==term).join(" + "))}>{term} <span aria-hidden>×</span></button>)}</div>}
          {hasUnitQuery && <div className="guide-search-scope" role="group" aria-label="棋子检索范围">
            {(["all","carry","unit"] as const).map((option, index) => <button key={option} type="button" aria-pressed={intent.scope === option}
              onClick={() => { setQuery(intent.text); setScope(option); }}>{["全部","主C","含棋子"][index]}</button>)}
          </div>}
          {filterChips.map(chip => <button key={chip.id} type="button" className="guide-filter-chip" aria-label={"移除" + chip.text} onClick={chip.remove}>{chip.text} <span aria-hidden="true">×</span></button>)}
          {displayedCount > 0 && <span className="guide-result-count" aria-hidden="true">{displayedCount} 套阵容</span>}
          {hasFilter && <button type="button" className="guide-filter-clear" onClick={() => choose(emptyFilters)}>清除筛选</button>}
        </div>}
      </div>
    </div>
    {displayedCount > 0 && <span role="status" className="sr-only">{displayedCount} 套阵容</span>}
    {(crossTab.length > 0 || showLookup) && <div className="home-search-results" data-with-reference={crossTab.length > 0 && showLookup || undefined}>
      {crossTab.length > 0 && <section className="site-lookup-other" aria-labelledby="home-matching-guides">
        <h2 id="home-matching-guides">匹配的攻略</h2>
        {crossTab.map(({ section, data, team, augment }) => {
          const id = "match-" + section.id;
          const board = team && team.id !== section.primaryTeamId ? guideBoardName(team) : "";
          const lead = team && guideRoster(team, data, readingNotes(section, team, data).roles)[0]?.unit;
          const decision = team && decisions.get(`${section.id}:${team.id}`);
          const status = decision?.status;
          return <article id={"guide-card-" + id} key={id}>
            <a href={guideLink(section.id, team?.id, homeGuideReturn(home, id, team?.id))}
              data-home-board={team?.id} className="site-lookup-result guide-result-main">
              {lead && <img src={lead.image} width={34} height={34} className={"cost-" + lead.cost} alt="" loading="lazy" />}
              <span className="site-lookup-label">
                <strong>{section.title}</strong>
                {board && board !== section.title && <small>{board}</small>}
              </span>
              {status === "review" || status === "avoid"
                ? <span className="guide-review-badge" title={decision?.note}>{patchRecommendationLabels[status]}</span>
                : augment && <small>英雄强化</small>}
              <ChevronRight className="site-lookup-arrow" size={16} aria-hidden="true" />
            </a>
          </article>;
        })}
      </section>}
      {showLookup && <SiteSearchResults search={lookup} filter={group => lookupGroups.includes(group)} onToggleExclusion={setExclude} quiet />}
    </div>}
    {searching && <p className="site-lookup-message" role="status">正在搜索…</p>}

    {recommended && <>
      <PatchRecommendationList stats={snapshot} cards={recommendationCards} home={home} />
      {!displayedCount && !crossTab.length && needle && showLookup && !equipmentQuery && <div className="empty-inline">{archiveLink}</div>}
      {!displayedCount && !crossTab.length && !showLookup && !searching && (needle || hasFilter ? emptyState : <div className="empty-inline"><p>暂无本版推荐</p>
        {archiveLink}
      </div>)}
    </>}

    {view === "regular" && !recommended && (!needle || displayedCount > 0) && <div className="home-archive-tools">
      {groupLinks.length > 0 && <nav className="home-group-jumps" aria-label="跳到阵容分组">
        {groupLinks.map(group => <a key={group.id} href={"#" + group.id}>{group.label}</a>)}
      </nav>}
      <details key={sort} className="home-archive-sort">
        <summary aria-label={"攻略排序，" + (sort === "mean" ? "按体系均名" : "按分类")}>{sort === "mean" ? "按体系均名" : "按分类"}</summary>
        <nav aria-label="攻略排序">
          {([["category", "按分类"], ["mean", "按体系均名"]] as const).map(([option, label]) =>
            <a key={option} href={homeLink("regular", query, active, option, scope, fromItem, exclude)} aria-current={sort === option ? "true" : undefined}
              onClick={event => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                changeView(event, "regular", option);
              }}>{label}</a>)}
        </nav>
      </details>
    </div>}
    {ranked && rated.some(entry => entry.rating) && <p className="guide-rank-note">{patch && Date.parse(familyStats.updatedAt) < Date.parse(patch.effectiveAt) ? "上一版 · " : ""}{familyStats.queue} {familyStats.patch} · 近 {familyStats.days} 天 · <time dateTime={familyStats.updatedAt} title={familyStats.updatedAt}>{familyStats.updatedAt.slice(5,10).replace("-", "/")} {familyStats.updatedAt.slice(11,16)} UTC</time> · <a href="https://www.metatft.com/pbe-comps" target="_blank" rel="noreferrer">MetaTFT</a></p>}
    {!recommended && groups.length > 0 && <div className="guide-sections">{groups.map(([name, entries], index) => {
      const cards = renderCards(entries, name, index === 0);
      const headingId = "guide-group-" + index;
      if (name === smallSample || name === noSample) return <details key={name} className="guide-group-small-sample" data-home-fold={"group-" + name} open>
        <summary>{name}（{entries.length}）</summary>{cards}
      </details>;
      return name ? <section key={name} id={name === backupCategory ? "backup-guides" : undefined} className="guide-section" aria-labelledby={headingId}>
        <h2 id={headingId}>{categoryDisplay(name)}</h2>
        {index === 0 && groupLinks.length > 0 && <details className="home-group-jump-mobile"><summary>跳到分组</summary><div>
          {groupLinks.map(group => <a key={group.id} href={"#" + group.id} onClick={event => { event.currentTarget.closest("details")!.open = false; }}>{group.label}</a>)}
        </div></details>}
        {cards}
      </section> : <Fragment key={name}>{cards}</Fragment>;
    })}</div>}
    {!recommended && !results.length && !crossTab.length && !showLookup && !searching && emptyState}
  </div>;
}
