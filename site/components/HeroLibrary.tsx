"use client";
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { itemMap, season, unitMap, traitMap } from "@/data";
import liveStats from "@/data/hero-stats.json";
import type { WearerSnapshot } from "@/data/item-wearers";
import { commonHeroItems, type HeroItemSample, type HeroItemSource } from "@/domain/hero-insights";
import type { Unit } from "@/domain/types";
import { hasUnlockCondition, unlockText } from "@/domain/unlocks";
import { guideLink } from "@/domain/guide-reading";
import { heroGuideGroups, type HeroGuideIndex } from "@/domain/hero-guides";
import { heroAugmentForUnit } from "@/domain/hero-augments";
import {
  UnitBrowser,
  UnitDetails,
  matchesUnitFilter,
  type BrowserFilters,
} from "./UnitBrowser";
import { HeroBattleSummary, HeroCommonItems, HeroResultsTable, HeroStatSources, type HeroSort, type HeroStats } from "./HeroPerformance";
import { HeroLoadout } from "./HeroLoadout";
import { HeroProfile } from "./HeroProfile";
import { StatPeriodSelect, useStatArchive, useStatPeriod } from "./StatPeriod";
import { usePageReturnView } from "./usePageReturnView";

const lockedCount = season.units.filter(hasUnlockCondition).length;
const release = season.unlockRelease;
const updatedDate = release?.date ?? season.sourceDate;
const libraryList = ".hero-results-scroll, .unit-list-scroll, .trait-grid-scroll";
const scrollPanels = [".library-columns .hero-results-scroll", ".library-columns .unit-list-scroll", ".library-columns .sheet-body", ".library-columns .trait-grid-scroll"];
const views = [
  { id: "list", label: "列表" },
  { id: "grid", label: "羁绊网" },
  { id: "stats", label: "数据榜" },
] as const;
const heroQueryChange = "hero-library-query-change";
type LibraryPosition = { page: number; list: number; left?: number; href: string; unit: string };

function subscribeToHeroQuery(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(heroQueryChange, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(heroQueryChange, onChange);
  };
}

const browserQuery = () => window.location.search.slice(1);

function libraryHref(params: URLSearchParams) {
  return "/heroes" + (params.size ? "?" + params.toString() : "");
}

function HeroUnlockList({ units, onSelect }: { units: Unit[]; onSelect: (id: string) => void }) {
  const costs = [...new Set(units.map(unit => unit.cost))].sort((a, b) => a - b);
  return <div className="unit-list-scroll hero-unlock-list" aria-label="英雄解锁条件">
    {costs.map(cost => <section key={cost} className={`hero-unlock-group cost-${cost}`}>
      <h2>{cost} 费</h2>
      <ul>
        {units.filter(unit => unit.cost === cost).map(unit => <li key={unit.id}>
          <button type="button" onClick={() => onSelect(unit.id)}
            aria-label={unit.name} aria-describedby={`unlock-${unit.id}`}>
            {unit.image && <img src={unit.image} alt="" width={42} height={42} loading="lazy" />}
            <span><strong>{unit.name}</strong><span id={`unlock-${unit.id}`}>{unlockText(unit)}</span></span>
          </button>
        </li>)}
      </ul>
    </section>)}
  </div>;
}

export function HeroLibrary({ guides, commonItems, gearSource: liveGearSource }: {
  guides: HeroGuideIndex | null;
  commonItems: Record<string, HeroItemSample[]>;
  gearSource: HeroItemSource;
}) {
  const pageParams = useSearchParams();
  const queryString = useSyncExternalStore(subscribeToHeroQuery, browserQuery, () => pageParams.toString());
  const params = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const unit = unitMap.get(params.get("unit") ?? "");
  const statistics = params.get("tab") === "stats";
  const { period, selectPeriod } = useStatPeriod();
  const heroArchive = useStatArchive<HeroStats>(unit || statistics ? period : undefined, "heroes");
  const gearArchive = useStatArchive<{ standard: WearerSnapshot }>(unit ? period : undefined, "equipment");
  const archivedGear = gearArchive.data?.standard;
  const previousItems = useMemo(() => archivedGear ?
    commonHeroItems(itemMap, archivedGear.items, archivedGear.minGames) : undefined, [archivedGear]);
  const stats = period ? heroArchive.data : liveStats;
  const gearSource = period ? archivedGear : liveGearSource;
  const availableItems = period ? previousItems : commonItems;
  const selector = <StatPeriodSelect period={period} onChange={selectPeriod} />;
  const dataControls = <div className="hero-profile-stat-period">
    {selector}<HeroStatSources stats={stats} gearSource={gearSource} />
  </div>;
  const library = useRef<HTMLDivElement>(null);
  const [sort, setSort] = usePageReturnView<HeroSort>("heroLibraryVisit", { field: "mean", order: "ascending" }, scrollPanels);
  const traitId = params.get("trait") ?? "";
  const traitIds = useMemo(() => traitMap.has(traitId) ? [traitId] : [], [traitId]);
  const filters: BrowserFilters = {
    query: params.get("q") ?? "",
    cost: Number(params.get("cost")) || 0,
    traitIds,
    unlock: params.get("unlock") === "1",
    view: !statistics && params.get("view") === "grid" ? "grid" : "cards",
  };
  const matrix = filters.view === "grid";
  const focused = Boolean(unit && !matrix);
  const update = (patch: Record<string, string>, openProfile = false) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const href = libraryHref(next);
    if (openProfile) window.history.pushState({ ...window.history.state, heroProfileEntry: true, heroLibraryVisit: null }, "", href);
    else window.history.replaceState(window.history.state, "", href);
    window.dispatchEvent(new Event(heroQueryChange));
  };
  useLayoutEffect(() => {
    if (focused) {
      if (history.state?.heroProfileEntry && !history.state?.heroLibraryVisit) {
        window.scrollTo({ top: 0, behavior: "instant" });
        document.querySelector<HTMLElement>(".hero-profile h1")?.focus({ preventScroll: true });
      }
      return;
    }
    const saved: LibraryPosition | undefined = history.state?.heroLibraryPosition;
    if (!saved || saved.href !== location.href) return;
    function restorePosition(position: LibraryPosition) {
      const list = library.current?.querySelector(libraryList);
      const name = unitMap.get(position.unit)?.name;
      Array.from(list?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find(button => name && (button.getAttribute("aria-label")?.startsWith(name) || button.textContent?.trim() === name))
        ?.focus({ preventScroll: true });
      list?.scrollTo({ top: position.list, left: position.left });
      window.scrollTo({ top: position.page, behavior: "instant" });
    }
    restorePosition(saved);
    const frame = requestAnimationFrame(() => restorePosition(saved));
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  const related = (unit && guides?.[unit.id]) || [];
  const augment = unit && heroAugmentForUnit(unit.id, season.id);
  const enhanced = !!augment && params.get("augment") === augment.id;
  const returnHref = libraryHref(new URLSearchParams(params.toString()));

  const editorHref = unit ? "/editor?" + new URLSearchParams({ unit:unit.id, from:returnHref }) : undefined;
  const heroArchiveNotice = <p className="stat-period-note" role="status">
    {heroArchive.status === "error" ? "这批英雄数据暂不可读。" : "正在读取这批英雄数据…"}
  </p>;
  const gearArchiveNotice = <p className="stat-period-note" role="status">
    {gearArchive.status === "error" ? "这批装备数据暂不可读。" : "正在读取这批装备数据…"}
  </p>;

  if (unit && focused) return <HeroProfile key={unit.id} unit={unit}
    guides={guides === null ? null : related} returnHref={returnHref} editorHref={editorHref}
    statsContent={<>
      <div className="hero-profile-performance">
        <HeroBattleSummary unit={unit} stats={stats} controls={dataControls} unavailable={heroArchiveNotice} />
      </div>
      {gearSource ? <HeroLoadout key={period?.id ?? "current"} unit={unit} items={availableItems?.[unit.id] ?? []}
        gearSource={gearSource} period={period?.id} /> : gearArchiveNotice}
    </>}
    backLabel={statistics ? "返回数据榜" : "返回英雄图鉴"}
    onBack={() => {
      if (history.state?.heroProfileEntry) history.back();
      else update({ unit:"", augment:"" });
    }}
    augmentId={params.get("augment") ?? undefined}
    onAugmentChange={id => update({ augment:id })}
    onSelect={id => update({ unit:id, augment:"" })} />;

  const dossier = unit && <>
    <UnitDetails unit={unit} jumpToTraits augmented={enhanced} onAugmentedChange={value => update({ augment: value ? augment?.id ?? "" : "" })}
      action={!enhanced && <>
      <HeroBattleSummary unit={unit} stats={stats} controls={dataControls} unavailable={heroArchiveNotice} />
      {gearSource && <HeroCommonItems unit={unit} items={availableItems?.[unit.id] ?? []}
        gearSource={gearSource} period={period?.id} />}
      {!gearSource && gearArchiveNotice}
      {(related.length > 0 || guides === null) && <section className="related-guides hero-guide-groups" aria-label="相关阵容">
        <h3>相关阵容</h3>
        {heroGuideGroups.map(group => {
          const rows = related.filter(guide => guide.group === group);
          return rows.length > 0 && <div key={group}>
            <h4>{group}</h4>
            <ul>{rows.map(guide => <li key={guide.id}>
              <a href={guideLink(guide.id, guide.boardId, returnHref)}>{guide.title}</a>
              <small>{[guide.role, guide.board !== guide.title && guide.board].filter(Boolean).join(" · ")}</small>
            </li>)}</ul>
          </div>;
        })}
        {guides === null && <p className="muted">相关阵容暂不可用</p>}
      </section>}
      <div className="detail-actions hero-reading-links">
        <a className="button secondary" href={"/?" + new URLSearchParams({ q: unit.name, scope: "unit", sort: "category" })}>用此英雄找阵容</a>
      </div>
      {editorHref && <div className="detail-actions hero-reading-links">
        <a className="button secondary" href={editorHref}>
          用此英雄构建阵容
        </a>
      </div>}
    </>} />
  </>;
  const activeView = statistics ? "stats" : matrix ? "grid" : "list";
  function openProfile(id: string) {
    const list = library.current?.querySelector(libraryList);
    const position: LibraryPosition = {
      page: window.scrollY,
      list: list?.scrollTop ?? 0,
      left: list?.scrollLeft,
      href: location.href,
      unit: id,
    };
    window.history.replaceState({ ...window.history.state, heroLibraryPosition: position }, "");
    update(matrix ? { unit: id, view: "", augment: id === unit?.id && enhanced ? augment?.id ?? "" : "" } : { unit: id, augment: "" }, true);
  }
  const select = (id: string) => {
    if (matrix) update({ unit: id === unit?.id ? "" : id, augment: "" });
    else openProfile(id);
  };
  const profileParams = new URLSearchParams(params.toString());
  profileParams.delete("view");
  const profileAction = unit && matrix ? <a className="matrix-dialog-profile" href={libraryHref(profileParams)}
    onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      openProfile(unit.id);
    }}>完整资料<ArrowUpRight size={14} aria-hidden /></a> : undefined;

  return (
    <>
      <div className={`page-heading library-heading hero-catalog-heading${statistics ? " is-statistics" : ""}`}>
        <h1>英雄图鉴</h1>
        <nav className="hero-view-nav" aria-label="英雄视图">
          {views.map(({ id, label }) => {
            const destination = new URLSearchParams(params.toString());
            destination.delete("view");
            destination.delete("tab");
            if (id !== "grid") destination.delete("unit");
            destination.delete("augment");
            if (id === "grid") destination.set("view", "grid");
            if (id === "stats") destination.set("tab", "stats");
            return <a key={id} href={libraryHref(destination)} aria-current={id === activeView ? "page" : undefined}>{label}</a>;
          })}
        </nav>
        {statistics ? selector : <div className="hero-catalog-meta">
          {release
            ? <a href={release.guideUrl} target="_blank" rel="noreferrer" title={`${lockedCount} 种形态需解锁，资料日期 ${updatedDate}`}>解锁说明 <ArrowUpRight size={13} aria-hidden /></a>
            : <span>{lockedCount} 种需解锁</span>}
        </div>}
      </div>
      <div ref={library} className={`library-columns is-index${matrix ? " is-matrix" : ""}${statistics ? " is-statistics" : ""}`}>
        <UnitBrowser
          selectedId={unit?.id ?? null}
          onSelect={select}
          filters={filters}
          showViewSwitch={false}
          explainSearch
          matrixDetails={dossier}
          matrixReading={{ trait: traitIds[0], tier: Number(params.get("tier")) || undefined, profileAction }}
          renderList={statistics ? units => stats ?
            <HeroResultsTable stats={stats} units={units} selectedId={unit?.id} onSelect={select} sort={sort} setSort={setSort} /> :
            heroArchiveNotice : filters.unlock && !matrix ? units => <HeroUnlockList units={units} onSelect={select} /> : undefined}
          onFiltersChange={value => update({
            ...(unit && value.view === "cards" && !matchesUnitFilter(value)(unit) && { unit: "" }),
            q: value.query,
            cost: value.cost ? String(value.cost) : "",
            trait: value.traitIds[0] ?? "",
            ...(value.traitIds[0] !== traitIds[0] && { tier: "" }),
            unlock: value.unlock ? "1" : "",
            ...(!statistics && { view: value.view === "grid" ? "grid" : "" }),
          })}
        />
      </div>
    </>
  );
}
