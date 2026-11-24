"use client";

import { useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { itemMap, season } from "@/data";
import buildSource from "@/data/conditional-gear-unit-ids.json";
import itemReference from "@/data/item-reference.json";
import { maxLockedGearItems } from "@/domain/conditional-gear";
import { gearHref, gearMatches, itemName } from "@/domain/gear-library";
import type { HeroItemSample, HeroItemSource } from "@/domain/hero-insights";
import { itemLink } from "@/domain/links";
import { withStatPeriod } from "@/domain/stat-periods";
import type { Unit } from "@/domain/types";
import { ConditionalGear } from "./ConditionalGear";
import { HeroItemPlacementDelta, heroItemDeltaHint } from "./HeroItemPlacementDelta";
import { ItemIcon } from "./ItemIcon";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import "./hero-loadout.css";

const number = new Intl.NumberFormat("zh-CN");
const ratio = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const sourceItems: Readonly<Record<string, { pbeId?: string }>> = itemReference.items;
const lockableItems = [...itemMap.values()].filter(item =>
  item.category === "completed" && item.id !== "TFT_Item_ThiefsGloves" && sourceItems[item.id]?.pbeId
);
const lockableIds = new Set(lockableItems.map(item => item.id));

export function HeroLoadout({ unit, items, gearSource, period }: {
  unit: Unit; items: HeroItemSample[]; gearSource: HeroItemSource; period?: string;
}) {
  const [choice, setChoice] = useState<{ unitId: string; itemIds: string[] }>();
  const [gearQuery, setGearQuery] = useState("");
  const buildId = useId();
  const builds = useRef<HTMLDivElement>(null);
  const lockTrigger = useRef<HTMLButtonElement>(null);
  const supportsBuilds = season.id.startsWith(`s19-pbe-${buildSource.patch}.`) && Object.hasOwn(buildSource.units, unit.id);
  const sampledItems = items.map(row => ({ ...row, item: itemMap.get(row.itemId) }));
  const hasPlacementDelta = sampledItems.some(row => row.item && row.placementDelta !== undefined);
  const firstWithSample = sampledItems.find(row => lockableIds.has(row.itemId))?.item;
  const defaultItem = firstWithSample ?? lockableItems[0];
  const defaultIds = defaultItem ? [defaultItem.id] : [];
  const lockedIds = choice?.unitId === unit.id ? choice.itemIds : defaultIds;
  const lockedItems = lockedIds.flatMap(id => itemMap.get(id) ?? []);
  const atLimit = lockedIds.length >= maxLockedGearItems;
  const order = new Map(sampledItems.map(({ itemId }, index) => [itemId, index]));
  const orderedItems = [...lockableItems].sort((a, b) =>
    (order.get(a.id) ?? sampledItems.length) - (order.get(b.id) ?? sampledItems.length) ||
    itemName(a).localeCompare(itemName(b), "zh-CN")
  );
  const visibleItems = orderedItems.filter(item => gearMatches(item, gearQuery.trim()));
  function toggleItem(itemId: string) {
    setChoice(previous => {
      const ids = previous?.unitId === unit.id ? previous.itemIds : defaultIds;
      if (ids.includes(itemId)) return { unitId: unit.id, itemIds: ids.filter(id => id !== itemId) };
      if (ids.length >= maxLockedGearItems) return previous;
      return { unitId: unit.id, itemIds: [...ids, itemId] };
    });
  }
  function pickItem(itemId: string) {
    toggleItem(itemId);
    if (window.matchMedia("(max-width: 1100px)").matches) {
      lockTrigger.current?.focus({ preventScroll: true });
      builds.current?.scrollIntoView({ block: "nearest" });
    }
  }

  return <div className="hero-loadout">
    <section className="hero-loadout-items" aria-label="单件装备">
      <header>
        <h3>单件装备</h3>
        <div className="hero-loadout-links">
          <a className="hero-loadout-all text-link" href={withStatPeriod(gearHref("radiant", undefined, { wearer: unit.id }), period)}>光明装</a>
          <a className="hero-loadout-all text-link" href={withStatPeriod(gearHref("all", undefined, { wearer: unit.id }), period)}>查看全部装备<ArrowUpRight size={13} aria-hidden="true" /></a>
        </div>
      </header>
      {sampledItems.length ? <table>
        <thead><tr>
          <th scope="col">装备</th><th scope="col">场数</th><th scope="col">均名</th>
          {hasPlacementDelta && <th scope="col" title={heroItemDeltaHint}>名次差</th>}
          <th scope="col">携带率</th>
        </tr></thead>
        <tbody>{sampledItems.map(({ itemId, item, games, mean, rate, placementDelta }) => {
          if (!item) return null;
          const label = itemName(item);
          const lockable = supportsBuilds && lockableIds.has(itemId);
          const checked = lockedIds.includes(itemId);
          return <tr key={itemId}>
            <th scope="row"><div className="hero-loadout-item">
              {lockable ? <button type="button" className="hero-loadout-pick" aria-pressed={checked} aria-controls={buildId}
                aria-label={"锁定" + label} disabled={atLimit && !checked}
                title={atLimit && !checked ? "先取消一件已锁定的装备" : (checked ? "取消锁定" : "锁定") + label}
                onClick={() => pickItem(itemId)}>
                <ItemIcon item={item} size={26} /><span>{label}</span>
              </button> : <span className="hero-loadout-pick"><ItemIcon item={item} size={26} />{label}</span>}
              <a href={withStatPeriod(itemLink(itemId, unit.id), period)} title={"查看" + label + "属性和战绩"} aria-label={"查看" + label + "属性和战绩"}>
                <ArrowUpRight size={13} aria-hidden />
              </a>
            </div></th>
            <td>{number.format(games)}</td>
            <td>{mean?.toFixed(2) ?? "—"}</td>
            {hasPlacementDelta && <td>{placementDelta === undefined ? "—" : <HeroItemPlacementDelta value={placementDelta} />}</td>}
            <td>{typeof rate === "number" ? ratio.format(rate) : "—"}</td>
          </tr>;
        })}</tbody>
      </table> : <p className="hero-loadout-empty">暂无达到 {gearSource.minGames} 场的单件样本。</p>}
    </section>
    {supportsBuilds && <div className="hero-loadout-builds" id={buildId} ref={builds}>
      <ConditionalGear lockedItems={lockedItems} wearer={unit.id} fixedWearer period={period} holdControl={
        <Popover onOpenChange={open => { if (!open) setGearQuery(""); }}>
          <PopoverTrigger asChild>
            <button type="button" className="hero-loadout-lock" ref={lockTrigger}
              aria-label={"锁定装备，已选 " + lockedIds.length + " 件，最多 2 件"}>
              <span>锁定装备</span>
              {lockedItems.map(item => <ItemIcon key={item.id} item={item} size={22} />)}
              <span className="hero-loadout-lock-count">{lockedIds.length}/{maxLockedGearItems}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" collisionPadding={12} className="hero-loadout-lock-menu" aria-label="锁定装备"
            onOpenAutoFocus={event => { if (window.matchMedia("(max-width: 760px)").matches) event.preventDefault(); }}>
            <div className="hero-loadout-lock-menu-header">
              <strong>最多勾选两件</strong>
              <button type="button" disabled={!lockedIds.length} onClick={() => setChoice({ unitId: unit.id, itemIds: [] })}>清空</button>
            </div>
            <input type="search" aria-label="搜索可锁定装备" placeholder="搜索装备" value={gearQuery}
              onChange={event => setGearQuery(event.target.value)} />
            <div className="hero-loadout-lock-options" role="group" aria-label="可锁定装备">
              {visibleItems.map(item => {
                const checked = lockedIds.includes(item.id);
                return <label className="hero-loadout-lock-option" key={item.id}>
                  <input type="checkbox" checked={checked} disabled={atLimit && !checked} onChange={() => toggleItem(item.id)} />
                  <ItemIcon item={item} size={22} /><span>{itemName(item)}</span>
                </label>;
              })}
              {!visibleItems.length && <p className="hero-loadout-empty">没有匹配的装备</p>}
            </div>
          </PopoverContent>
        </Popover>
      } />
    </div>}
  </div>;
}
