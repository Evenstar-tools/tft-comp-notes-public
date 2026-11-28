"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { guideRerollTargets } from "@/domain/reroll-targets";
import { season as currentSeason } from "@/data";
import familyData from "@/data/guide-family-stats.json";
import coreData from "@/data/patch-recommendation-stats.json";
import { displayGuideName, displayTraitNames } from "@/domain/trait-names.mjs";
import { canRankRecommendations, compareGuideFamilyPerformance, currentRecommendationEvidence, familyMetricValue, formatRecommendationMean, hasHomeRecommendationSample, homeRecommendationEligible, guideDirectoryTier, guideFamilyBoardIds, guideFamilyRows, guideTierLabels as tierLabels, previousRecommendationDeadline, recommendationGroup, recommendationTier, selectRecommendationRoutes, type GuideFamilyDirection, type GuideFamilyMetric, type GuideFamilySnapshot, type GuideFamilyStat, type HomeRecommendationRating, type RecommendationGroup, type RecommendationStats } from "@/domain/guide-family-stats";
import { placementEvidenceKind } from "@/domain/guide-placement";
import { carryMinGames, guideCarryRows } from "@/domain/guide-carry-stats";
import { sectionTeams } from "@/domain/document-flow";
import { boardTitle, groupGuides, type GuideFamily } from "@/domain/guide-families";
import { guideBoardName, guideFacets, guideLink, guidePlaystyle, guideRollLevel, guideRoster, guideRoute, guideStrategyLabel, guideTitleWithoutPlaystyle, matchingGear, parseGuideFilters, primaryFirst, readingNotes, repeatsFormationLabel, type GuideFilters, type GuideSearchScope, type GuideSort } from "@/domain/guide-reading";
import { rerollEntryTeamId } from "@/domain/reroll-stages";
import { activeHomeRecommendationOverrides, patchRecommendationLabels, type PatchRecommendation, type PatchRecommendationBatch } from "@/domain/patch-recommendations";
import { homeGuideFilter, matchesGuideStyle, guideWearerQuery, searchPhaseNote, splitGuideConditions, guideSearchKey, guideStyleKey } from "@/domain/guide-search";
import { equippedGuideRoutes, familyNameMatches, homeSearchIntent, matchHomeGuide, searchUnitIds } from "@/domain/home-guide-search";
import { itemAliases } from "@/domain/roster-import";
import { usedPopulation } from "@/domain/team";
import type { Section } from "@/domain/document";
import type { Season, Team } from "@/domain/types";
import { heroAugmentCategory, heroAugmentForGuide } from "@/domain/hero-augments";
import { beijingDateTime } from "@/lib/beijing-time";
import { homeGuideReturn } from "@/lib/home-position";
import { guideNavigationChange, guideNavigationHref } from "@/domain/guide-navigation";
import { HomeGuideBanner } from "./GuideNavigation";
import { SiteSearchResults, useSiteSearch } from "./SiteSearchResults";
import { siteSearchIntent, type SiteSearchResponse } from "@/domain/site-search";
import { isLiveLaunchTransition, sameEdition } from "@/domain/version-updates";
import { guideBoardKind, guideDirectoryCorePlacements, type GuideCorePlacement } from "./GuidePlacement";
import { formationCoreResult } from "./GuideFormationStats";
import { PatchRecommendationList, type RecommendationCard } from "./PatchRecommendationList";
import { useOwnerSession } from "./OwnerSession";
import { OwnerEditBar, OwnerEditFlag, OwnerInlineEdit, OwnerPageDrawer, useOwnerPageEditor } from "./OwnerPageEditor";
import { applyOwnerHomeRecommendations, homeContentBlocks, type HomeFields } from "@/domain/owner-content";
import { GuideConditionIcon } from "./GuideEquipmentConditions";
import { guideConditionName, guideConditionsAnchor, guideEquipmentConditions } from "@/domain/guide-equipment-conditions";
import { HomeGearSearch, isHomeGear } from "./HomeGearSearch";
import { GuideCardBoard, GuideQuickView } from "./GuideCardBoard";
import { GuideStatsTable, guideStatsMetricLabels, type GuideStatsTableRow } from "./GuideStatsTable";
import { GUIDE_SECTION_IDS } from "@/domain/guide-identities";
import { CompTrendPanel } from "./CompTrendPanel";
import { decodeHomeGuideIndex } from "@/lib/home-guide-index";
import { extractPublicGuideIdFromHref, type GuideEntrySource } from "@/domain/analytics";
import { rememberGuideEntry, trackGuideView, trackSearchResultOpen, trackSearchResults } from "@/lib/analytics";

const backupCategory = "次选";
const tierOrder: string[] = [tierLabels.recommended, tierLabels.secondary, tierLabels.review];
type View = "regular" | "hero-augments" | "comp-trends";
type ArchiveSort = Exclude<GuideSort, "recommended">;
type Selections = { category: string; style: string; cost: number };
type Choices = Partial<Record<View, Selections>>;
type FamilySort = { metric: GuideFamilyMetric; direction: GuideFamilyDirection };
const emptyFilters = { category: "", style: "", cost: 0 };
const archiveViews = [["category", "攻略卡片"], ["mean", "数据对照"]] as const;
const recommendationSecondaryCarries = new Map<string, { unitId: string; boardId: string }>([
  [GUIDE_SECTION_IDS.oceanGraves, { unitId: "taliyah", boardId: "00000000-0000-4000-8000-000000000076" }],
  [GUIDE_SECTION_IDS.kdaNeeko, { unitId: "akali-kda", boardId: "00000000-0000-4000-8000-000000000039" }],
  [GUIDE_SECTION_IDS.rockVayne, { unitId: "pyke", boardId: "00000000-0000-4000-8000-000000000068" }],
]);

function filterView(view: GuideFilters["view"]): View {
  return view === "hero-augments" || view === "comp-trends" ? view : "regular";
}

function guideFromTrends(href: string | undefined, home: string) {
  if (!href?.startsWith("/guides/")) return href;
  const url = new URL(href, "https://tft.local");
  url.searchParams.set("from", home);
  return url.pathname + url.search + url.hash;
}

function familySortFrom(filters: GuideFilters): FamilySort {
  const metric = filters.metric ?? "mean";
  return { metric, direction: filters.direction ?? (metric === "mean" ? "asc" : "desc") };
}

function defaultSort(view: View, filters: GuideFilters): GuideSort {
  return filters.sort ?? (view === "regular" && filters.category ? "category" : "recommended");
}

// Compact forms of the current authored intros. Future source edits take precedence.
const shortOpenings: Record<string, readonly [source: string, short: string]> = {
  "四国风霞": ["霞来得早、场面能赢就走四国风。八级用四心之钢打工，先让霞上场做任务。", "霞来得早、场面能赢，八级用四心之钢打工。"],
  "高能流行芬妮&炸弹": ["六级上四高能、芬妮、斯维因，二费来得多再一起追三。", "六级追芬妮、璐璐和小炮。四个三星开巨星。"],
  "五天才玛尔扎哈": ["玛尔扎哈、艾克来得多就停七一起追三。五天才七级成型。", "玛尔扎哈、艾克来得多，七级一起追三。"],
  "四主宰海之歌艾克辛德拉": ["辛德拉、艾克来得早走七级慢搜；双三成型立刻升八／九，别死停七级。", "辛德拉、艾克来得早走七级慢搜；双三立刻升八／九，别死停七级。"],
  "爵士金克丝": ["八级自带 9 个非唯一羁绊，拉九零换牌自动领史密奇；物理装主养金克丝，战士装留史密奇。", "八级双两星稳血，原盘上九解锁史密奇。"],
  "四大触打击乐德莱文": ["德莱文、布隆来得早，有青龙刀或无尽就走。前期两星韦鲁斯带输出装，两星俄洛伊带肉装。德莱文、布隆各自两星再接装，预留一张韦鲁斯和俄洛伊补羁绊。七级优先追德莱文和布隆，卡莎顺手留。", "德莱文、布隆来得早，有青龙刀或无尽就七级一起追三。"],
  "五杀天使": ["炸弹人带羊刀，纳尔带肉。七级上纳尔、奥拉夫、死歌、炸弹人开天使，八级天使、约里克两星接装。不同名五杀合计 9 星开铁男，没开先用乌鸦，开了换铁男，九级补回乌鸦。", "七级开天使，八级找天使和约里克两星。"],
  "双电子泽丽": ["速九跳九。高血高经济时，八级用现成打工盘过渡，直上九搜泽丽和蒙多。青龙刀、无尽先给芸阿娜，两星凯尔或卢锡安接装。优先两星泽丽；女枪先两星就上她和卢锡安。蒙多两星再接蕾欧娜的肉装。", "八级用现成打工盘过渡，存钱直上九找泽丽和蒙多。"],
  "七海之歌扎克男枪": ["奥拉夫带男枪装，鳄鱼带两件肉装开艾希。七级上五个不同的海之歌或主唱开扎克，塔里克只算一个。八级搜男枪、扎克，谁两星谁接装，留一张空装鳄鱼。", "七级凑五个不同的海之歌或主唱开扎克，八级找扎克、男枪两星。"],
  "K/DA转芬妮": ["有 K/DA 纹章再走。二阶段选秀前刷 4 次解锁芬妮。金铲铲加大棒可合纹章。", "有 K/DA 转再走，二阶段选秀前刷 4 次开芬妮。"],
  "K/DA毒舞莉莉娅": ["2-1 拿到莉莉娅专属，先合离子或正义。五级先拼双护卫、五颗 K/DA 星。", "五级追莉莉娅，先合离子或正义。"],
  "救生员鳄鱼": ["2-1 拿到雷克顿专属，有大剑、反曲弓或锁子甲再走。雷克顿先穿两件装备开艾希，未解锁前用佐伊凑三海之歌。", "鳄鱼先穿两件开艾希，六级追三。"],
  "骑熊安妮": ["2-1 拿到安妮专属才走。先做纳什或法爆，看到提伯斯就买。强化已解锁提伯斯，低星熊没成型时让内瑟斯扛。", "先合纳什或法爆，六级追安妮三星。"],
  "咬痕伊莉丝": ["2-1 拿齿痕。伊莉丝张数多、大棒能合装时走。五级同追伊莉丝和瑟提，尽早开 3 离子火花积攒格温的欢呼。", "伊莉丝多、大棒能合装时，五级同追伊莉丝和瑟提。"],
};

function displayOpening(text: string) {
  return displayTraitNames(text).replaceAll("海洋", "海之歌").replace(/拿\s*Bite Marks/g, "拿齿痕");
}

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
  return (text.match(/^[^。！；\n]+[。！；]?/)?.[0].trim() ?? "").replace(/；$/, "。");
}

const homeFamilyStats: GuideFamilySnapshot & { previous?: GuideFamilySnapshot } = familyData;
const familyStats = homeFamilyStats;
const coreStats: RecommendationStats = coreData;

export function GuideList({ index, season = currentSeason, initial = {}, initialSearch, recommendations: publishedRecommendations,
  baseRecommendations, ownerHome, artifactRanking, patch, fromItem, checkedAt }: {
  index: string; season?: Season; initial?: GuideFilters;
  initialSearch?: SiteSearchResponse;
  recommendations?: PatchRecommendationBatch;
  baseRecommendations?: PatchRecommendationBatch;
  ownerHome?: HomeFields;
  artifactRanking?: ReactNode;
  patch?: { seasonId: string; build: string; label: string; updateId: string; effectiveAt: string; launchTransition?: boolean;
    metaTftPatch: { patch: string; bPatch?: string } };
  fromItem?: string;
  checkedAt: number;
}) {
  const { session } = useOwnerSession();
  const ownerEditor = useOwnerPageEditor<HomeFields>(patch && session?.isOwner && session.databaseConfigured ? { home: true } : undefined);
  const preview = ownerEditor.previewFields;
  const recommendations = patch && preview?.recommendations
    ? applyOwnerHomeRecommendations(ownerHome?.recommendations ? baseRecommendations : publishedRecommendations, preview.recommendations, patch)
    : publishedRecommendations;
  const { sections, heroSections, trends } = useMemo(() => decodeHomeGuideIndex(index), [index]);
  const launchTransition = isLiveLaunchTransition(patch);
  const initialView = filterView(launchTransition && !trends && initial.view === "comp-trends" ? undefined : initial.view);
  const [archiveReady, setArchiveReady] = useState(() =>
    initialView !== "regular" || initial.sort !== "category" || Boolean(initial.q || initial.category || initial.style || initial.cost));
  useLayoutEffect(() => {
    // Expand the directory from the existing index before return links restore scroll.
    if (!archiveReady) setArchiveReady(true);
  }, [archiveReady]);
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState(initial.q ?? "");
  const [choices, setChoices] = useState<Choices>({
    [initialView]: { category: initial.category ?? "", style: initial.style ?? "", cost: Number(initial.cost) || 0 },
  });
  const [sort, setSort] = useState<GuideSort>(defaultSort(initialView, initial));
  const [archiveSort, setArchiveSort] = useState<ArchiveSort>(initial.sort === "mean" ? "mean" : "category");
  const [performance, setPerformance] = useState<FamilySort>(() => familySortFrom(initial));
  const [scope, setScope] = useState<GuideSearchScope>(initial.scope ?? "all");
  const [exclude, setExclude] = useState(initial.exclude);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickView, setQuickView] = useState<{ key: string; home: string; guideId: string; previewId: string; source: GuideEntrySource }>();
  const quickAnchor = useRef<{ card: HTMLElement; top: number } | null>(null);
  const reportedQuickView = useRef<string | null>(null);
  const libraryRoot = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [homeComposing, setHomeComposing] = useState(false);
  const homeComposingRef = useRef(false);
  const restoredInlineQuery = useRef<string | null>((initial.q ?? "").trim() || null);
  const lastInlineSearchKey = useRef<string | null>(null);
  const filterPanel = useRef<HTMLDetailsElement>(null);
  const showingTrends = view === "comp-trends";
  const recommendationTab = view === "regular" && sort === "recommended";
  const needle = showingTrends ? "" : query.trim();
  const recommended = recommendationTab && !needle;
  const selections = choices[view] ?? emptyFilters;
  const active = recommendationTab && tierOrder.includes(selections.category) ? { ...selections, category: "" } : selections;
  const { category, style, cost } = active;
  const styleKey = guideStyleKey(style);
  const hasFilter = Boolean(category || style || cost);
  const inputIntent = homeSearchIntent(needle, scope);
  const hasUnitQuery = Boolean(inputIntent.text && searchUnitIds(inputIntent.text, season).size);
  const intent = hasUnitQuery || inputIntent.scope !== scope ? inputIntent : { ...inputIntent, scope: "all" as const };
  const conditions = splitGuideConditions(needle);
  const firstCondition = conditions[0] ?? "";
  const lookupTerm = scope === "all" && !guideWearerQuery(firstCondition) ? firstCondition : "";
  const lookup = useSiteSearch(lookupTerm, exclude, initialSearch, initial.exclude, true);
  const gearHits = lookup.phase === "ready" ? lookup.result.groups.find(group => group.kind === "gear")?.hits.filter(isHomeGear) ?? [] : [];
  const selectedGear = gearHits.length === 1 ? gearHits[0] : undefined;
  const equipmentQuery = Boolean(selectedGear || (conditions.length === 1 && gearHits.length));
  const extraGearTerms = selectedGear ? query.trimStart().slice(lookupTerm.length).replace(/^\s*[+＋]\s?/, "") : "";
  function homeLink(target: View, { category, style, cost }: Selections, targetSort: GuideSort) {
    if (target === "comp-trends") return guideNavigationHref("/", { view: target }, fromItem);
    const archiveCategory = target === "regular" && targetSort === "recommended" && tierOrder.includes(category) ? "" : category;
    const ranking = target === "regular" && targetSort === "mean";
    const metric = ranking && performance.metric !== "mean" ? performance.metric : undefined;
    const direction = ranking && performance.direction !== (performance.metric === "mean" ? "asc" : "desc") ? performance.direction : undefined;
    return guideNavigationHref("/", {
      view: target === "hero-augments" ? target : undefined, q: query, category: archiveCategory,
      style, cost: cost ? String(cost) : undefined, sort: targetSort, scope, exclude, metric, direction,
    }, fromItem);
  }
  const home = homeLink(view, active, sort);
  const homeUrl = useRef(home);

  useLayoutEffect(() => {
    const anchor = quickAnchor.current;
    quickAnchor.current = null;
    if (!anchor?.card.isConnected) return;
    const shift = anchor.card.getBoundingClientRect().top - anchor.top;
    if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: "instant" });
  }, [quickView]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "#comp-trends" && !showingTrends) return;
    if (homeUrl.current !== home && hash.startsWith("#guide-card-")) {
      window.history.replaceState(window.history.state, "", home);
    } else {
      window.history.replaceState(window.history.state, "", home + hash);
    }
    homeUrl.current = home;
    window.dispatchEvent(new Event(guideNavigationChange));
  }, [home, showingTrends]);

  useEffect(() => {
    const restore = () => {
      if (window.location.pathname !== "/") return;
      const params = parseGuideFilters(Object.fromEntries(new URLSearchParams(window.location.search)));
      const tab = filterView(params.view);
      setView(tab);
      setFiltersOpen(false);
      if (tab === "comp-trends") return;
      restoredInlineQuery.current = (params.q ?? "").trim() || null;
      setQuery(params.q ?? "");
      setSort(defaultSort(tab, params));
      if (params.sort === "mean") setPerformance(familySortFrom(params));
      if (params.sort && params.sort !== "recommended") setArchiveSort(params.sort);
      setScope(params.scope ?? "all");
      setExclude(params.exclude);
      setChoices(previous => ({ ...previous, [tab]: {
        category: params.category ?? "", style: params.style ?? "", cost: Number(params.cost) || 0,
      } }));
    };
    const upgradeTrendAnchor = () => {
      if (window.location.pathname !== "/" || window.location.hash !== "#comp-trends") return;
      window.history.replaceState(window.history.state, "", guideNavigationHref("/", { view: "comp-trends" }, fromItem));
      restore();
    };
    const frame = window.requestAnimationFrame(upgradeTrendAnchor);
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", upgradeTrendAnchor);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", upgradeTrendAnchor);
    };
  }, [fromItem]);

  useEffect(() => {
    if (!filtersOpen) return;
    const panel = filterPanel.current;
    const sheet = panel?.querySelector(".guide-filter-sheet");
    const narrow = window.matchMedia("(max-width: 580px)");
    sheet?.querySelector("select")?.focus({ preventScroll: true });
    const handlePointer = (event: PointerEvent) => {
      if (!panel?.contains(event.target as Node)) setFiltersOpen(false);
    };
    const handleFocus = (event: FocusEvent) => {
      if (!narrow.matches && !panel?.contains(event.target as Node)) setFiltersOpen(false);
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
    document.addEventListener("focusin", handleFocus);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("focusin", handleFocus);
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
      const familyBoards = guideFamilyBoardIds(familyStats, data.id, section.id, teams[0]?.id);
      const costsByBoard = new Map(teams.filter(team => guideBoardKind(section, team, teams[0]) !== "过渡")
        .map(team => [team.id, guideFacets(section, team, data).costs]));
      const rowCosts = (row: GuideFamilyStat) => data.units.filter(unit => row.carryIds.includes(unit.id)).map(unit => unit.cost);
      const costOptions = [...costsByBoard.values()].flat().concat(rows.flatMap(({stat}) => rowCosts(stat)));
      const playstyle = guidePlaystyle(section);
      const filterStyle = playstyle ?? facet.style;
      const stylesByBoard = new Map(teams.map(board => [board.id, guidePlaystyle(section, board) ?? filterStyle]));
      const searchTopic = section.category === "纹章阵容" ? "纹章 转职" : "";
      const curated = patch?.build ? guideEquipmentConditions(section, teams, data, patch.build) : undefined;
      return { section, data, teams, facet, family, rows, familyBoards, costsByBoard, rowCosts, costOptions, playstyle, filterStyle, stylesByBoard, searchTopic, curated, augment: heroAugmentForGuide(section) };
    });
    return { regular: prepare(sections), "hero-augments": prepare(heroSections) };
  }, [sections, heroSections, season, patch?.build]);

  const visible = view === "comp-trends" ? [] : library[view];
  const hasCurrentStats = currentRecommendationEvidence(familyStats, season.id, patch, recommendations?.reviewedRollingPatch);
  const familyDataEnd = Date.parse(familyStats.updatedAt ?? "");
  const patchStart = patch ? Date.parse(patch.effectiveAt) : NaN;
  const familyWindowNote = launchTransition && !familyStats.spansBuilds ? undefined
    : familyDataEnd < patchStart ? "上一版快照"
    : familyStats.spansBuilds ? `近 ${familyStats.days} 天含热补前对局`
    : familyStats.build === patch?.build && patch?.build ? "仅当前构建"
    : familyDataEnd - familyStats.days * 86400000 < patchStart ? `近 ${familyStats.days} 天含热补前对局` : undefined;
  const [expiredAt, setExpiredAt] = useState(0);
  const now = Math.max(checkedAt, expiredAt);
  const latestDeadline = !launchTransition ? previousRecommendationDeadline(homeFamilyStats, season.id, patch, now) : undefined;
  const previousFamilyStats = latestDeadline !== undefined ? homeFamilyStats : homeFamilyStats.previous;
  const previousDeadline = launchTransition ? undefined : latestDeadline ??
    (previousFamilyStats && previousRecommendationDeadline(previousFamilyStats, season.id, patch, now));
  useEffect(() => {
    if (previousDeadline === undefined) return;
    const timer = window.setTimeout(() => setExpiredAt(previousDeadline), Math.max(0, previousDeadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previousDeadline]);
  const hasCurrentCore = !!patch && canRankRecommendations(coreStats, season.id, patch);
  const showArchiveCore = view === "regular" && !recommended;
  const archiveCorePlacements = useMemo(() => {
    const ratings = new Map<string, GuideCorePlacement>();
    if (!showArchiveCore || !patch) return ratings;
    for (const { section, teams } of library.regular) {
      for (const [id, sample] of guideDirectoryCorePlacements(section, teams, familyStats, recommendations?.reviewedRollingPatch)) {
        ratings.set(id, sample);
      }
    }
    return ratings;
  }, [library.regular, patch, recommendations?.reviewedRollingPatch, showArchiveCore]);
  const showTiers = view === "regular" && !recommendationTab;
  const tierFilter = showTiers ? category : "";
  const homeEntries = [...library.regular, ...library["hero-augments"]];
  const availableFacets = view === "regular" ? homeEntries : visible;
  const styles = new Map([...availableFacets.flatMap(entry => [...entry.stylesByBoard.values()]), style].filter(Boolean)
    .map(tag => [guideStyleKey(tag), tag.replace(/^([一二三])费/, (text, digit: string) => ("一二三".indexOf(digit) + 1) + "费")] as const));
  const costs = [...new Set([...availableFacets.flatMap(entry => entry.costOptions), ...(cost ? [cost] : [])])].sort((a,b) => a-b);
  const fixedRecommendations = new Map((recommendations?.fixedBoardRecommendations ?? []).map(record => [record.teamId, record]));
  const decisions = new Map((recommendations?.entries ?? []).map(record => [`${record.sectionId}:${record.teamId}`, record]));
  const homeOverrides = new Map(activeHomeRecommendationOverrides(recommendations, patch)
    .map(record => [`${record.sectionId}:${record.teamId}`, record]));
  const webSelections = new Set((preview?.recommendations ?? ownerHome?.recommendations ?? [])
    .filter(record => record.override === "pin" || record.override === "include")
    .map(record => `${record.sectionId}:${record.teamId}`));
  const openingOrder = launchTransition ? new Map([...homeOverrides.values()]
    .filter(record => record.launchEntry)
    .map((record, index) => [record.teamId, index])) : undefined;
  function canShowBoard(section: Section, team: Team) {
    if (!recommended && !showingTrends) return true;
    const key = `${section.id}:${team.id}`;
    if (homeOverrides.get(key)?.override === "exclude") return false;
    const status = decisions.get(key)?.status;
    return webSelections.has(key) || (status !== "review" && status !== "avoid");
  }
  const nextSelections = (target: View) => {
    if (target === "comp-trends") return emptyFilters;
    if (choices[target]) return choices[target]!;
    const entries = library[target];
    return {
      category: "",
      style: entries.some(entry => [...entry.stylesByBoard.values()].some(tag => guideStyleKey(tag) === styleKey)) ? style : "",
      cost: entries.some(entry => entry.costOptions.includes(cost)) ? cost : 0,
    };
  };
  const changeView = (event: MouseEvent<HTMLAnchorElement>, target: View, targetSort = sort) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (target === view && targetSort === sort) return;
    const selections = nextSelections(target);
    window.history.pushState({ ...window.history.state, homeGuideVisit: null }, "", homeLink(target, selections, targetSort));
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
  const clearQuery = () => { restoredInlineQuery.current = null; lastInlineSearchKey.current = null; setQuery(""); setScope("all"); setExclude(undefined); searchInput.current?.focus(); };
  function changeQuery(value: string) {
    restoredInlineQuery.current = null;
    setQuery(value);
    if (scope !== "all" && !searchUnitIds(homeSearchIntent(value, "all").text, season).size) setScope("all");
  }

  function candidatesFor(entries: typeof visible, terms = conditions, recommendationsOnly = recommended) {
    return entries.flatMap(entry => {
      const { section, data, teams, filterStyle, augment, searchTopic } = entry;
      const searchFamilies = recommendationsOnly && previousDeadline !== undefined && previousFamilyStats && previousFamilyStats !== homeFamilyStats
        ? [...entry.rows, ...guideFamilyRows(previousFamilyStats, data.id, section.id, teams)] : entry.rows;
      if (cost && !entry.costOptions.includes(cost)) return [];
      const searchTeams = teams.filter(board => (!recommendationsOnly || canShowBoard(section, board)) &&
        (!style || matchesGuideStyle(entry.stylesByBoard.get(board.id) ?? filterStyle, style)));
      if (!searchTeams.length) return [];
      const one = (term: string) => {
        const part = homeSearchIntent(term, terms.length === 1 ? intent.scope : "all");
        const component = season.items.find(item => item.category === "component" && guideSearchKey(item.name) === guideSearchKey(part.text.replace(/^散件[：:]?\s*/, "")));
        const args: Parameters<typeof matchHomeGuide>[1] = {
        section, data, catalog: season, teams: searchTeams, style: filterStyle, category: searchTopic, augment, itemAliases, scope: part.scope, families: searchFamilies,
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

  const gearExamples = selectedGear ? candidatesFor(visible, conditions.slice(1), false).flatMap(entry => {
    const { section, teams, data, playstyle } = entry;
    if (!sameEdition(data.id, season.id)) return [];
    const unitIndex = new Map(data.units.map(unit => [unit.id, unit]));
    const { lowCosts } = siteSearchIntent(lookupTerm);
    return equippedGuideRoutes(section, teams, entry.matches.map(match => match.board), selectedGear.id,
      unitIndex, selectedGear.gear.exclude, lowCosts).map(({ board, wearers, population }) => {
      const stage = board.id === teams[0].id ? population + "级" : guideBoardName(board);
      const wearerNames = [...new Set(wearers.map(unit => unit.name))];
      return {
        id: board.id, name: guideTitleWithoutPlaystyle(boardTitle(section, board), playstyle), image: wearers[0].image,
        detail: stage + " · " + wearerNames.join("、") + "携带",
        href: guideLink(section.id, board.id, homeGuideReturn(home, "gear-" + board.id, board.id)),
      };
    });
  }) : [];
  const isHeroList = view === "hero-augments";
  const ranked = sort === "mean" && view === "regular";
  const comparisonEntries = ranked && hasCurrentStats ? visible.map(entry => ({
    ...entry,
    rows: guideFamilyRows(familyStats, entry.data.id, entry.section.id, entry.teams, { includeSmallSamples: true }),
  })) : visible;
  const candidates = equipmentQuery && !ranked ? [] : candidatesFor(comparisonEntries);
  const seen = new Set<string>();
  type Candidate = (typeof candidates)[number];
  type Result = Candidate & { siblings: Candidate[]; family?: GuideFamily };
  const canUseUnmatchedLead = !recommended && !needle && !cost && !style;
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
  const boardTier = (section: Section, team: Team | undefined, stat?: Pick<GuideFamilyStat, "games" | "mean"> & { winRate?: number }) =>
    guideDirectoryTier(stat, decisions.get(`${section.id}:${team?.id}`)?.status);
  const comparedBoards = new Set<string>();
  const statsRows: GuideStatsTableRow[] = ranked ? candidates.flatMap(entry =>
    matchingRows(entry).filter(({team, stat}) => !tierFilter ||
      tierLabels[boardTier(entry.section, team, hasCurrentStats ? stat : undefined)] === tierFilter).map(match => ({ ...match, entry }))
  ).sort((a, b) => {
    const leftCountOnly = a.stat.games < 100, rightCountOnly = b.stat.games < 100;
    if (leftCountOnly && rightCountOnly) return b.stat.games - a.stat.games;
    if (leftCountOnly !== rightCountOnly) return leftCountOnly ? 1 : -1;
    return compareGuideFamilyPerformance(a.stat, b.stat, performance.metric, performance.direction, familyStats.totalFinishes);
  })
    .map(({ stat, team, entry }) => {
      const { section, data, playstyle } = entry;
      const notes = readingNotes(section, team, data);
      const name = guideTitleWithoutPlaystyle(displayGuideName(stat.name), playstyle);
      const decision = decisions.get(`${section.id}:${team.id}`);
      const advice = decision?.status === "recommended" || decision?.status === "conditional" ? decision.note : notes.opening;
      const context = entry.matches.find(match => match.board.id === team.id)?.context;
      const roster = guideRoster(team, data, notes.roles);
      const cores = roster.filter(({ role }) => role === "主C" || role === "主输出" || role === "主坦");
      const tank = cores.find(({ role }) => role === "主坦");
      const carry = cores.find(({ role }) => role !== "主坦") ?? roster.find(({ unit }) => stat.carryIds.includes(unit.id));
      const ordered = [carry, tank, ...cores, ...roster].filter(item => item !== undefined);
      const portraits = [...new Map(ordered.map(({ unit }) => [unit.id, unit])).values()].slice(0, 4);
      const cardId = section.id + "-stats-" + stat.clusterId;
      const href = guideLink(section.id, team.id, homeGuideReturn(home, cardId, team.id));
      comparedBoards.add(team.id);
      return {
        id: "guide-card-" + cardId, name, note: displayTraitNames(context || homeOpening(advice, name)), tier: boardTier(section, team, hasCurrentStats ? stat : undefined),
        style: playstyle ?? (entry.filterStyle?.includes("慢搜") ? "慢搜" : undefined),
        link: <a className="guide-stats-link" href={href} data-home-board={team.id}>{name}</a>,
        units: portraits.map(unit => <span className="guide-stats-unit" key={unit.id} title={unit.name}>
          <img className={"cost-" + unit.cost} src={unit.image} alt={unit.name} width={38} height={38} loading="lazy" />
          <span aria-hidden="true">{unit.id === "renata-glasc" ? "烈娜塔" : unit.name.split(" · ")[0]}</span>
        </span>),
        games: stat.games, mean: stat.games < 100 ? null : stat.mean,
        pickRate: stat.games < 100 ? null : familyMetricValue(stat, "pickRate", familyStats.totalFinishes),
        topFourRate: stat.games < 100 ? null : familyMetricValue(stat, "topFourRate"),
        winRate: stat.games < 100 ? null : familyMetricValue(stat, "winRate"),
      };
    }) : [];
  const nativeSectionIds = new Set(statsRows.map(row => row.id.replace(/^guide-card-/, "").split("-stats-")[0]));
  const coreSortMetric = performance.metric === "pickRate" ? "mean" : performance.metric;
  const coreSortDirection = performance.metric === "pickRate" ? "asc" : performance.direction;
  const coreStatsRows: GuideStatsTableRow[] = ranked ? candidates.flatMap(entry => {
    if (nativeSectionIds.has(entry.section.id) || entry.section.category === heroAugmentCategory) return [];
    const primaryBoard = entry.team;
    if (!primaryBoard) return [];
    const core = archiveCorePlacements.get(primaryBoard.id);
    if (!core || core.mean === undefined || core.topFourRate === undefined || core.winRate === undefined) return [];
    const tier = boardTier(entry.section, primaryBoard, { games: core.games, mean: core.mean, winRate: core.winRate });
    if (tierFilter && tierLabels[tier] !== tierFilter) return [];
    return [{ entry, team: primaryBoard, core, tier }];
  }).sort((a, b) => {
    const pick = (row: { core: { mean?: number; topFourRate?: number; winRate?: number; games: number } }) =>
      coreSortMetric === "mean" ? (row.core.mean ?? 9)
        : coreSortMetric === "topFourRate" ? (row.core.topFourRate ?? 0)
        : (row.core.winRate ?? 0);
    const diff = pick(a) - pick(b);
    return (coreSortDirection === "asc" ? diff : -diff) || b.core.games - a.core.games;
  }).map(({ entry, team, core, tier }) => {
    const { section, data, playstyle } = entry;
    const notes = readingNotes(section, team, data);
    const name = guideTitleWithoutPlaystyle(displayGuideName(section.title), playstyle);
    const decision = decisions.get(`${section.id}:${team.id}`);
    const advice = decision?.status === "recommended" || decision?.status === "conditional" ? decision.note : notes.opening;
    const context = entry.matches.find(match => match.board.id === team.id)?.context;
    const roster = guideRoster(team, data, notes.roles);
    const cores = roster.filter(({ role }) => role === "主C" || role === "主输出" || role === "主坦");
    const tank = cores.find(({ role }) => role === "主坦");
    const carry = cores.find(({ role }) => role !== "主坦") ?? roster[0];
    const ordered = [carry, tank, ...cores, ...roster].filter(item => item !== undefined);
    const portraits = [...new Map(ordered.map(({ unit }) => [unit.id, unit])).values()].slice(0, 4);
    const cardId = section.id + "-core-stats";
    const href = guideLink(section.id, team.id, homeGuideReturn(home, cardId, team.id));
    comparedBoards.add(team.id);
    return {
      id: "guide-card-" + cardId, name, note: displayTraitNames(context || homeOpening(advice, name)), tier,
      style: playstyle ?? (entry.filterStyle?.includes("慢搜") ? "慢搜" : undefined),
      link: <a className="guide-stats-link" href={href} data-home-board={team.id}>{name}</a>,
      units: portraits.map(unit => <span className="guide-stats-unit" key={unit.id} title={unit.name}>
        <img className={"cost-" + unit.cost} src={unit.image} alt={unit.name} width={38} height={38} loading="lazy" />
        <span aria-hidden="true">{unit.id === "renata-glasc" ? "烈娜塔" : unit.name.split(" · ")[0]}</span>
      </span>),
      games: core.games, mean: core.mean ?? null,
      pickRate: null, topFourRate: core.topFourRate ?? null, winRate: core.winRate ?? null,
    };
  }) : [];
  type Card = Result & { rating?: Pick<GuideFamilyStat, "mean" | "games"> & Partial<Pick<GuideFamilyStat, "topFourRate" | "winRate">>;
    core?: GuideCorePlacement; routeName?: string; clusterId?: GuideFamilyStat["clusterId"]; routes?: Team[]; cardId: string; tier: ReturnType<typeof recommendationTier> };
  const results = (ranked && !needle) || recommended ? [] : grouped.flatMap<Card>(entry => {
    const primaryCard = { ...entry, cardId: entry.section.id, tier: "review" as const };
    if (isHeroList) {
      const rows = hasCurrentStats ? entry.rows.filter(({ stat, boards }) =>
        stat.heroAugment && boards.some(board => board.id === entry.team?.id)) : [];
      return [{ ...primaryCard, rating: rows.length === 1 ? rows[0].stat : undefined }];
    }
    const cards: Card[] = [];
    for (const route of [entry, ...entry.siblings]) {
      const focus = route.team;
      const matches = hasCurrentStats ? matchingRows(route) : [];
      const includesBoard = (boards: Team[], team?: Team) => boards.some(board => board.id === team?.id);
      for (const match of matches) {
        const isFocus = includesBoard(match.boards, focus);
        const hit = route.matches.find(result => result.board.id === match.team.id);
        if (needle && !isFocus && (!hit || hit.rank < route.rank)) continue;
        const team = isFocus ? focus : match.team;
        const tier = boardTier(route.section, team, hasCurrentStats ? match.stat : undefined);
        const routes = match.stat.landingTeamId && match.boards.some(board =>
          usedPopulation(board.pieces) !== usedPopulation(team.pieces)) ? match.boards : undefined;
        cards.push({ ...entry, ...route, team, routes, tier, rating: match.stat,
          context: isFocus ? route.context : hit?.context, unitLabel: isFocus ? route.unitLabel : hit?.unitLabel,
          routeName: displayGuideName(match.stat.name), clusterId: match.stat.clusterId,
          cardId: isFocus && !cards.some(card => card.cardId === route.section.id) ? route.section.id : route.section.id + "-family-" + match.stat.clusterId });
      }
      if (matches.some(match => includesBoard(match.boards, focus))) continue;
      const core = focus && archiveCorePlacements.get(focus.id);
      if (focus && route.familyBoards.has(focus.id) && !core) {
        if (!cards.length && route === entry) cards.push(primaryCard);
        continue;
      }
      const rating = core?.mean !== undefined ? { ...core, mean: core.mean } : undefined;
      if (route !== entry && !rating) continue;
      cards.push({ ...entry, ...route, tier: boardTier(route.section, focus, rating), core, rating, cardId: route.section.id });
    }
    return cards.filter(card => (!tierFilter || tierLabels[card.tier] === tierFilter) &&
      (!ranked || !card.team || !comparedBoards.has(card.team.id)));
  });
  if (!isHeroList) results.sort((a, b) => {
    const relevance = needle && tierFilter !== backupCategory ? b.rank - a.rank : 0;
    const tier = tierOrder.indexOf(tierLabels[a.tier]) - tierOrder.indexOf(tierLabels[b.tier]);
    if (relevance || tier) return relevance || tier;
    const source = a.tier === "secondary" ? 0 : Number(!!a.core) - Number(!!b.core);
    return source || (a.rating?.mean ?? 9) - (b.rating?.mean ?? 9) ||
      (b.rating?.games ?? 0) - (a.rating?.games ?? 0);
  });
  else if (needle) results.sort((a, b) => b.rank - a.rank);
  const byCategory = !needle && sort === "category" && !isHeroList;
  const heroConditionGroup = isHeroList && results.length > 0 && results.every(({ augment, curated }) =>
    augment && curated?.rows.some(row => row.id === augment.id));
  const categoryGroups = new Map<string, Card[]>();
  for (const entry of results) {
    const categoryName = byCategory ? tierLabels[entry.tier] : heroConditionGroup ? "海克斯定阵" : "";
    const group = categoryGroups.get(categoryName);
    if (group) group.push(entry);
    else categoryGroups.set(categoryName, [entry]);
  }
  const groups = [...categoryGroups].sort(([a], [b]) => tierOrder.indexOf(a) - tierOrder.indexOf(b));
  const groupLinks = byCategory && groups.length > 1 ? groups.map(([name], index) => ({
    label: name, id: name === backupCategory ? "backup-guides" : "guide-group-" + index,
  })) : [];

  type HomeEntry = typeof library.regular[number] & { matches?: Candidate["matches"] };
  type HomeSelection = {
    entry: HomeEntry; team: Team; group: RecommendationGroup; familyId: string; rating: HomeRecommendationRating;
    strategy?: string; exact?: Candidate["matches"][number]; decision?: PatchRecommendation;
    override?: PatchRecommendation["override"]; pinOrder?: number; launchOrder?: number; upgradeTeam?: Team;
  };

  function homeRouteContext(entry: HomeEntry, team: Team) {
    const { section, data } = entry;
    const isHero = section.category === heroAugmentCategory;
    const exact = entry.matches?.find(match => match.board.id === team.id);
    const facet = guideFacets(section, team, data);
    const strategy = guideStrategyLabel(section, team, data, entry.teams[0]);
    const decision = decisions.get(`${section.id}:${team.id}`);
    const inferredGroup = recommendationGroup(entry.playstyle ?? strategy ?? facet.style, facet.costs, guideRollLevel(section, team));
    const group = isHero ? "heroAugment" : decision?.group ?? inferredGroup;
    if (!group || (!isHero && group === "heroAugment")) return;
    return { group, strategy: !isHero && inferredGroup && group !== inferredGroup ? undefined : strategy, exact, decision };
  }

  function homeRouteCandidates(batch: GuideFamilySnapshot | undefined, entries: HomeEntry[], useOwnerOverrides: boolean): HomeSelection[] {
    return entries.flatMap(entry => {
      const { section, data } = entry;
      const isHero = section.category === heroAugmentCategory;
      const families = !batch ? [] : batch === homeFamilyStats ? entry.rows : guideFamilyRows(batch, data.id, section.id, entry.teams);
      const allows = (board: Team) => canShowBoard(section, board) &&
        (!entry.matches || entry.matches.some(match => match.board.id === board.id));
      function ownerOverride(board: Team) {
        if (!useOwnerOverrides) return;
        const key = `${section.id}:${board.id}`;
        const record = homeOverrides.get(key);
        if (record?.override !== "pin" && record?.override !== "include") return;
        if (webSelections.has(key)) return record;
        // A native landing board can be a formation even if the share route calls it a phase.
        if (!(launchTransition && record.launchEntry) && guideBoardKind(section, board, entry.teams[0]) === "过渡" &&
            !entry.rows.some(row => row.stat.landingTeamId === board.id)) return;
        return record;
      }

      const routes = families.flatMap<HomeSelection>(({ stat, team: anchor, boards }) => {
        if (isHero !== Boolean(stat.heroAugment) || !canShowBoard(section, anchor) ||
            boards.some(board => board.id === stat.landingTeamId && !canShowBoard(section, board))) return [];
        const eligible = boards.filter(board => allows(board) && families.filter(row =>
          row.boards.some(option => option.id === board.id)).length === 1);
        const team = eligible.filter(board => ownerOverride(board)?.override === "pin")
          .sort((a, b) => (ownerOverride(a)?.pinOrder ?? 0) - (ownerOverride(b)?.pinOrder ?? 0))[0] ??
          eligible.find(board => ownerOverride(board)?.override === "include") ??
          eligible.find(board => {
            const status = decisions.get(`${section.id}:${board.id}`)?.status;
            return status === "recommended" || status === "conditional";
          }) ?? eligible[0];
        if (!team) return [];
        const context = homeRouteContext(entry, team);
        if (!context) return [];
        const override = ownerOverride(team);
        const rating = { ...stat, teamId: team.id, carryId: stat.carryIds[0] };
        const upgradeTeam = context.group === "fast8" && stat.landingTeamId === team.id && eligible.includes(anchor) &&
          usedPopulation(anchor.pieces) > usedPopulation(team.pieces) ? anchor : undefined;
        return [{ entry, team, rating, familyId: String(stat.clusterId), ...context,
          override: override?.override, pinOrder: override?.pinOrder, launchOrder: openingOrder?.get(team.id), upgradeTeam }];
      });

      if (useOwnerOverrides) for (const team of entry.teams) {
        const override = ownerOverride(team);
        if (!override || !allows(team) || routes.some(route => route.team.id === team.id)) continue;
        const context = homeRouteContext(entry, team);
        if (!context) continue;
        const rating = { sectionId: section.id, teamId: team.id, name: boardTitle(section, team) };
        routes.push({ entry, team, rating, familyId: team.id, ...context, override: override.override,
          pinOrder: override.pinOrder, launchOrder: openingOrder?.get(team.id) });
      }
      return routes;
    });
  }

  const currentHomeEvidence = currentRecommendationEvidence(homeFamilyStats, season.id, patch, recommendations?.reviewedRollingPatch);
  // Choose the batch independently of a visitor's search or filters.
  const currentHomeCandidates = recommended || showingTrends
    ? homeRouteCandidates(currentHomeEvidence ? homeFamilyStats : undefined, homeEntries, true) : [];
  const currentHomeRoutes = selectRecommendationRoutes(currentHomeCandidates);
  const currentHomeReady = currentHomeEvidence || currentHomeRoutes.length > 0;
  const recommendationSnapshot = currentHomeReady ? (currentHomeEvidence ? homeFamilyStats : undefined)
    : previousDeadline !== undefined ? previousFamilyStats : undefined;
  const filteredHome = Boolean(cost || style);
  const homeCandidates = !equipmentQuery && recommended
    ? currentHomeReady && !filteredHome ? currentHomeCandidates
      : homeRouteCandidates(recommendationSnapshot, filteredHome ? candidatesFor(homeEntries) : homeEntries, currentHomeReady)
    : [];
  const homeSelections = homeCandidates === currentHomeCandidates ? currentHomeRoutes : selectRecommendationRoutes(homeCandidates);
  const recommendationCards: RecommendationCard[] = homeSelections.map(({ entry, exact, team, group, rating, strategy, decision, upgradeTeam, familyId }) => {
    const { section, data } = entry;
    const notes = readingNotes(section, team, data);
    const primary = entry.teams[0]?.id === team.id;
    const [original, short] = shortOpenings[guideTitleWithoutPlaystyle(section.title, entry.playstyle)] ?? [];
    const advice = decision?.status === "recommended" || decision?.status === "conditional" ? decision.note : undefined;
    const authoredOpening = displayOpening(notes.opening);
    const opening = advice ?? (primary && authoredOpening.trim() === original ? short : homeOpening(authoredOpening, rating.name));
    const roles = notes.roles;
    const roster = guideRoster(team, data, roles);
    const lineup: RecommendationCard["avatars"] = roster.map(({ unit, role }) => ({
      unit, role: role === "主输出" || role === "主C" ? "主C" : role === "主坦" ? "主坦" : undefined,
    }));
    const population = usedPopulation(team.pieces);
    const oceanGraves = section.id === GUIDE_SECTION_IDS.oceanGraves;
    const preferred = recommendationSecondaryCarries.get(section.id);
    const usePreferred = Boolean(preferred && (!oceanGraves || team.id === preferred.boardId ||
      entry.rows.some(row => row.boards.some(board => board.id === team.id) && row.boards.some(board => board.id === preferred.boardId))));
    const currentSecondary = roster.find(({ unit, role }) => usePreferred && preferred ? unit.id === preferred.unitId : role === "副C")?.unit;
    const laterBoard = usePreferred && preferred && !currentSecondary ? entry.teams.find(board =>
      board.id === preferred.boardId && board.pieces.some(piece => piece.unitId === preferred.unitId)) : undefined;
    const secondaryUnit = currentSecondary ?? (laterBoard ? data.units.find(unit => unit.id === preferred?.unitId) : undefined);
    const laterPopulation = laterBoard && usedPopulation(laterBoard.pieces);
    const secondary: RecommendationCard["avatars"][number] | undefined = secondaryUnit && {
      unit: secondaryUnit,
      role: "副C",
      context: laterBoard && {
        label: laterPopulation && laterPopulation > population ? laterPopulation + "人口" : "变阵",
        title: guideBoardName(laterBoard),
      },
    };
    const sampledCarry = lineup.find(({ unit }) => unit.id === rating.carryId);
    const carry = lineup.find(({ role }) => role === "主C") ?? (sampledCarry && { ...sampledCarry, role: "主C" as const });
    const tank = lineup.find(({ role }) => role === "主坦");
    const ordered = [carry, tank, secondary, ...lineup].filter(avatar => avatar !== undefined);
    const avatars = ordered.filter(({ unit }, index) =>
      ordered.findIndex(entry => entry.unit.id === unit.id) === index
    ).slice(0, 3);
    const guide = guideRoute(section, entry.teams, team);
    const route = guide?.phases ?? [];
    const stages = new Map<string, { team: Team; label: string }>();
    for (const phase of route) {
      const board = phase.team;
      if (!board || board.id === team.id || usedPopulation(board.pieces) >= population || stages.has(board.id)) continue;
      if (!canShowBoard(section, board)) continue;
      if ((needle || cost) && !entry.matches?.some(match => match.board.id === board.id)) continue;
      stages.set(board.id, { team: board, label: phase.label });
    }
    const upgradeChoice = upgradeTeam && guide?.choices?.find(choice => choice.team?.id === upgradeTeam.id);
    if (upgradeChoice?.team) stages.set(upgradeChoice.team.id, { team: upgradeChoice.team, label: upgradeChoice.label });
    for (const alternative of homeCandidates) {
      const board = alternative.team;
      if (alternative.entry.section.id !== section.id || alternative.group !== group ||
          alternative.familyId === familyId || board.id === team.id || stages.has(board.id) ||
          !homeRecommendationEligible(alternative.rating)) continue;
      const secondaryId = readingNotes(section, board, data).roles.find(role => role.label === "副C")?.units[0];
      const secondaryName = secondaryId && data.units.find(unit => unit.id === secondaryId)?.name;
      const name = guideBoardName(board).replace(/^[一二三四五六七八九十\d]+(?:级|人口)\s*·\s*/, "");
      const label = secondaryName && !name.includes(secondaryName) ? `${name} · ${secondaryName}` : name;
      stages.set(board.id, { team: board, label });
    }
    const conditions = guideEquipmentConditions(section, entry.teams, data, patch?.build, team)?.rows
      .filter(condition => team.conditions || condition.featured || condition.kind === "required");
    return {
      group, rating, team, title: guideTitleWithoutPlaystyle(displayGuideName(rating.name), entry.playstyle), avatars, opening: displayOpening(opening),
      manualBadge: decision?.manualBadge,
      manualReason: !hasHomeRecommendationSample(rating) && decision ? displayTraitNames(decision.note) : undefined,
      timing: decision?.timing && displayTraitNames(decision.timing),
      upgrade: decision?.upgrade && displayTraitNames(decision.upgrade),
      entryTeamId: !oceanGraves && !webSelections.has(`${section.id}:${team.id}`) && (!needle || exact?.namedFamily)
        ? rerollEntryTeamId(section, team.id) : undefined,
      stages: [...stages.values()],
      conditions,
      strategy,
      badgeLabel: route.find(phase => phase.team?.id === team.id)?.label || population + " 人口",
      hit: exact?.unitLabel ?? exact?.context,
    };
  });
  const showReview = !launchTransition && (Boolean(needle) || (view === "regular" && sort === "category"));
  const reviewFor = (sectionId: string, teamId?: string) => {
    const record = showReview && teamId ? decisions.get(`${sectionId}:${teamId}`) : undefined;
    return record?.status === "review" ? record : undefined;
  };
  function conditionLink(sectionId: string, boardId: string, cardId: string) {
    return guideLink(sectionId, boardId, homeGuideReturn(home, cardId, boardId)) + "#" + guideConditionsAnchor;
  }
  const displayedCount = recommended ? recommendationCards.length : statsRows.length + coreStatsRows.length + results.length;
  const crossTab = needle && !displayedCount && !equipmentQuery
    ? candidatesFor(library[isHeroList ? "regular" : "hero-augments"], conditions, false)
      .sort((a,b) => b.rank - a.rank).slice(0, 8)
    : [];
  const lookupGroups = lookup.phase === "ready" && conditions.length === 1 && !selectedGear ? lookup.result.groups.filter(group =>
    group.kind === "gear" || (!equipmentQuery && group.kind !== "guides") || (!recommended &&
    !hasFilter && !displayedCount && !crossTab.length && !equipmentQuery)) : [];
  const showLookup = Boolean(lookupGroups.length || selectedGear);
  const searching = conditions.length === 1 && !displayedCount && !crossTab.length && lookup.phase === "loading";

  useEffect(() => {
    if (!quickView) {
      reportedQuickView.current = null;
      return;
    }
    if (quickView.home !== home) return;
    const token = `${quickView.home}\0${quickView.key}`;
    if (reportedQuickView.current === token) return;
    if (!document.getElementById(quickView.previewId)) return;
    reportedQuickView.current = token;
    trackGuideView({ guideId: quickView.guideId, mode: "quick_view", source: quickView.source });
  }, [quickView, home]);

  const inlineLookupPending = Boolean(
    lookupTerm &&
    conditions.length === 1 &&
    (lookup.phase === "loading" ||
      (lookup.phase === "ready" && (lookup.refreshing || lookup.result.query !== lookupTerm))),
  );
  const inlineLookupErrored = Boolean(
    lookupTerm && conditions.length === 1 && !displayedCount && !crossTab.length && lookup.phase === "error",
  );
  const inlineHasResults = displayedCount > 0 || crossTab.length > 0 || showLookup;

  useEffect(() => {
    if (showingTrends || !needle) {
      if (!needle) lastInlineSearchKey.current = null;
      return;
    }
    if (homeComposing || homeComposingRef.current || searching || inlineLookupPending || inlineLookupErrored) return;
    if (restoredInlineQuery.current === needle) {
      lastInlineSearchKey.current = `${view}\0${needle}\0${scope}\0${exclude ?? ""}`;
      return;
    }
    const queryKey = `${view}\0${needle}\0${scope}\0${exclude ?? ""}`;
    if (lastInlineSearchKey.current === queryKey) return;
    const timer = window.setTimeout(() => {
      if (homeComposingRef.current || lastInlineSearchKey.current === queryKey) return;
      lastInlineSearchKey.current = queryKey;
      trackSearchResults(inlineHasResults ? "has_results" : "no_results", "home_inline");
    }, 260);
    return () => window.clearTimeout(timer);
  }, [showingTrends, needle, homeComposing, searching, inlineLookupPending, inlineLookupErrored, inlineHasResults, view, scope, exclude]);
  const relaxed = !displayedCount && !crossTab.length && conditions.length>1 ? conditions.flatMap((term,i)=>{
    const rest=conditions.filter((_,j)=>j!==i);
    return candidatesFor(availableFacets,rest).length ? [{term,rest}] : [];
  }) : [];
  const archiveLink = <a className="text-link" href={homeLink("regular", nextSelections("regular"), archiveSort)}
    onClick={event => changeView(event, "regular", archiveSort)}>查看全部攻略</a>;
  const emptyState = <div className="empty-inline quick-condition-empty"><p>{needle || hasFilter
    ? recommended ? "没有匹配的本版推荐" : ranked ? "当前条件下没有可对照的体系战绩" : "没有匹配的阵容"
    : ranked ? "暂无可对照的体系战绩" : "暂无已发布阵容"}</p>
    {relaxed.map(({term,rest})=><button key={term} type="button" onClick={()=>changeQuery(rest.join(" + "))}>去掉「{term}」再找</button>)}
    {hasFilter && <button type="button" onClick={()=>choose(emptyFilters)}>清除筛选</button>}
    {recommended && archiveLink}
  </div>;

  const renderCards = (group: Card[], groupName: string, eager: boolean) => {
    const CardTitle = groupName ? "h3" : "h2";
    return <div className="guide-list reader-list">{group.map(({ section, data, team, teams, matches, augment, siblings, family, rating: matchedRating, core, routeName, clusterId, rows, routes, cardId, tier, context: searchContext, unitLabel, facet, curated }, index) => {
      const playstyle = guidePlaystyle(section, team);
      const primary = teams[0];
      const kind = team && guideBoardKind(section, team, primary);
      const alternative = team && team.id !== primary.id;
      const review = reviewFor(section.id, team?.id);
      const belowCoreDisplay = !!core && core.games <= 500;
      const hiddenOnLaunch = launchTransition && (review || belowCoreDisplay || (matchedRating && !hasHomeRecommendationSample(matchedRating)));
      const rating = hiddenOnLaunch || (review && !core) ? undefined : matchedRating;
      const showMean = rating && (core ? !belowCoreDisplay : recommendationTier(rating) !== "review");
      const meanLabel = core ? placementEvidenceKind(core) === "lineup" ? "名单共现均名" : "核心均名" : "均名";
      const ratingSource = core ? [core.patch, core.window, core.sampleScope].filter(Boolean).join(" · ")
        : familyStats.patch + " · 近 " + familyStats.days + " 天体系样本";
      const formation = rating && !core && team ? formationCoreResult(team, data.id, patch?.build) : undefined;
      const useGuideEntry = team && (!needle || matches.some(match => match.board.id === team.id && match.namedFamily));
      const link = guideLink(section.id, (useGuideEntry ? rerollEntryTeamId(section, team.id) : undefined) ?? team?.id,
        homeGuideReturn(home, cardId, team?.id));
      const notes = team && readingNotes(section, team, data);
      const roles = notes?.roles ?? [];
      const decision = !needle && team ? decisions.get(`${section.id}:${team.id}`) : undefined;
      const entryNote = decision && (decision.status === "recommended" || decision.status === "conditional" ||
        (formation && decision.status === "avoid")) ? decision.note : undefined;
      const fixedOpening = team && fixedRecommendations.get(team.id)?.note;
      const intro = displayOpening(searchContext ?? entryNote ?? fixedOpening ?? notes?.opening ?? "");
      const guideName = guideTitleWithoutPlaystyle(section.title, playstyle);
      const [sourceIntro, compactIntro] = shortOpenings[guideName] ?? [];
      const title = guideTitleWithoutPlaystyle(routeName ?? (team ? boardTitle(section, team) : section.title), playstyle);
      const opening = entryNote && !searchContext ? intro
        : !searchContext && !alternative && intro.trim() === sourceIntro ? compactIntro : homeOpening(intro, title, augment);
      const stage = section.reroll?.stages.find(entry => entry.teamId === team?.id);
      const chaseTargets = team ? guideRerollTargets(section.id, team.id, stage?.parentTeamId) : [];
      const namedRoute = routes?.length && matches.some(match => match.board.id === team?.id && match.namedFamily);
      const hasRoutes = routes && routes.length > 1;
      const landingBoard = routes?.find(board => board.id === section.reroll?.entryTeamId);
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
      const previewId = "guide-quick-view-" + cardId;
      const previewKey = cardId + ":" + team?.id;
      const expanded = quickView?.key === previewKey && quickView.home === home;
      const fullOpening = notes && displayOpening(notes.opening.trim());
      const quickNote = expanded && opening && fullOpening?.startsWith(opening)
        ? homeOpening(fullOpening.slice(opening.length).trim(), title)
        : undefined;
      const strategy = team && guideStrategyLabel(section, team, data, primary);
      const heroCondition = augment && curated?.rows.find(row => row.id === augment.id);
      const conditionId = heroCondition ? `${titleId}-condition` : undefined;
      const detailsIds = [rating?.games ? ratingId : "", review ? reviewId : "", conditionId].filter(Boolean).join(" ") || undefined;
      const repeatedFormation = !needle && !alternative && repeatsFormationLabel(playstyle, strategy);
      const rollStyle = !augment && strategy && /^[1-5](?:\/[1-5])?费慢搜$/.test(strategy) ? strategy : undefined;
      const styleTag = playstyle ?? rollStyle;
      const strategyDetail = strategy && (!styleTag || guideStyleKey(strategy) !== guideStyleKey(styleTag)) ? strategy : undefined;
      const description = augment ? [augment.round, augment.label || augment.name, strategyDetail].filter(Boolean).join(" · ")
        : alternative && team?.id !== family?.lead.team.id && kind && !title.includes(kind)
          ? [kind, strategyDetail].filter(Boolean).join(" · ") : repeatedFormation ? "" : strategyDetail ?? (styleTag ? "" : facet.style);
      const variants = [...new Map([{ section, teams, matches, rows }, ...siblings].flatMap(entry => {
        const options = needle ? entry.matches.filter(match => match.kind === "board").map(match => match.board) : entry.teams;
        return options.filter(option => {
          if (option.id === team?.id || routes?.some(board => board.id === option.id) || (!needle && guideBoardKind(entry.section, option, entry.teams[0]) === "过渡")) return false;
          const owners = hasCurrentStats && !isHeroList ? entry.rows.filter(row => row.boards.some(board => board.id === option.id)) : [];
          return owners.length ? owners.some(row => row.stat.clusterId === clusterId) : cardId === section.id;
        })
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
      const conditionBoard = (curated?.guideWide ? team?.id : undefined) ?? curated?.board?.id;
      const cardConditions = curated && (team?.id === conditionBoard || routes?.some(board => board.id === conditionBoard))
        ? curated.rows.filter(row => row.featured || row.recipient) : [];
      const conditionHeading = curated?.guideWide || cardConditions.some(row => row.recipient) ? "定阵条件" : "顶级条件";
      return <article key={cardId} className={"guide-result" + (expanded ? " is-quick-open" : "")} id={"guide-card-" + cardId}>
        <a className="guide-result-main" href={link} data-home-board={team?.id} aria-labelledby={titleId} aria-describedby={detailsIds}>
          <div className="guide-title-row">
            <div className="guide-card-heading">
              <CardTitle className="guide-result-title" id={titleId}>{title}</CardTitle>
              {styleTag && <span className="guide-playstyle-tag" title="打法">{styleTag}</span>}
              {review && <span className="guide-review-badge" id={reviewId} title={review.note}>待复核</span>}
              {!review && needle && !isHeroList && tier !== "recommended" && <span className="guide-playstyle-tag">{tierLabels[tier]}</span>}
            </div>
            {rating && <span id={ratingId} className={"guide-placement " + (!showMean ? "limited" : rating.mean < 4.5 ? "strong" : rating.mean > 4.5 ? "weak" : "middle")}
              title={[ratingSource, showMean && rating.topFourRate !== undefined && ("前四 " + (100 * rating.topFourRate).toFixed(1) + "%"),
                showMean && rating.winRate !== undefined && ("吃鸡 " + (100 * rating.winRate).toFixed(1) + "%")].filter(Boolean).join(" · ")}>
              {showMean && <><span>{meanLabel}</span> <strong>{core ? rating.mean.toFixed(2) : formatRecommendationMean(rating.mean)}</strong></>}
              <small>{rating.games.toLocaleString("zh-CN")} 场{core ? " · 少量样本" : formation ? " · 跨人口样本" : ""}</small>
            </span>}
          </div>
          {description && <small className="guide-result-meta" id={conditionId}>
            {heroCondition && augment ? <span className="guide-hero-condition">
              <GuideConditionIcon condition={heroCondition} size={22} />
              <strong className="guide-hero-condition-name">{heroCondition.name}</strong>
              <span className="guide-hero-condition-round">{augment.round}</span>
              {strategyDetail && <span>{strategyDetail}</span>}
            </span> : description}
          </small>}
          {formation && <small className="guide-result-meta">
            {formation.label} <b>{formation.mean.toFixed(2)}</b> · {formation.games.toLocaleString("zh-CN")} 场
          </small>}
          {gearMatches.length > 0 && <small className="guide-result-meta">带 {gearMatches.map(item => item.name).join("、")}</small>}
          {opening && <p>{opening}</p>}
          {needle && searchDetails && <small className="guide-result-meta">{displayTraitNames(searchDetails)}</small>}
        </a>
        {cardConditions.length > 0 && conditionBoard && <div className="guide-featured-conditions" aria-label={conditionHeading}>
          <span>{conditionHeading}</span>{cardConditions.map(condition => <a key={condition.id}
            href={conditionLink(section.id, conditionBoard, cardId)} data-home-board={conditionBoard}>
            <GuideConditionIcon condition={condition} size={19} />{guideConditionName(condition)}
          </a>)}
        </div>}
        {team && <>
          <GuideCardBoard team={team} data={data} roles={roles} chaseTargets={chaseTargets}
            eager={eager && index === 0} title={title} controls={previewId} expanded={expanded} strategy={strategy} onToggle={() => {
              const card = document.getElementById("guide-card-" + cardId);
              if (card) quickAnchor.current = { card, top: card.getBoundingClientRect().top };
              setQuickView(expanded ? undefined : {
                key: previewKey,
                home,
                guideId: section.id,
                previewId,
                source: needle ? "site_search" : recommended ? "home_rec" : "guide_list",
              });
            }} />
          {expanded && <GuideQuickView id={previewId} team={team} data={data} roles={roles}
            note={quickNote}
            href={guideLink(section.id, team.id, homeGuideReturn(home, cardId, team.id))} />}
        </>}
        {routes && routes.length > 1 && <nav className="guide-lineup-routes" aria-label={section.title + "的棋盘"}>
          {routes.map(board => {
            const routeReview = board.id !== team?.id && reviewFor(section.id, board.id);
            const level = usedPopulation(board.pieces);
            let role = guideBoardKind(section, board, primary);
            if (landingBoard?.id === board.id) role = "主阵";
            else if (landingBoard && board.id === primary.id && level > usedPopulation(landingBoard.pieces)) role = "上限";
            return <a key={board.id} data-home-board={board.id}
              href={guideLink(section.id, board.id, homeGuideReturn(home, cardId, board.id))}>
              <span>{level} 级{role}</span>
              {guideBoardName(board).split("·").at(-1)?.trim()}
              {routeReview && <span className="guide-review-badge" title={routeReview.note}>待复核</span>}
            </a>;
          })}
        </nav>}
        {augment && isHeroList ? variantLinks : variantLinks &&
          <details className="guide-family-fold" data-home-fold={"family-" + cardId} key={"variants-" + query} open={needle ? true : undefined}>
            <summary>变阵（{variants.length}）</summary>
            {variantLinks}
          </details>}
      </article>;
    })}</div>;
  };

  const filterChips = [
    ...(category ? [{ id: "category", text: category, remove: () => choose({ category: "" }) }] : []),
    ...(cost ? [{ id: "cost", text: cost + " 费主C", remove: () => choose({ cost: 0 }) }] : []),
  ];
  const closeFilters = () => {
    setFiltersOpen(false);
    filterPanel.current?.querySelector("summary")?.focus();
  };

  const trendModel = showingTrends && trends && {
    ...trends,
    tracks: trends.tracks.map(track => ({
      ...track,
      href: guideFromTrends(track.href, home),
      recommended: track.recommended && currentHomeRoutes.some(route => track.recommendedKey === route.familyId),
    })),
    discoveries: trends.discoveries.map(discovery => ({ ...discovery, href: guideFromTrends(discovery.href, home) })),
  };

  function handleLibraryClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link) return;
    const href = link.getAttribute("href");
    const guideId = extractPublicGuideIdFromHref(href);

    if (needle) {
      const searchResultSelector = "a[data-search-result], a[data-home-search-result], a.guide-result-main, a.home-patch-card-link";
      if (link.matches(searchResultSelector)) {
        const allLinks = Array.from(libraryRoot.current?.querySelectorAll<HTMLAnchorElement>(searchResultSelector) ?? []);
        const idx = allLinks.indexOf(link);
        const resultType = link.getAttribute("data-search-result-type") || href || "other";
        trackSearchResultOpen({
          resultType,
          positionOneBased: idx >= 0 ? idx + 1 : 1,
          surface: "home_inline",
        });
      }
      if (guideId) rememberGuideEntry(guideId, "site_search");
      return;
    }

    if (guideId) {
      rememberGuideEntry(guideId, recommended ? "home_rec" : "guide_list");
    }
  }

  const introTitle = preview?.introTitle ?? ownerHome?.introTitle;
  const introText = preview?.intro ?? ownerHome?.intro;
  const intro = (introTitle || introText || ownerEditor.editing) && <section className="owner-home-intro" aria-label="首页介绍">
    <div className="owner-page-anchor" data-owner-selected={ownerEditor.active?.kind === "intro" || undefined}>
      <h2>{introTitle || "首页介绍"}</h2>
      {ownerEditor.editing && <OwnerInlineEdit label="编辑首页介绍" onClick={() => ownerEditor.open("intro")} />}
    </div>
    {introText && <p>{introText}</p>}
  </section>;
  const homeOrder = preview?.blocks ?? ownerHome?.blocks ?? homeContentBlocks;
  const recommendationChoices = ownerEditor.active?.kind === "recommendations"
    ? homeEntries.flatMap(({ section, teams }) => teams.map(team => ({
      sectionId: section.id, teamId: team.id, label: section.title + " · " + guideBoardName(team),
    }))) : [];
  return <div ref={libraryRoot} className="home-guide-library" data-archive={view === "regular" && !recommended || undefined} data-trends={showingTrends || undefined} onClickCapture={handleLibraryClickCapture}>
    {ownerEditor.available ? <div className="owner-home-banner"><HomeGuideBanner patch={patch} /><OwnerEditFlag editor={ownerEditor} /></div>
      : <HomeGuideBanner patch={patch} />}
    <OwnerEditBar editor={ownerEditor} />
    <OwnerPageDrawer editor={ownerEditor} kind="home" scope={patch?.label ?? "首页"} choices={recommendationChoices} />
    {fromItem && <a className="text-link guide-gear-return" href={fromItem}>返回装备图鉴</a>}
    <div className="home-browse-controls">
      <div className="guide-order-row">
        <nav className="guide-library-tabs home-patch-tabs" aria-label="阵容分栏">
          <a href={homeLink("regular", nextSelections("regular"), "recommended")}
            aria-current={recommendationTab ? "page" : undefined} onClick={event => changeView(event, "regular", "recommended")}>本版推荐</a>
          <a href={homeLink("regular", nextSelections("regular"), archiveSort)}
            aria-current={view === "regular" && !recommendationTab ? "page" : undefined} onClick={event => changeView(event, "regular", archiveSort)}>全部攻略</a>
          {heroSections.length > 0 && <a href={homeLink("hero-augments", nextSelections("hero-augments"), sort)}
            aria-current={view === "hero-augments" ? "page" : undefined} onClick={event => changeView(event, "hero-augments")}>英雄强化</a>}
          {(!launchTransition || trends) && <a href={homeLink("comp-trends", emptyFilters, sort)} aria-current={showingTrends ? "page" : undefined}
            onClick={event => changeView(event, "comp-trends")}>阵容趋势</a>}
        </nav>
        {recommendationTab && ownerEditor.editing && <div className="owner-page-anchor"
          data-owner-selected={ownerEditor.active?.kind === "recommendations" && !ownerEditor.active?.entry || undefined}>
          <OwnerInlineEdit label="管理本版推荐" onClick={() => ownerEditor.open("recommendations")} />
        </div>}
      </div>
      {!showingTrends && <div className="filters guide-filters" data-inline-style={styles.size ? true : undefined}>
        <div className="guide-search-field" data-equipment={selectedGear ? true : undefined}>
          {!selectedGear && <Search className="home-search-icon" size={16} aria-hidden />}
          {selectedGear && <button className="home-gear-chip" type="button" aria-label={"移除" + selectedGear.name}
            onClick={() => {
              changeQuery(extraGearTerms.trim());
              setExclude(undefined);
              searchInput.current?.focus();
            }}>
            {selectedGear.image && <img src={selectedGear.image} alt="" width={21} height={21} />}
            <span className="home-gear-chip-label">{selectedGear.name}</span><X size={12} aria-hidden />
          </button>}
          <input ref={searchInput} type="search" aria-label="搜索阵容" placeholder={selectedGear ? "再搜棋子、装备" : "搜阵容、棋子"}
            title="多个条件用 +，如 凯尔主C + 羊刀" maxLength={selectedGear ? Math.max(0, 60 - lookupTerm.length - 3) : 60}
            value={selectedGear ? extraGearTerms : query}
            onCompositionStart={() => { homeComposingRef.current = true; setHomeComposing(true); }}
            onCompositionEnd={() => { homeComposingRef.current = false; setHomeComposing(false); }}
            onChange={event => {
              const value = event.target.value;
              changeQuery(selectedGear ? lookupTerm + (value ? " + " + value : "") : value);
            }} />
          {query && !selectedGear && <button type="button" className="guide-search-clear" aria-label="清空搜索" onClick={clearQuery}>×</button>}
        </div>
        {styles.size > 0 && <label className="home-style-select">
          <span aria-hidden>打法</span>
          <select aria-label="按打法筛选" value={styleKey} onChange={event => choose({ style: styles.get(event.target.value) ?? "" })}>
            <option value="">全部</option>{Array.from(styles, ([key, tag]) => <option key={key} value={key}>{tag}</option>)}
          </select>
        </label>}
        {(showTiers || costs.length > 0) && <details ref={filterPanel} className="guide-extra-filters" open={filtersOpen}>
          <summary onClick={event => { event.preventDefault(); setFiltersOpen(!filtersOpen); }}>
            筛选{filterChips.length > 0 && <span className="guide-filter-number">{filterChips.length}</span>}
          </summary>
          <div className="guide-filter-sheet" role="region" aria-label="筛选阵容">
            {showTiers && <label className="guide-filter-field">
              <span>推荐档位</span>
              <select aria-label="按推荐档位筛选" value={category} onChange={event => choose({ category: event.target.value })}>
                <option value="">全部</option>
                {tierOrder.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>}
            {costs.length > 0 && <label className="guide-filter-field">
              <span>主C费用</span>
              <select aria-label="按主C费用筛选" value={cost} onChange={event => choose({ cost: Number(event.target.value) })}>
                <option value={0}>全部</option>{costs.map(gold => <option key={gold} value={gold}>{gold} 费</option>)}
              </select>
            </label>}
            <footer className="guide-filter-sheet-actions">
              <button type="button" onClick={closeFilters}>收起</button>
            </footer>
          </div>
          <div className="guide-filter-backdrop" onClick={closeFilters} aria-hidden="true" />
        </details>}
        {(hasUnitQuery || filterChips.length > 0 || (!ranked && needle && displayedCount > 0) || (!selectedGear && conditions.length>1)) && <div className="guide-filter-chips">
          {!selectedGear && conditions.length>1 && <div className="quick-conditions" aria-label="查询条件">{conditions.map(term=><button type="button" key={term} className="guide-filter-chip" aria-label={"移除"+term} onClick={()=>changeQuery(conditions.filter(t=>t!==term).join(" + "))}>{term} <span aria-hidden>×</span></button>)}</div>}
          {hasUnitQuery && <div className="guide-search-scope" role="group" aria-label="棋子检索范围">
            {(["all","carry","unit"] as const).map((option, index) => <button key={option} type="button" aria-pressed={intent.scope === option}
              onClick={() => { setQuery(intent.text); setScope(option); }}>{["全部","主C","含棋子"][index]}</button>)}
          </div>}
          {filterChips.map(chip => <button key={chip.id} type="button" className="guide-filter-chip" aria-label={"移除" + chip.text} onClick={chip.remove}>{chip.text} <span aria-hidden="true">×</span></button>)}
          {!ranked && displayedCount > 0 && <span className="guide-result-count" aria-hidden="true">{displayedCount} 套阵容</span>}
          {filterChips.length + Number(Boolean(styleKey)) > 1 && <button type="button" className="guide-filter-clear" onClick={() => choose(emptyFilters)}>清除筛选</button>}
        </div>}
      </div>}
    </div>
    {showingTrends && <>
      {trendModel ? <CompTrendPanel model={trendModel} /> : <p className="site-lookup-message">阵容趋势数据待更新</p>}
      {artifactRanking}
    </>}
    {!showingTrends && <>
    {view === "regular" && !recommendationTab && <div className="home-archive-tools">
      <nav className="home-archive-switch" aria-label="全部攻略视图">
          {archiveViews.filter(([option]) => !launchTransition || option === "category" || (hasCurrentStats && familyStats.rows.length > 0) || hasCurrentCore).map(([option, label]) =>
          <a key={option} href={homeLink("regular", active, option)} aria-current={sort === option ? "true" : undefined}
            onClick={event => changeView(event, "regular", option)}>{label}</a>)}
      </nav>
      {ranked && (statsRows.length > 0 || coreStatsRows.length > 0) && <label className="home-stats-sort">
        <span className="sr-only">战绩排序</span>
        <select value={performance.metric + "-" + performance.direction} onChange={event => {
          const [metric, direction] = event.target.value.split("-");
          setPerformance(familySortFrom(parseGuideFilters({ sort: "mean", metric, direction })));
        }}>
          {(Object.entries(guideStatsMetricLabels) as [GuideFamilyMetric, string][]).map(([metric, label]) =>
            (metric === "mean" ? ["asc", "desc"] : ["desc", "asc"]).map(direction =>
              <option key={metric + "-" + direction} value={metric + "-" + direction}>排序 · {label} {direction === "asc" ? "↑" : "↓"}</option>
            )
          )}
        </select>
      </label>}
      {ranked && (statsRows.length > 0 || coreStatsRows.length > 0) && <div className="guide-rank-meta">
        <span>{statsRows.length} 套体系{coreStatsRows.length > 0 && ` · ${coreStatsRows.length} 套核心`}{familyWindowNote && <> · {familyWindowNote}</>}</span>
        <details className="guide-rank-source"><summary>数据来源</summary>
          <div><a href={familyStats.sourceUrl} target="_blank" rel="noreferrer">MetaTFT</a> · {familyStats.queue} {familyStats.patch} · 近 {familyStats.days} 天
            {familyStats.updatedAt && <p>更新于 <time dateTime={familyStats.updatedAt} title="北京时间">{beijingDateTime.format(new Date(familyStats.updatedAt))}</time></p>}
          </div>
        </details>
      </div>}
      {groupLinks.length > 0 && <nav className="home-group-jumps" aria-label="跳到阵容分组">
        {groupLinks.map(group => <a key={group.id} href={"#" + group.id}>{group.label}</a>)}
      </nav>}
    </div>}
    {displayedCount > 0 && <span role="status" className="sr-only">{displayedCount} 套阵容</span>}
    {selectedGear && <HomeGearSearch hit={selectedGear} season={season} examples={gearExamples}
      filtered={hasFilter || conditions.length > 1} refreshing={lookup.phase === "ready" && lookup.refreshing} onToggleExclusion={setExclude} />}
    {(crossTab.length > 0 || lookupGroups.length > 0) && <div className="home-search-results" data-with-reference={crossTab.length > 0 && lookupGroups.length > 0 || undefined}>
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
      {lookupGroups.length > 0 && <SiteSearchResults search={lookup} filter={group => lookupGroups.includes(group)} onToggleExclusion={setExclude} quiet />}
    </div>}
    {searching && <p className="site-lookup-message" role="status">正在搜索…</p>}

    {recommended && <>
      {homeOrder[0] === "intro" && intro}
      <PatchRecommendationList stats={!launchTransition || homeSelections.some(route => hasHomeRecommendationSample(route.rating)) ? recommendationSnapshot : undefined}
        cards={recommendationCards} home={home} quietUnrated={launchTransition}
        previousBuild={!!recommendationSnapshot && !currentHomeReady}
        selectedEntry={ownerEditor.active?.kind === "recommendations" ? ownerEditor.active.entry : undefined}
        onEdit={ownerEditor.editing ? (sectionId, teamId) => ownerEditor.open("recommendations", sectionId + ":" + teamId) : undefined} />
      {homeOrder[0] === "recommendations" && intro}
      {!displayedCount && !crossTab.length && !showLookup && !searching && (needle || hasFilter ? emptyState : <div className="empty-inline">{!launchTransition && <p>{currentHomeEvidence ? "暂无符合条件的本版推荐" : "本版体系数据待更新"}</p>}
        {archiveLink}
      </div>)}
    </>}

    {ranked && statsRows.length > 0 && <>
      <GuideStatsTable rows={statsRows} metric={performance.metric} direction={performance.direction} onSort={metric => setPerformance(previous => ({
        metric, direction: previous.metric === metric ? (previous.direction === "asc" ? "desc" : "asc") : metric === "mean" ? "asc" : "desc",
      }))} />
    </>}
    {ranked && coreStatsRows.length > 0 && <section className="guide-core-stats-section" aria-labelledby="guide-core-stats-heading">
      <header className="guide-core-stats-head">
        <h3 id="guide-core-stats-heading">核心样本对照（{coreStatsRows.length} 套）</h3>
        <p>暂无 MetaTFT 原生体系聚类，按当期核心棋子同场统计，不计算全盘出场率。</p>
      </header>
      <GuideStatsTable rows={coreStatsRows} metric={coreSortMetric} direction={coreSortDirection} onSort={metric => setPerformance(previous => ({
        metric, direction: previous.metric === metric ? (previous.direction === "asc" ? "desc" : "asc") : metric === "mean" ? "asc" : "desc",
      }))} />
    </section>}
    {ranked && groups.length > 0 && <header className="guide-core-stats-head"><h3>匹配的攻略</h3></header>}
    {!recommended && groups.length > 0 && <div className="guide-sections">{groups.map(([name, entries], index) => {
      const preview = archiveReady ? entries : entries.slice(0, index === 0 ? 6 : 2);
      const cards = renderCards(preview, name, index === 0);
      const textLinks = !archiveReady && preview.length < entries.length && <noscript>
        <ul>{entries.slice(preview.length).map(({ section, team, cardId }) => <li key={cardId}>
          <a href={guideLink(section.id, team?.id, homeGuideReturn(home, cardId, team?.id))}>{section.title}</a>
        </li>)}</ul>
      </noscript>;
      const headingId = "guide-group-" + index;
      return name ? <section key={name} id={name === backupCategory ? "backup-guides" : undefined} className="guide-section"
        aria-labelledby={headingId} data-hero-conditions={heroConditionGroup || undefined}>
        <h2 id={headingId}>{name}</h2>
        {index === 0 && groupLinks.length > 0 && <details className="home-group-jump-mobile"><summary>跳到分组</summary><div>
          {groupLinks.map(group => <a key={group.id} href={"#" + group.id} onClick={event => { event.currentTarget.closest("details")!.open = false; }}>{group.label}</a>)}
        </div></details>}
        {cards}
        {textLinks}
      </section> : <Fragment key={name}>{cards}{textLinks}</Fragment>;
    })}</div>}
    {!recommended && !displayedCount && !searching && !crossTab.length && (ranked || !showLookup) && emptyState}
    </>}
  </div>;
}
