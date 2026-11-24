"use client";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { itemMap, season, unitMap, unitLabel } from "@/data";
import emblemSnapshot from "@/data/emblem-stats.json";
import { itemReference, itemWearers, specialItemWearers, type WearerSnapshot } from "@/data/item-library";
import { guideLink } from "@/domain/guide-reading";
import { gearSampleMinimum } from "@/domain/gear-wearer";
import { compareGearWearerSamples, cookware, emblemMatches, filterEmblems, filterGear, gearFilters, gearGroups, gearHref, gearMatches, gearWearerStats, isCookRecipe, itemName, recipeParts, searchGear, selectableWearers,
  type GearFilters, type GearGroup, type GearOrder, type ItemGroup } from "@/domain/gear-library";
import { emblemItemId, type itemGuideOrigin } from "@/domain/links";
import { withStatPeriod } from "@/domain/stat-periods";
import type { Item } from "@/domain/types";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { ConditionalGear } from "./ConditionalGear";
import { ItemIcon } from "./ItemIcon";
import { usePageReturnView } from "./usePageReturnView";
import { WearerExclusion } from "./WearerExclusion";
import { GearCategoryEmpty, GearCategoryNav } from "./GearCategoryNav";
import { GearWearerSearch } from "./GearWearerSearch";
import { StatPeriodSelect, useStatArchive, useStatPeriod } from "./StatPeriod";

export type ItemGuideUse = { sectionId: string; teamId: string; title: string; boardName: string; isPrimary: boolean; unitId: string };
type GuideOrigin = NonNullable<ReturnType<typeof itemGuideOrigin>>;
type ItemBoardUse = { href: string; label: string; isPrimary: boolean; holders: Set<string>; sectionId: string; title: string };
type ReverseGearRow = { entry: Item; category: GearGroup; sample: ReturnType<typeof gearWearerStats>; rankedMinimum: number; rate?: number; trait: string };
type EquipmentStats = { standard: WearerSnapshot; special: WearerSnapshot };

const defaultItem = "TFT_Item_RapidFireCannon";
const rankedGroup = (view: ItemGroup) => view === "special" || view === "radiant";
const isReverseView = (view: ItemGroup, wearer: string) => !!wearer && view !== "component" && view !== "craft";
const defaultSelection = (view: ItemGroup, filters: GearFilters) =>
  rankedGroup(view) || isReverseView(view, filters.wearer) || filters.query.trim() ? "" : defaultItem;
const categoryNames: Record<string, string> = {
  component: "散件", completed: "成装", "team-size": "人口装", emblem: "转职纹章",
  artifact: "神器", support: "辅助装", radiant: "光明装",
};
const number = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const carryRateLabel = (rate: number) => rate > 0 && rate < 0.0005 ? "<0.1%" : percent.format(rate);
const dateLabel = (date: string) => date.replaceAll("-", ".");
const isGlossary = (line: string) => /^(?:灼烧|重伤|技能暴击|魔抗击碎|护甲击碎)[：:]/.test(line);
const currentEquipment: EquipmentStats = { standard: itemWearers, special: specialItemWearers };

function itemSampleMinimum(item: Item, snapshot: WearerSnapshot) {
  return gearSampleMinimum(item.category, /\bPBE\b/i.test(snapshot.version), snapshot.minGames);
}

function itemPerformance(item: Item, snapshot: WearerSnapshot) {
  const entry = snapshot.items[item.id];
  return entry && (entry.totalGames ?? 0) >= itemSampleMinimum(item, snapshot) ? entry : undefined;
}

function placementTone(mean: number | null | undefined, games: number, rankedMinimum: number) {
  if (mean == null || games < rankedMinimum) return;
  return mean < 4 ? "good" : mean >= 4.5 ? "weak" : undefined;
}

function periodGearHref(period: string | undefined, ...args: Parameters<typeof gearHref>) {
  const href = gearHref(...args);
  return args[0] === "emblems" ? href : withStatPeriod(href, period);
}

function itemGroup(item: Item | undefined): ItemGroup {
  if (!item) return "all";
  if (isCookRecipe(item)) return "craft";
  if (item.category === "artifact" || item.category === "support") return "special";
  if (item.category === "radiant") return "radiant";
  return item.category === "component" ? "component" : "completed";
}

function viewFor(view: string | null | undefined, id: string | undefined): ItemGroup {
  if (view && view !== "emblems" && Object.hasOwn(gearGroups, view)) return view as ItemGroup;
  const item = id ? itemMap.get(id) : undefined;
  const kind = itemGroup(item);
  return kind === "craft" || kind === "special" || kind === "radiant" ? kind : "all";
}

function specificItemFilters(item: Item, filters: GearFilters) {
  return gearMatches(item, filters.query) ? filters : { ...filters, query: "" };
}

export function ItemLibrary({ itemId, unitId, initialView, initialFilters, examples, origin, openBuilds }: {
  itemId?: string; unitId?: string; initialView?: string; initialFilters: GearFilters;
  examples: Record<string, ItemGuideUse[]>; origin?: GuideOrigin; openBuilds?: boolean;
}) {
  const initialGroup = viewFor(initialView, itemId);
  const [selected, setSelected] = useState(itemId && itemMap.has(itemId) ? itemId : defaultSelection(initialGroup, initialFilters));
  const [wearer, setWearer] = useState(unitId && unitMap.has(unitId) ? unitId : "");
  const [group, setGroup] = useState(initialGroup);
  const [filters, setFilters] = usePageReturnView("gearLibraryVisit", initialFilters);
  const { period, selectPeriod } = useStatPeriod();
  const archive = useStatArchive<EquipmentStats>(period, "equipment");
  const equipment = period ? archive.status === "ready" ? archive.data : undefined : currentEquipment;
  const specialStats = equipment?.special;
  const archiveMessage = period && !equipment && <p className="gear-empty gear-archive-status" role="status">
    {archive.status === "loading" ? "读取历史战绩…" : "历史战绩读取失败。"}
  </p>;
  const itemHref = (...args: Parameters<typeof gearHref>) => periodGearHref(period?.id, ...args);
  const { query, order, excluded } = filters;
  const [wearersOpen, setWearersOpen] = useState("");
  const reverseWearer = unitMap.get(filters.wearer);
  const reverse = isReverseView(group, filters.wearer);
  const ranking = rankedGroup(group) || reverse;
  const clicked = useRef<{ element: HTMLAnchorElement; top: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const { named, recipes } = searchGear(group, query);
  const visible = [...named, ...recipes.map(result => result.item)];
  const reverseRows = reverse ? visible.flatMap<ReverseGearRow>(entry => {
    if (!equipment) return [];
    const snapshot = equipment.special.items[entry.id] ? equipment.special : equipment.standard;
    const row = snapshot.items[entry.id]?.rows.find(sample => sample.unitId === filters.wearer);
    if (!row || entry.category === "component" || entry.category === "emblem") return [];
    const category = snapshot === equipment.standard ? "completed" : entry.category === "radiant" ? "radiant" : "special";
    const minGames = itemSampleMinimum(entry, snapshot);
    return [{ entry, category, sample: gearWearerStats(row, minGames), rankedMinimum: snapshot.minGames,
      rate: row.games >= minGames ? row.rate : undefined, trait: "" }];
  }) : [];
  if (reverse && group === "all" && !period) {
    for (const [trait, stats] of filterEmblems(query)) {
      const entry = itemMap.get(emblemItemId(trait));
      const holder = stats.holders.find(row => row.unitId === filters.wearer);
      if (entry && holder) reverseRows.push({ entry, category: "emblems", sample: holder, rankedMinimum: emblemSnapshot.minGames, trait });
    }
  }
  const hasWins = reverseRows.some(({ sample }) => sample.winRate != null);
  const hasRate = reverseRows.some(({ rate }) => rate != null);
  const shownOrder = reverse && order === "wins" && !hasWins ? "mean" : order;
  reverseRows.sort((a, b) => compareGearWearerSamples(a.sample, b.sample, shownOrder, 0));
  const reverseGroups: GearGroup[] = group === "all" ? ["completed", "special", "radiant", "emblems"] : [group];
  const item = visible.find(entry => entry.id === selected) ?? visible[0];
  useLayoutEffect(() => {
    setWearersOpen(history.state?.gearWearersOpen ?? "");
  }, []);
  useLayoutEffect(() => {
    const row = clicked.current;
    clicked.current = null;
    if (row?.element.isConnected) window.scrollBy({ top: row.element.getBoundingClientRect().top - row.top, behavior: "instant" });
  }, [selected]);
  useEffect(() => {
    if (!(rankedGroup(initialGroup) || isReverseView(initialGroup, initialFilters.wearer)) ||
      !itemId || history.state?.gearLibraryVisit?.url === location.href) return;
    const frame = requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(".gear-rank-entry[data-open], .gear-reverse-entry[data-open]");
      if (row && row.getBoundingClientRect().top > window.innerHeight / 2) row.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialFilters.wearer, initialGroup, itemId]);

  useEffect(() => {
    function restore() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("item") ?? "";
      const next = viewFor(params.get("view"), id);
      const unit = params.get("unit") ?? "";
      const visit = history.state?.gearLibraryVisit;
      const fromUrl = gearFilters(Object.fromEntries(params));
      const restored = visit?.url === location.href ? { ...fromUrl, ...visit.view, wearer: fromUrl.wearer } : fromUrl;
      setSelected(itemMap.has(id) ? id : defaultSelection(next, restored));
      setWearer(unitMap.has(unit) ? unit : "");
      setGroup(next);
      setWearersOpen(history.state?.gearWearersOpen ?? "");
      setFilters(restored);
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [setFilters]);

  useEffect(() => {
    const container = list.current;
    const active = container?.querySelector("[aria-current='true']");
    if (!container || !active) return;
    const bounds = container.getBoundingClientRect(), row = active.getBoundingClientRect();
    if (row.top < bounds.top || row.bottom > bounds.bottom)
      container.scrollTop += row.top - bounds.top;
  }, [item?.id, group]);

  function navigate(id: string, next: ItemGroup, nextFilters = filters, nextWearer = wearer) {
    setSelected(id);
    setWearer(nextWearer);
    const href = itemHref(next, nextFilters, { item: id, unit: nextWearer, from: origin?.href });
    if (window.location.pathname + window.location.search !== href)
      window.history.pushState(window.history.state, "", href);
  }

  function changeFilters(next: GearFilters) {
    const selectionChanged = next.wearer !== filters.wearer || (next.query !== query && (!ranking || reverse));
    const id = selectionChanged ? defaultSelection(group, next) : new URLSearchParams(window.location.search).get("item");
    if (selectionChanged) setSelected(id ?? "");
    setFilters(next);
    window.history.replaceState(window.history.state, "", itemHref(group, next, {
      item: id ?? undefined, unit: wearer, from: origin?.href,
    }));
  }

  function clearSearch() {
    changeFilters({ ...filters, query: "" });
    searchBox.current?.focus();
  }

  function rememberWearers(id: string) {
    history.replaceState({ ...history.state, gearWearersOpen: id }, "");
    setWearersOpen(id);
  }

  function openItem(event: MouseEvent<HTMLAnchorElement>, entry: Item, targetGroup?: ItemGroup, showDetail = true) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    let nextFilters = filters;
    if (targetGroup) {
      nextFilters = specificItemFilters(entry, filters);
      setFilters(nextFilters);
      setGroup(targetGroup);
    }
    navigate(entry.id, targetGroup ?? group, nextFilters);
    if (showDetail && window.matchMedia("(max-width: 760px)").matches) {
      requestAnimationFrame(() => detail.current?.scrollIntoView({ block: "nearest" }));
    }
  }

  function groupLink(target: GearGroup) {
    if (target === "emblems") return itemHref(target, filters);
    if (target === group) return itemHref(target, filters, { item: selected, unit: wearer, from: origin?.href });
    const matches = filterGear(target, query);
    const active = matches.find(entry => entry.id === selected);
    return itemHref(target, filters, { item: rankedGroup(target) || isReverseView(target, filters.wearer) ? "" : (active ?? matches[0])?.id,
      unit: wearer, from: origin?.href });
  }

  function switchGroup(event: MouseEvent<HTMLAnchorElement>, next: GearGroup) {
    if (next === "emblems" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (next === group) return;
    setGroup(next);
    navigate(new URL(event.currentTarget.href).searchParams.get("item") ?? "", next);
  }

  function openWearer(event: MouseEvent<HTMLAnchorElement>, id: string, unit: string) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (ranking) {
      rememberWearers(id);
      if (selected !== id)
        clicked.current = { element: event.currentTarget, top: event.currentTarget.getBoundingClientRect().top };
    }
    navigate(id, group, filters, unit);
  }

  function wearerLink(id: string, unit: string) {
    return itemHref(group, filters, { item: id, unit, from: origin?.href });
  }

  function renderIndex(entry: Item, matches?: Item[]) {
    const parts = group === "craft" ? recipeParts(entry) : matches;
    return <a key={entry.id} href={itemHref(group, filters, { item: entry.id, unit: wearer, from: origin?.href })}
      aria-current={entry.id === item?.id ? "true" : undefined} onClick={event => openItem(event, entry)}>
      <ItemIcon item={entry} size={32} />
      <span className="gear-list-name">{itemName(entry)}
        {!!parts?.length && <small>{parts.map((part, index) => <span key={index}>
          {index > 0 && (group === "craft" ? " + " : " · ")}
          {matches?.some(match => match.id === part.id)
            ? <strong className="gear-recipe-match">{itemName(part)}</strong> : itemName(part)}
        </span>)}</small>}
      </span>
    </a>;
  }

  const search = <GearWearerSearch filters={filters} onChange={changeFilters} inputRef={searchBox} label="搜装备、散件或英雄" />;
  const categoryProps = { current: group, filters, hrefFor: groupLink, onNavigate: switchGroup };
  const radiantCount = group === "all" ? reverseRows.filter(row => row.category === "radiant").length : 0;
  const rankOrders = <select aria-label="装备排行排序" value={shownOrder}
    onChange={event => changeFilters({ ...filters, order: event.target.value as GearOrder })}>
    <option value="mean">均名最低</option><option value="games">场数最多</option>
    {(!reverse || hasWins) && <option value="wins">登顶率最高</option>}
  </select>;
  return <>
    <div className={"page-heading gear-heading" + (ranking ? " gear-heading-ranked" : "")} data-wearer={reverse || undefined}>
      <h1>{group === "special" ? "神器与辅助装" : group === "radiant" ? "光明装" : "装备图鉴"}</h1>
      {origin && (ranking ? !visible.some(entry => entry.id === selected) : !item) &&
        <a className="text-link gear-origin-fallback" href={origin.href}>← 返回棋盘</a>}
      <div className="gear-catalog-tabs"><GearCategoryNav {...categoryProps} radiantCount={radiantCount} /></div>
      <div className="gear-release-controls">
        <StatPeriodSelect period={period} onChange={selectPeriod} />
      </div>
    </div>
    {reverse && reverseWearer ? <section className="gear-rank" data-wearer id="gear-rankings" aria-label={reverseWearer.name + "的" + gearGroups[group]}>
      <div className="gear-rank-tools" data-reverse>{search}{rankOrders}</div>
      {archiveMessage || (reverseRows.length ? <div className="gear-reverse" data-wins={hasWins || undefined} data-rate={hasRate || undefined}>
        <div className="gear-reverse-head" aria-hidden="true">
          <span>装备 <small>{reverseRows.length} 件</small></span>
          <span>均名</span>{hasWins && <span>登顶率</span>}
          {hasRate && <span className="gear-wearer-rate">携带率</span>}<span>场数</span>
        </div>
        <ul className="gear-rank-list">{reverseGroups.map(category => {
          const rows = reverseRows.filter(row => row.category === category);
          if (!rows.length) return null;
          return <Fragment key={category}>
          {group === "all" && <li className="gear-reverse-group">{gearGroups[category]}</li>}
          {rows.map(({ entry, sample, rankedMinimum, rate, trait }) => {
          const open = selected === entry.id;
          const name = itemName(entry);
          const displayName = category === "radiant" ? name.replace(/^光明版/, "") : name;
          const href = trait ? itemHref("emblems", filters, { trait })
            : itemHref(group, filters, { item: open ? "" : entry.id, unit: wearer, from: origin?.href });
          return <li className="gear-rank-entry gear-reverse-entry" key={entry.id} data-open={open || undefined}>
            <a className="gear-reverse-toggle" href={href} aria-expanded={trait ? undefined : open}
              onClick={event => {
                if (trait || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                clicked.current = { element: event.currentTarget, top: event.currentTarget.getBoundingClientRect().top };
                navigate(open ? "" : entry.id, group);
              }}>
              <span className="gear-rank-identity">
                <ItemIcon item={entry} size={34} />
                <span title={name}>{name !== displayName && <span className="sr-only">光明版</span>}{displayName}{entry.category === "support" && <small>辅助装</small>}</span>
                {trait ? <ArrowUpRight aria-hidden="true" size={14} /> : <ChevronDown aria-hidden="true" size={14} />}
              </span>
              <span className="gear-rank-number" data-tone={placementTone(sample.mean, sample.games, rankedMinimum)}>{sample.mean?.toFixed(2)}</span>
              {hasWins && <span className="gear-rank-number">{sample.winRate != null && percent.format(sample.winRate)}</span>}
              {hasRate && <span className="gear-rank-number gear-wearer-rate">{rate != null && carryRateLabel(rate)}</span>}
              <span className="gear-rank-number">{number.format(sample.games)}</span>
            </a>
            {open && <div className="gear-rank-detail">
              <ItemReading item={entry} wearer={reverseWearer.id} filters={filters} uses={examples[entry.id] ?? []} equipment={equipment} period={period?.id}
                onRecipe={openItem} onWearer={(event, unit) => openWearer(event, entry.id, unit)}
                wearerHref={unit => wearerLink(entry.id, unit)} returnHref={itemHref(group, filters, { item: entry.id, unit: wearer })}
                inRanking origin={origin} />
            </div>}
          </li>;
          })}
          </Fragment>;
        })}</ul>
      </div> : <GearCategoryEmpty {...categoryProps} onClear={clearSearch} />)}
    </section> : ranking ? <section className="gear-rank" id="gear-rankings" aria-label={gearGroups[group] + "排行"}>
      <div className="gear-rank-controls">
        <div className="gear-rank-tools">{search}
          {rankOrders}
          <WearerExclusion units={selectableWearers} excluded={excluded}
            onChange={excluded => changeFilters({ ...filters, excluded })} />
        </div>
      </div>
      {archiveMessage || (visible.length && specialStats ? <>
        <div className="gear-rank-head" aria-hidden="true"><span>装备</span><span>均名</span><span>登顶率</span><span>场数</span><span>使用者 <small>均名 / 场数</small></span></div>
        <ul className="gear-rank-list">{visible.sort((a, b) => {
          const aStats = specialStats.items[a.id], bStats = specialStats.items[b.id];
          const games = (bStats?.totalGames ?? 0) - (aStats?.totalGames ?? 0);
          if (order === "games") return games;
          const aPerformance = itemPerformance(a, specialStats), bPerformance = itemPerformance(b, specialStats);
          if (order === "wins") return (bPerformance?.winRate ?? -1) - (aPerformance?.winRate ?? -1) || games;
          return (aPerformance?.mean ?? Infinity) - (bPerformance?.mean ?? Infinity) || games;
        }).map(entry => {
          const stats = specialStats.items[entry.id];
          const holders = stats?.rows.filter(row => row.unitId !== excluded && unitMap.has(row.unitId)) ?? [];
          const qualified = holders.filter(row => row.games >= specialStats.minGames && row.mean !== undefined);
          const commonOnly = !qualified.length;
          const best = (commonOnly ? holders.sort((a, b) => b.games - a.games) :
            qualified.sort((a, b) => a.mean! - b.mean! || b.games - a.games)).slice(0, 3);
          const performance = itemPerformance(entry, specialStats);
          const mean = performance?.mean;
          const minGames = itemSampleMinimum(entry, specialStats);
          const open = selected === entry.id;
          const nextId = open ? "" : entry.id;
          const name = itemName(entry);
          return <li key={entry.id} className="gear-rank-entry" data-open={open || undefined}>
            <div className="gear-rank-row">
              <a className="gear-rank-toggle" href={itemHref(group, filters, { item: nextId, unit: wearer, from: origin?.href })}
                aria-expanded={open} aria-label={name + "装备详情"}
                onClick={event => {
                  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  clicked.current = { element: event.currentTarget, top: event.currentTarget.getBoundingClientRect().top };
                  navigate(nextId, group);
                }}>
                <span className="gear-rank-identity">
                  <ItemIcon item={entry} size={34} />
                  <span title={name}>{group === "radiant" ? name.replace(/^光明版/, "") : name}
                    {entry.category === "support" && <small>辅助装</small>}
                  </span>
                  <ChevronDown aria-hidden="true" size={14} />
                </span>
                <span className="gear-rank-number" data-tone={placementTone(mean, stats?.totalGames ?? 0, specialStats.minGames)}><small>均名</small><strong>{mean?.toFixed(2) ?? "—"}</strong></span>
                <span className="gear-rank-number"><small>登顶率</small>{performance?.winRate != null ? percent.format(performance.winRate) : "—"}</span>
                <span className="gear-rank-number"><small>场数</small>{stats?.totalGames !== undefined ? number.format(stats.totalGames) : "—"}</span>
              </a>
              <div className="gear-rank-holders" aria-label={commonOnly ? "常用使用者" : "最佳使用者、均名和携带场数"}>
                {!!best.length && <span className="gear-pick-kind" data-kind={commonOnly ? "usual" : "best"} title={commonOnly ? "使用者均不足 " + specialStats.minGames + " 场，按携带场数排序" : "携带至少 " + specialStats.minGames + " 场，按均名排序"}>{commonOnly ? "常用" : "最佳"}</span>}
                {best.length ? best.map(row => {
                  const unit = unitMap.get(row.unitId)!;
                  return <a className={"gear-holder cost-" + unit.cost} key={unit.id} href={wearerLink(entry.id, unit.id)}
                    aria-label={name + " · " + unit.name + "使用战绩"}
                    aria-current={open && wearer === unit.id ? "true" : undefined}
                    onClick={event => openWearer(event, entry.id, unit.id)}>
                    <img src={unit.image} alt="" width={25} height={25} loading="lazy" />
                    <span>{unit.name}</span><small>{row.games >= minGames && row.mean !== undefined && row.mean.toFixed(2) + " · "}<span>{number.format(row.games)} 场</span></small>
                  </a>;
                }) : <small className="gear-holder-empty">暂无使用者数据</small>}
              </div>
            </div>
            {open && <div className="gear-rank-detail">
              <ItemReading item={entry} wearer={wearer} filters={filters} uses={examples[entry.id] ?? []} onRecipe={openItem} equipment={equipment} period={period?.id}
                onWearer={(event, unit) => openWearer(event, entry.id, unit)} wearerHref={unit => wearerLink(entry.id, unit)}
                returnHref={itemHref(group, filters, { item: entry.id, unit: wearer })}
                inRanking origin={origin} wearersOpen={wearersOpen === entry.id} onWearersToggle={() => rememberWearers(wearersOpen === entry.id ? "" : entry.id)} />
            </div>}
          </li>;
        })}</ul>
      </> : <GearCategoryEmpty {...categoryProps} onClear={clearSearch} />)}
    </section> : <div className="gear-library">
      <aside className="gear-index" id="gear-rankings" aria-label="选择装备">
        {search}
        {visible.length ? <div className="gear-index-list" data-view={group} ref={list}>
          {named.map(entry => renderIndex(entry))}
          {!!recipes.length && <h2 className="gear-recipe-results">可用该散件合成</h2>}
          {recipes.map(({ item, matches }) => renderIndex(item, matches))}
        </div> : <GearCategoryEmpty {...categoryProps} onClear={clearSearch} />}
      </aside>
      {item && <section className="gear-detail" ref={detail} aria-labelledby="gear-item-name">
        <a className="gear-back-to-index text-link" href="#gear-rankings">↑ 装备列表</a>
        {archiveMessage}
        <ItemReading key={item.id} item={item} wearer={wearer} filters={filters} uses={examples[item.id] ?? []} onRecipe={openItem} equipment={equipment} period={period?.id}
          onWearer={(event, unit) => openWearer(event, item.id, unit)} wearerHref={unit => wearerLink(item.id, unit)}
          returnHref={itemHref(group, filters, { item: item.id, unit: wearer })}
          showCategory={item.category !== group} origin={origin} openBuilds={openBuilds} />
      </section>}
    </div>}
  </>;
}

function ItemReading({ item, wearer, filters, uses, onRecipe, onWearer, wearerHref, equipment, period, inRanking = false, wearersOpen, onWearersToggle, showCategory = true, origin, returnHref, openBuilds = false }: {
  inRanking?: boolean;
  wearersOpen?: boolean; onWearersToggle?: () => void;
  showCategory?: boolean;
  openBuilds?: boolean;
  origin?: GuideOrigin;
  item: Item; wearer: string; filters: GearFilters; uses: ItemGuideUse[]; returnHref: string;
  equipment: EquipmentStats | undefined; period?: string;
  onRecipe: (event: MouseEvent<HTMLAnchorElement>, entry: Item, targetGroup?: ItemGroup) => void;
  onWearer: (event: MouseEvent<HTMLAnchorElement>, unit: string) => void;
  wearerHref: (unit: string) => string;
}) {
  const reverse = inRanking && !!filters.wearer;
  const excluded = reverse ? "" : filters.excluded;
  const reference = itemReference.items[item.id];
  const referenceBuild = reference?.build ?? itemReference.build;
  const effectSourceUrl = reference?.sourceUrl ?? itemReference.sources[0]?.url;
  const snapshot = equipment?.special.items[item.id] ? equipment.special : equipment?.standard;
  const sampled = snapshot?.items[item.id];
  const minGames = snapshot ? itemSampleMinimum(item, snapshot) : Infinity;
  const showBuildQuery = item.category === "completed" && item.id !== "TFT_Item_ThiefsGloves";
  const [buildsOpen, setBuildsOpen] = useState(openBuilds);
  const [buildsRevision, setBuildsRevision] = useState(0);
  const buildsId = useId();
  const buildsPanel = useRef<HTMLDivElement>(null);
  const radiant = item.category === "radiant";
  const special = item.category === "artifact" || item.category === "support";
  const cookRecipe = isCookRecipe(item);
  const cookComponent = cookware.has(item.id);
  const suitable = sampled?.rows.some(row => row.unitId !== excluded && unitMap.has(row.unitId) && row.mean !== undefined && row.games >= minGames);
  const [order, setOrder] = useState<"games" | "mean">(!inRanking && (radiant || special) && suitable ? "mean" : "games");
  const selectedWearer = wearer && wearer !== excluded ? sampled?.rows.find(row => row.unitId === wearer && unitMap.has(wearer)) : undefined;
  const known = sampled?.rows.filter(row => row.unitId !== excluded && unitMap.has(row.unitId) &&
    (order === "games" || row.games >= minGames && row.mean !== undefined)) ?? [];
  known.sort(order === "mean" ? (a, b) => (a.mean ?? 9) - (b.mean ?? 9) || b.games - a.games : (a, b) => b.games - a.games);
  const [allUsers, setAllUsers] = useState(false);
  const limit = radiant || special ? 3 : 6;
  const orderedUsers = inRanking || allUsers ? known : known.slice(0, limit);
  const shown = selectedWearer && !orderedUsers.includes(selectedWearer) ? [selectedWearer, ...orderedUsers] : orderedUsers;
  const boardUses = new Map<string, ItemBoardUse>();
  const relevant = uses.filter(use => (!reverse || use.unitId === filters.wearer) && unitMap.has(use.unitId) &&
    !(use.sectionId === origin?.sectionId && use.teamId === origin.teamId));
  for (const use of [...relevant.filter(use => use.unitId === wearer), ...relevant.filter(use => use.unitId !== wearer)]) {
    const href = withStatPeriod(guideLink(use.sectionId, use.teamId, reverse ? returnHref : undefined), period);
    const board = boardUses.get(href) ?? {
      href, label: use.boardName, isPrimary: use.isPrimary, holders: new Set<string>(), sectionId: use.sectionId, title: use.title,
    };
    board.holders.add(use.unitId);
    boardUses.set(href, board);
  }
  const guideExamples = new Map<string, { title: string; boards: ItemBoardUse[] }>();
  for (const board of [...boardUses.values()].slice(0, 5)) {
    const guide = guideExamples.get(board.sectionId) ?? { title: board.title, boards: [] };
    guide.boards.push(board);
    guideExamples.set(board.sectionId, guide);
  }
  const parts = recipeParts(item);
  const builds = item.category === "component" ? season.items.filter(entry => entry.components?.includes(item.id)) : [];
  const withRate = !radiant && shown.some(row => row.rate !== undefined);
  const attributeText = reference?.stats.map(({ value, label }) => value + label).join("、");
  const lines = reference?.description.replace(/\s/g, "") === attributeText ? [] : reference?.description.split(/\n+/).filter(Boolean) ?? [];
  const effect = lines.filter(line => !isGlossary(line)).join("\n");
  const glossary = lines.filter(isGlossary);
  const placement = (special || radiant) && snapshot ? itemPerformance(item, snapshot)?.mean : undefined;
  const WearerDetails = inRanking ? "details" : "section";
  const showWearers = snapshot && !reverse && (!!sampled?.rows.some(row => row.unitId !== excluded && unitMap.has(row.unitId)) ||
    !inRanking && (item.category === "completed" || item.category === "team-size" || special || radiant));

  function recipeLink(entry: Item, index: number) {
    const group = itemGroup(entry);
    return <a key={entry.id + index} href={periodGearHref(period, group, specificItemFilters(entry, filters), {
      item: entry.id, unit: wearer, from: origin?.href,
    })} onClick={event => onRecipe(event, entry, group)}>
      <ItemIcon item={entry} size={26} />{itemName(entry)}
    </a>;
  }

  function showWearerBuilds() {
    setBuildsRevision(revision => revision + 1);
    setBuildsOpen(true);
    requestAnimationFrame(() => {
      buildsPanel.current?.scrollIntoView({ block: "nearest" });
      buildsPanel.current?.focus({ preventScroll: true });
    });
  }

  return <>
    {origin && <a className="gear-origin text-link" href={origin.href}>← 返回棋盘</a>}
    {!inRanking && <header className="gear-detail-heading">
      <ItemIcon item={item} size={52} />
      <div><h2 id="gear-item-name">{itemName(item)}</h2>{showCategory && <span>{categoryNames[item.category ?? ""]}</span>}</div>
      {snapshot && (special || radiant) && <div className="gear-detail-placement">
        {placement !== undefined && <strong>均名 {placement.toFixed(2)}</strong>}
        <small>{sampled?.totalGames === undefined ? "暂无数据" : number.format(sampled.totalGames) + " 场"}</small>
      </div>}
      {showBuildQuery && <button type="button" className="gear-build-toggle" aria-expanded={buildsOpen}
        aria-controls={buildsId} onClick={() => setBuildsOpen(!buildsOpen)}>
        查三件套
        <ChevronDown size={15} aria-hidden="true" />
      </button>}
    </header>}
    {reverse && showBuildQuery && <button type="button" className="gear-build-toggle" aria-expanded={buildsOpen}
      aria-controls={buildsId} onClick={() => setBuildsOpen(!buildsOpen)}>
      查三件套<ChevronDown size={15} aria-hidden="true" />
    </button>}
    {showBuildQuery && <div className="gear-build-query" id={buildsId} ref={buildsPanel} tabIndex={-1} hidden={!buildsOpen}>
      <ConditionalGear key={buildsRevision} lockedItems={[item]} wearer={wearer} wearerIds={sampled?.rows.filter(row => row.unitId !== excluded).map(row => row.unitId)} active={buildsOpen} period={period} />
    </div>}
    <div className="gear-reading-body" data-wearers={showWearers || undefined}>
      <div className="gear-reading-reference">
        {!!reference?.stats.length && <dl className="gear-attributes" aria-label="装备属性">{reference.stats.map(({ label, value }) =>
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        {effect && <p className="gear-effect">{effect}</p>}
        {!!glossary.length && <details className="gear-glossary"><summary>效果术语</summary><p>{glossary.join("\n")}</p></details>}
        {!reference && <p className="gear-empty">暂无可核对的当期效果</p>}
        {!!parts.length && <section className="gear-recipe gear-visible-recipe" aria-label="合成配方">
          <span className="gear-recipe-label">合成</span>
          <div>{parts.map((entry, index) => <span key={entry.id + index}>
            {index > 0 && <span aria-hidden="true">+</span>}{recipeLink(entry, index)}
          </span>)}</div>
          {cookRecipe && item.traitId && <a className="gear-emblem-link" href={gearHref("emblems",
            emblemMatches(item.traitId, filters.query) ? filters : { ...filters, query: "" }, {
            trait: item.traitId, unit: wearer,
          })}>纹章使用者</a>}
        </section>}
      </div>
      {showWearers && <div className="gear-reading-users">
        <WearerDetails className="gear-wearers" aria-labelledby="gear-wearer-title" open={wearersOpen}>
          {inRanking && <summary id="gear-wearer-title" onClick={event => {
            event.preventDefault();
            onWearersToggle?.();
          }}>全部使用者</summary>}
          <header className="gear-section-heading">
            {!inRanking && <h3 id="gear-wearer-title">实战使用者</h3>}
            {!!sampled?.rows.length && <select aria-label="实战使用者排序" value={order} onChange={event => setOrder(event.target.value as typeof order)}>
              <option value="games">按场数</option>
              <option value="mean">按均名</option>
            </select>}
          </header>
          {shown.length ? <>
            <table className="gear-wearers-table">
              <thead><tr><th scope="col">棋子</th><th scope="col">场数</th>{withRate && <th scope="col">携带率</th>}<th scope="col">均名</th></tr></thead>
              <tbody>{shown.map(row => {
                const unit = unitMap.get(row.unitId)!;
                const active = unit.id === selectedWearer?.unitId;
                return <Fragment key={unit.id}><tr data-selected={active || undefined}>
                  <th scope="row">
                    <div className="gear-wearer-choice">
                      <a className={"gear-unit cost-" + unit.cost} href={wearerHref(unit.id)}
                        aria-label={"查看" + unit.name + "使用战绩"} aria-current={active ? "true" : undefined}
                        onClick={event => onWearer(event, unit.id)}>
                        <img src={unit.image} alt="" width={32} height={32} loading="lazy" />
                        <span>{unitLabel(unit).base}{unitLabel(unit).form && <small>{unitLabel(unit).form}</small>}</span>
                      </a>
                      <a className="gear-wearer-hero" href={withStatPeriod("/heroes?unit=" + encodeURIComponent(unit.id), period)}
                        title={unit.name + "英雄资料"} aria-label={unit.name + "英雄资料"}>
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    </div>
                  </th>
                  <td>{number.format(row.games)}</td>
                  {withRate && <td>{row.rate === undefined ? "—" : carryRateLabel(row.rate)}</td>}
                  <td>{row.games >= minGames && row.mean !== undefined
                    ? row.mean.toFixed(2) : <span title={row.games < minGames ? "满 " + minGames + " 场显示均名" : undefined}>—</span>}</td>
                </tr>{active && <tr className="gear-wearer-action" data-selected>
                  <td colSpan={withRate ? 4 : 3}><div>
                    {!inRanking && showBuildQuery && <button type="button" aria-controls={buildsId}
                      aria-label={"查" + unit.name + "的三件套"} onClick={showWearerBuilds}>查三件套</button>}
                    <a aria-label={"查" + unit.name + "携带" + itemName(item) + "的阵容"} href={withStatPeriod("/?" + new URLSearchParams({
                      q: unit.name + "携带" + item.name,
                      sort: "category",
                      fromItem: returnHref,
                    }), period)}>查阵容<ArrowUpRight size={14} aria-hidden="true" /></a>
                  </div></td>
                </tr>}</Fragment>;
              })}</tbody>
            </table>
            {!inRanking && known.length > limit && <button type="button" className="gear-more" onClick={() => setAllUsers(!allUsers)} aria-expanded={allUsers}>
              {allUsers ? "收起使用者" : "更多使用者"}
            </button>}
          </> : <p className="gear-empty">{sampled?.totalGames && minGames > 1 ? `暂无达到 ${minGames} 场的使用者` : "暂无可核对的携带样本"}</p>}
        </WearerDetails>
      </div>}

      {!!guideExamples.size && <section className="gear-board-uses" aria-labelledby="gear-guide-title">
        <header className="gear-section-heading">
          <h3 id="gear-guide-title">实戴阵容</h3>
          {!reverse && <a href={withStatPeriod("/?" + new URLSearchParams({ q: itemName(item) + "能玩什么", sort: "category", fromItem: returnHref }), period)}>找阵容</a>}
        </header>
        <ul>{[...guideExamples].map(([sectionId, { title, boards }]) => <li key={sectionId}
          className={boards.length > 1 ? "gear-guide-variants" : undefined}>
          {boards.length > 1 && <strong>{title}</strong>}
          {boards.map(({ href, label, isPrimary, holders }) => <a key={href} href={href}>
            <span className="gear-use-name">{boards.length > 1 ? label : title}
              {boards.length === 1 && !isPrimary && label !== title && <small>{label}</small>}
            </span>
            <span className="gear-use-holders">{[...holders].map(unitId => unitMap.get(unitId)?.name).join("、")}</span>
          </a>)}
        </li>)}</ul>
      </section>}
    </div>
    {cookComponent && !!builds.length && <section className="gear-cook-results" aria-labelledby="gear-cook-title">
      <h3 id="gear-cook-title">可合成装备</h3>
      <ul>{builds.map(entry => <li key={entry.id}>
        <a href={periodGearHref(period, "craft", specificItemFilters(entry, filters), { item: entry.id, unit: wearer, from: origin?.href })}
          onClick={event => onRecipe(event, entry, "craft")}>
          <ItemIcon item={entry} size={32} />
          <span>{itemName(entry)}<small>{recipeParts(entry).map(itemName).join(" + ")}</small></span>
        </a>
      </li>)}</ul>
    </section>}
    {!cookComponent && !!builds.length && <details className="gear-recipe">
      <summary>可合成装备</summary>
      <div>{builds.map(recipeLink)}</div>
    </details>}
    {(sampled || reference) && <details className="gear-sample-method">
      <summary>数据来源</summary>
      {sampled && snapshot && <p>
        <a href={sampled.url} target="_blank" rel="noreferrer">{snapshot.source} 携带战绩</a> · {snapshot.version} · {snapshot.window} · {dateLabel(snapshot.date)}。
        {minGames > 1 && `满 ${minGames} 场显示均名。`}{withRate && "携带率按该棋子的结算场数计算。"}
      </p>}
      {reference && <p>
        {effectSourceUrl && effectSourceUrl !== sampled?.url
          ? <a href={effectSourceUrl} target="_blank" rel="noreferrer">装备效果</a> : "装备效果"}
        {referenceBuild && " · " + referenceBuild}
      </p>}
    </details>}
  </>;
}
