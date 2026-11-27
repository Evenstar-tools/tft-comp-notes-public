"use client";
import {
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  memo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Lock,
  MousePointer2,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Tooltip } from "radix-ui";
import { season, traitMap, unitLabel, unitMap } from "@/data";
import type { Trait, Unit } from "@/domain/types";
import { TraitBadge } from "./Glyphs";
import { HeroArtwork } from "./HeroArtwork";
import { HeroSearchMatches } from "./HeroSearchMatches";
import { UnitCard } from "./UnitCard";
import { hasUnlockCondition, unlockText } from "@/domain/unlocks";
import { unitSearchNames, unitTraitSearchNames } from "@/domain/unit-search.mjs";
import { sameEdition } from "@/domain/version-updates";
import { TraitGrid, type MatrixReading } from "./TraitGrid";
import { MatrixTraitDetails } from "./MatrixDetails";
import { heroAugmentForUnit } from "@/domain/hero-augments";
import { HeroSkill } from "./HeroAugmentDetails";

export type BrowserFilters = { query: string; cost: number; traitIds: string[]; unlock: boolean; view: "cards" | "grid" };
const COSTS = [1, 2, 3, 4, 5, 7];
const EMPTY = new Set<string>();
// 搜索文本只拼一次：中文名、英文名、拼音 / 简称、羁绊名。
const HAYSTACK = new Map(
  season.units.map((unit) => [
    unit.id,
    [
      ...unitSearchNames(unit),
      ...unit.traits.flatMap(id => {
        const trait = traitMap.get(id);
        return trait ? unitTraitSearchNames(trait) : [];
      }),
    ]
      .join("\n")
      .toLowerCase(),
  ]),
);
const TRAIT_OPTIONS = [...season.traits].sort((a, b) =>
  a.name.localeCompare(b.name, "zh-CN"),
);

export function matchesUnitFilter({ query, cost, traitIds, unlock }: Omit<BrowserFilters, "view">) {
  const needle = query.toLowerCase().trim();
  return (unit: Unit) =>
    (!cost || unit.cost === cost) &&
    (!traitIds.length || traitIds.some(id => unit.traits.includes(id))) &&
    (!unlock || hasUnlockCondition(unit)) &&
    (!needle || HAYSTACK.get(unit.id)!.includes(needle));
}

export const UnitBrowser = memo(function UnitBrowser({
  selectedId,
  onSelect,
  onAdd,
  inTeam = EMPTY,
  initialView = "cards",
  filters,
  onFiltersChange,
  multiTrait = false,
  showViewSwitch = true,
  starsInTeam,
  matrixDetails,
  matrixDetailLabel,
  matrixReading,
  renderList,
  explainSearch = false,
  onTrayPick,
  onTrayDetails,
  relatedTrayUnitIds,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd?: (id: string) => void;
  inTeam?: Set<string>;
  initialView?: "cards" | "grid";
  filters?: BrowserFilters;
  onFiltersChange?: (filters: BrowserFilters) => void;
  multiTrait?: boolean;
  showViewSwitch?: boolean;
  starsInTeam?: ReadonlyMap<string, number>;
  matrixDetails: ReactNode;
  matrixDetailLabel?: string;
  matrixReading?: MatrixReading;
  renderList?: (units: Unit[]) => ReactNode;
  explainSearch?: boolean;
  onTrayPick?: (id: string) => void;
  onTrayDetails?: (id: string) => void;
  relatedTrayUnitIds?: ReadonlySet<string>;
}) {
  const [local, setLocal] = useState<BrowserFilters>({ query: "", cost: 0, traitIds: [], unlock: false, view: initialView });
  const [showFilters, setShowFilters] = useState(false);
  const current = filters ?? local;
  const { query, cost, traitIds, unlock, view } = current;
  const listScroll = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const traitSelect = useRef<HTMLSelectElement>(null);
  const filterToggle = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (multiTrait && listScroll.current) listScroll.current.scrollTop = 0;
  }, [multiTrait, traitIds]);
  const change = (patch: Partial<BrowserFilters>) => onFiltersChange ? onFiltersChange({ ...current, ...patch }) : setLocal(prev => ({ ...prev, ...patch }));
  const setQuery = (query: string) => change({ query });
  const setCost = (cost: number) => change({ cost });
  function chooseTrait(id: string) {
    if (!multiTrait) {
      change({ traitIds: id ? [id] : [] });
    } else if (id && !traitIds.includes(id)) {
      change({ traitIds: [...traitIds, id] });
    }
  }
  const setUnlock = (unlock: boolean) => change({ unlock });
  const setView = (view: "cards" | "grid") => change({ view });
  const deferredQuery = useDeferredValue(query);
  const units = useMemo(
    () => season.units.filter(matchesUnitFilter({ query: deferredQuery, cost, traitIds, unlock })),
    [deferredQuery, cost, traitIds, unlock],
  );
  const showTraitMatches = multiTrait && view === "cards" && traitIds.length > 1;
  const traitMatches = useMemo(() => {
    if (!showTraitMatches) return;
    const selectedTraits = traitIds.map(id => traitMap.get(id)).filter(trait => !!trait);
    const byUnit = new Map<string, Trait[]>();
    const counts = new Map<string, number>();
    for (const unit of units) {
      const matches = selectedTraits.filter(trait => unit.traits.includes(trait.id));
      byUnit.set(unit.id, matches);
      for (const trait of matches) counts.set(trait.id, (counts.get(trait.id) ?? 0) + 1);
    }
    return { byUnit, counts };
  }, [showTraitMatches, traitIds, units]);
  const groups = useMemo(
    () =>
      COSTS.map((value) => ({
        cost: value,
        units: units.filter((unit) => unit.cost === value),
      })).filter((group) => group.units.length),
    [units],
  );
  const activeFilterCount = Number(!!cost) + traitIds.length + Number(unlock);
  const filtered = !!query || activeFilterCount > 0;
  const hasTraitChips = multiTrait && traitIds.length > 0;
  const reset = () => change({ query: "", cost: 0, traitIds: [], unlock: false });
  const noCatalogResults = explainSearch && view === "cards" && !units.length && query === deferredQuery;
  return (
    <section className={"unit-browser" + (view === "grid" ? " is-grid-browser" : "") + (showTraitMatches ? " has-trait-matches" : "")} aria-label="英雄选择">
      <div className="browser-controls">
      <div className="browser-toolbar">
        <label className="search-field">
          <Search size={15} aria-hidden />
          <input
            ref={searchInput}
            type="search"
            aria-label="搜索英雄"
            placeholder={explainSearch ? "搜英雄、外号、拼音或羁绊" : "英雄 / 外号 / 拼音 / 羁绊"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="search-count" aria-live="polite">
            {explainSearch ? (filtered && units.length + " 个结果") : units.length + "/" + season.units.length}
          </span>
        </label>
        {showViewSwitch && !renderList && <div className="segmented" role="group" aria-label="英雄视图">
          <button
            type="button"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
          >
            <List size={14} aria-hidden />
            列表
          </button>
          <button
            type="button"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={14} aria-hidden />
            羁绊网
          </button>
        </div>}
        {view === "grid" && <button ref={filterToggle} type="button" className="matrix-filter-toggle" aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal size={14} aria-hidden />筛选{activeFilterCount ? " · " + activeFilterCount : ""}
        </button>}
      </div>
      <div className={"browser-filters" + (showFilters ? " is-expanded" : "") + (hasTraitChips ? " has-trait-filters" : "")}>
        <div className="chip-group" role="group" aria-label="按费用筛选">
          {COSTS.map((value) => (
            <button
              type="button"
              key={value}
              className={`chip cost-chip cost-${value}`}
              aria-pressed={cost === value}
              onClick={() => setCost(cost === value ? 0 : value)}
            >
              <i aria-hidden />
              {value} 费
            </button>
          ))}
        </div>
        <span className="select-field">
          <select
            aria-label="筛选羁绊"
            ref={traitSelect}
            value={multiTrait ? "" : traitIds[0] ?? ""}
            onChange={(event) => chooseTrait(event.target.value)}
          >
            <option value="">{hasTraitChips ? "添加羁绊" : "全部羁绊"}</option>
            {TRAIT_OPTIONS.map((entry) => (
              <option key={entry.id} value={entry.id} disabled={multiTrait && traitIds.includes(entry.id)}>
                {entry.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden />
        </span>
        <button
          type="button"
          className="chip"
          aria-pressed={unlock}
          onClick={() => setUnlock(!unlock)}
        >
          <Lock size={12} aria-hidden />
          需解锁
        </button>
        {hasTraitChips && (
          <div className="browser-trait-filters" role="group" aria-label="已选羁绊">
            {traitIds.map(id => {
              const trait = traitMap.get(id);
              if (!trait) return null;
              const count = traitMatches && (traitMatches.counts.get(id) ?? 0);
              return (
                <button type="button" key={id} className="browser-trait-chip"
                  aria-label={`移除${trait.name}筛选`}
                  aria-description={count === undefined ? undefined : `${count} 名英雄符合当前筛选`}
                  onClick={event => {
                    if (event.detail === 0) {
                      const chip = event.currentTarget;
                      const neighbor = chip.nextElementSibling ?? chip.previousElementSibling;
                      const focus = neighbor instanceof HTMLButtonElement ? neighbor : traitSelect.current;
                      const visibleFocus = focus?.getClientRects().length ? focus : filterToggle.current;
                      visibleFocus?.focus({ preventScroll: true });
                    }
                    change({ traitIds: traitIds.filter(value => value !== id) });
                  }}>
                  <TraitBadge trait={trait} size={14} tone="active" />
                  {trait.name}
                  {count !== undefined && <span className="browser-trait-count" aria-hidden="true">{count}</span>}
                  <X size={12} aria-hidden />
                </button>
              );
            })}
          </div>
        )}
        <span className="filters-spacer" />
        {filtered && !noCatalogResults && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={reset}
          >
            重置筛选
          </button>
        )}
        {selectedId && view !== "grid" && (
          <button
            type="button"
            className="btn ghost sm browser-clear-selection"
            onClick={() => onSelect(selectedId)}
          >
            <X size={13} aria-hidden />
            清除选择
          </button>
        )}
      </div>
      </div>
      {explainSearch && <HeroSearchMatches query={deferredQuery} units={units} />}
      <Tooltip.Provider delayDuration={260}>
      <div className="browser-body">
        {view === "grid" ? (
          <TraitGrid
            units={units}
            selectedId={selectedId}
            onSelect={onSelect}
            onAdd={onAdd}
            inTeam={inTeam}
            starsInTeam={starsInTeam}
            details={matrixDetails}
            detailLabel={matrixDetailLabel}
            reading={matrixReading}
            onClearSelection={() => { if (selectedId) onSelect(selectedId); }}
            filtered={filtered}
            onClearFilters={reset}
          />
        ) : noCatalogResults ? (
          <div className="hero-empty-results">
            <p role="status">没有匹配的英雄</p>
            {query && <button type="button" className="btn secondary" onClick={() => {
              setQuery("");
              searchInput.current?.focus();
            }}>清空搜索</button>}
            {activeFilterCount > 0 && <button type="button" className="btn secondary" onClick={() => {
              reset();
              searchInput.current?.focus();
            }}>重置筛选</button>}
          </div>
        ) : renderList ? renderList(units) : groups.length ? (
          <div className={"unit-list-scroll" + (onTrayPick ? " editor-unit-tray" : "")}
            data-compact-results={explainSearch && filtered && units.length <= 12 || undefined} ref={listScroll}>
            {groups.map((group) => {
              const cards = group.units.map(unit => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  selected={selectedId === unit.id}
                  dimmed={relatedTrayUnitIds && !relatedTrayUnitIds.has(unit.id)}
                  inTeam={inTeam.has(unit.id)}
                  matchedTraits={traitMatches?.byUnit.get(unit.id)}
                  onSelect={onTrayPick ?? onSelect}
                  onAdd={onAdd}
                  singleAction={!!onTrayPick}
                  onUnlock={onTrayDetails}
                />
              ));
              return <section className="cost-group" key={group.cost}>
                <h3 className={`cost-heading cost-${group.cost}`}>
                  <i aria-hidden />
                  {group.cost} 费<span>{group.units.length}</span>
                </h3>
                <div className="unit-list">
                  {!onAdd && cards.length > 1 ? <>
                    {cards.slice(0, -2)}
                    <div className="unit-list-tail">{cards.slice(-2)}</div>
                  </> : cards}
                </div>
              </section>;
            })}
          </div>
        ) : (
          <p className="empty-inline">没有匹配的英雄</p>
        )}
      </div>
      </Tooltip.Provider>
    </section>
  );
});

/**
 * 英雄详情。用户要求：技能与羁绊分开、默认展开；
 * 没有任何来源提供解锁条件时，连同标题整栏隐藏。
 */
export function UnitDetails({
  unit,
  onAdd,
  inTeam,
  traits,
  seasonId,
  action,
  overview,
  jumpToTraits = false,
  embedded = false,
  defaultAugmented,
  augmented,
  onAugmentedChange,
  showAugmentGear,
  wornItems,
}: {
  unit?: Unit;
  onAdd?: () => void;
  inTeam?: boolean;
  traits?: Trait[];
  seasonId?: string;
  action?: ReactNode;
  overview?: ReactNode;
  jumpToTraits?: boolean;
  embedded?: boolean;
  defaultAugmented?: boolean;
  augmented?: boolean;
  onAugmentedChange?: (value: boolean) => void;
  showAugmentGear?: boolean;
  wornItems?: string[];
}) {
  if (!unit)
    return (
      <div className="selection-empty">
        <MousePointer2 size={28} strokeWidth={1.5} aria-hidden />
        <strong>选择一名英雄</strong>
      </div>
    );
  const useCurrentTraits = seasonId ? sameEdition(seasonId, season.id) : !traits;
  const detailTraits = useCurrentTraits ? traitMap : new Map((traits ?? []).map(trait => [trait.id, trait]));
  const condition = unlockText(unit);
  const { base, form } = unitLabel(unit);
  const augment = heroAugmentForUnit(unit.id, seasonId ?? season.id);
  return (
    <article className={`unit-details cost-${unit.cost}`}>
      {!embedded && <header className="detail-hero">
        <HeroArtwork unit={unit} className="detail-splash" />
        <div className="detail-identity">
          <img
            className="detail-portrait"
            src={unit.image}
            alt=""
            width={96}
            height={96}
          decoding="async" />
          <div>
            <h2>
              {base}
              {form && <small>{form}</small>}
            </h2>
            <p>
              <span className="cost-pill">{unit.cost} 费</span>
              <span>{unit.nameEn}</span>
            </p>
          </div>
        </div>
        {unit.splashImage && (
          <a
            className="detail-art-link"
            href={unit.splashImage}
            target="_blank"
            rel="noreferrer"
            title="查看高清原画"
            aria-label="查看高清原画"
          >
            <ArrowUpRight size={14} aria-hidden />
          </a>
        )}
      </header>}
      {!embedded && <div className="trait-tags">
        {unit.traits.map((id) => {
          const trait = detailTraits.get(id);
          if (jumpToTraits && trait) {
            return <button key={id} type="button" className="trait-tag hero-trait-chip" aria-label={`查看${trait.name}羁绊`}
              onClick={event => {
                const target = event.currentTarget.closest(".unit-details")?.querySelector<HTMLElement>(`[data-detail-trait="${CSS.escape(id)}"]`);
                target?.scrollIntoView({ block: "start" });
                target?.focus({ preventScroll: true });
              }}>
              <TraitBadge trait={trait} size={16} />{trait.name}
            </button>;
          }
          return (
            <span key={id} className="trait-tag">
              <TraitBadge trait={trait} size={16} />
              {trait?.name ?? id}
            </span>
          );
        })}
      </div>}
      {onAdd && (
        <button type="button" className="btn secondary block" onClick={onAdd}>
          <Plus size={16} aria-hidden />
          {inTeam ? "再加一个到阵容" : "加入阵容"}
        </button>
      )}
      {overview}
      {condition && (
        <section className="detail-section">
          <h3>
            <Lock size={13} aria-hidden />
            解锁条件
          </h3>
          <div className="unlock-block">
            <p>{condition}</p>
            {(unit.unlock?.note || unit.sourceUnlock?.note) && <p className="meta">{unit.unlock?.note || unit.sourceUnlock?.note}</p>}
          </div>
        </section>
      )}
      <HeroSkill key={unit.id + String(defaultAugmented)} unit={augment ? unitMap.get(unit.id) ?? unit : unit}
        augment={augment}
        defaultAugmented={defaultAugmented} augmented={augmented} onAugmentedChange={onAugmentedChange}
        showGear={showAugmentGear} wornItems={wornItems} />
      {action}
      <section className="detail-section">
        <h3>羁绊</h3>
        {unit.traits.map((id) => {
          const trait = detailTraits.get(id);
          return (
            trait && (
              <div className="trait-effect" key={id} data-detail-trait={jumpToTraits ? id : undefined} tabIndex={jumpToTraits ? -1 : undefined}>
                <div className="trait-effect-head">
                  <TraitBadge trait={trait} size={18} />
                  <strong>{trait.name}</strong>
                  <span>{trait.thresholds.join(" · ")}{trait.countMode === "stars" && " 星"}</span>
                </div>
                {useCurrentTraits ? <MatrixTraitDetails trait={trait} compact showEmblem={false} /> : <p>{trait.description}</p>}
              </div>
            )
          );
        })}
      </section>
    </article>
  );
}

/**
 * 详情停靠区。桌面就是侧栏；手机（≤760px）有选中时变成贴底抽屉：
 * 收起时一行（名称 + 主动作），展开看完整内容。
 */
export function SelectionSheet({
  summary,
  action,
  onClose,
  children,
  defaultOpen = false,
  expandLabel = "查看资料",
  subject,
}: {
  /** 有选中时的一行摘要；没有选中传 undefined，手机端不显示抽屉。 */
  summary?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  defaultOpen?: boolean;
  expandLabel?: string;
  subject?: string;
}) {
  const active = !!summary;
  const [expansion, setExpansion] = useState({ active, open: defaultOpen });
  // Reset only when entering/leaving a selection; switching champions preserves
  // the reader's expanded/collapsed choice without an effect-driven second paint.
  if (expansion.active !== active) {
    setExpansion({ active, open: active && defaultOpen });
  }
  const open = active && expansion.open;
  return (
    <div
      className={`selection-sheet${active ? " has-selection" : ""}${open ? " is-open" : ""}`}
    >
      {active && (
        <div className="sheet-bar">
          <button
            type="button"
            className="sheet-summary"
            aria-expanded={open}
            aria-label={subject ? (open ? "收起" : "展开") + subject + "资料" : undefined}
            onClick={() => setExpansion({ active, open: !open })}
          >
            {summary}
            <b className="sheet-toggle-label">{open ? "收起" : expandLabel}</b>
            {open ? (
              <ChevronDown size={16} aria-hidden />
            ) : (
              <ChevronUp size={16} aria-hidden />
            )}
          </button>
          {action}
          {onClose && (
            <button
              type="button"
              className="btn ghost icon"
              aria-label={subject ? "关闭" + subject + "资料" : "清除选择"}
              onClick={onClose}
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
      )}
      <div className="sheet-body">{children}</div>
    </div>
  );
}
