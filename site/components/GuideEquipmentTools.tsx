"use client";
import { useState, type ReactNode } from "react";
import samples from "@/data/guide-item-builds.json";
import { planCarousel, thirdItems, type GearBag, type GearTarget } from "@/domain/guide-equipment";
import { traitCounts, usedPopulation } from "@/domain/team";
import type { Item, Piece, Season, Team } from "@/domain/types";
import { ItemIcon } from "./ItemIcon";
import "./guide-equipment-tools.css";

type Inventory = { held: GearBag; completed: GearBag };
type ItemMap = ReadonlyMap<string, Item>;
type BuildSample = typeof samples.records[number];

function readBag(value: unknown, items: ItemMap): GearBag {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([id, n]) => items.has(id) && Number.isInteger(n) && n > 0 && n <= 99));
}

function inventoryKey(seasonId: string) {
  return "tft.guide-gear." + seasonId + window.location.pathname;
}

export function CarouselGear({ targets, items, seasonId, recipes }: {
  targets: GearTarget[]; items: ItemMap; seasonId: string; recipes?: ReactNode;
}) {
  const [mode, setMode] = useState<"recipes" | "carousel">(recipes ? "recipes" : "carousel");
  const [inventory, setInventory] = useState<Inventory>({ held: {}, completed: {} });
  const [editingParts, setEditingParts] = useState(false);
  const parts = [...items.values()].filter(item => item.category === "component");
  const targetItems = [...new Map(targets.map(({ item }) => [item.id, item])).values()];
  const { needs, ready, picks, remaining } = planCarousel(targets, inventory.held, inventory.completed);
  const held = Object.entries(inventory.held).filter(([, n]) => n > 0);
  function restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(inventoryKey(seasonId)) ?? "{}");
      setInventory({ held: readBag(saved.held, items), completed: readBag(saved.completed, items) });
    } catch { /* Storage may be unavailable in private browsing. */ }
  }
  function save(next: Inventory) {
    setInventory(next);
    try { sessionStorage.setItem(inventoryKey(seasonId), JSON.stringify(next)); } catch { /* In-memory interaction still works. */ }
  }
  function change(group: keyof Inventory, id: string, delta: number, max = 99) {
    const count = Math.max(0, Math.min(max, (inventory[group][id] ?? 0) + delta));
    save({ ...inventory, [group]: { ...inventory[group], [id]: count } });
  }
  function craft(item: Item) {
    const after = { ...inventory.held };
    for (const id of item.components ?? []) after[id]--;
    save({ held: after, completed: { ...inventory.completed, [item.id]: (inventory.completed[item.id] ?? 0) + 1 } });
  }
  if (!targets.length && !recipes) return null;
  return <details className="guide-opt-gear guide-opt-components" onToggle={event => { if (event.target === event.currentTarget && event.currentTarget.open) restore(); }}>
    <summary>散件与合装</summary>
    <div className="guide-opt-panel">
      {!!recipes && !!targets.length && <div className="guide-opt-modes" role="group" aria-label="配装工具">
        <button type="button" aria-pressed={mode === "recipes"} onClick={() => setMode("recipes")}>查成装</button>
        <button type="button" aria-pressed={mode === "carousel"} onClick={() => setMode("carousel")}>选秀建议</button>
      </div>}
      {mode === "recipes" ? recipes : <>
        <div className="guide-opt-inventory">
          <span>手里散件</span>
          {held.map(([id, count]) => <button type="button" key={id} onClick={() => change("held", id, -1)}
            aria-label={"减一件" + items.get(id)?.name} title={"减一件" + items.get(id)?.name}>
            <ItemIcon item={items.get(id)} size={22} />×{count} −</button>)}
          <button type="button" aria-expanded={editingParts} onClick={() => setEditingParts(!editingParts)}>
            {editingParts ? "收起散件" : "＋ 添加散件"}</button>
        </div>
        {editingParts && <div className="guide-opt-part-list">{parts.map(part =>
          <button type="button" key={part.id} title={part.name} aria-label={"加一件" + part.name} onClick={() => change("held", part.id, 1)}>
            <ItemIcon item={part} size={26} /><span>{part.name}</span></button>)}</div>}
        <div aria-live="polite">
          {ready.length > 0 ? <div className="guide-opt-pick"><strong>可直接合</strong><span><ItemIcon item={ready[0].item} size={24} />
            {ready[0].item.name} · {ready[0].owner}</span><button type="button" onClick={() => craft(ready[0].item)}>标为已合</button></div>
            : picks.map(({ id, goal, completes }, i) => <div className="guide-opt-pick" key={id}>
              <strong>{i === 0 ? "首选" : "备选"}</strong><span><ItemIcon item={items.get(id)} size={24} />{items.get(id)?.name}</span>
              <small>{completes ? "可合" : "准备做"}{goal.item.name} · {goal.owner}</small></div>)}
          {!remaining && <p>这张棋盘的成装已齐。</p>}
        </div>
        {!!needs.length && <details className="guide-opt-needs"><summary><span>全队还缺</span>{needs.slice(0, 3).map(({ id, count }) =>
          <span key={id} title={items.get(id)?.name} aria-label={items.get(id)?.name + " ×" + count}>
            <ItemIcon item={items.get(id)} size={20} />×{count}</span>)}<span className="guide-opt-more">明细</span></summary>
          <div className="guide-opt-total">{needs.map(({ id, count }) => <span key={id}>{items.get(id)?.name} ×{count}</span>)}</div>
        </details>}
        <details className="guide-opt-done"><summary>已有成装 · {targets.length - remaining}/{targets.length}</summary>
          {targetItems.map(item => {
            const max = targets.filter(target => target.item.id === item.id).length;
            const count = inventory.completed[item.id] ?? 0;
            return <div key={item.id}><span><ItemIcon item={item} size={22} />{item.name}</span>
              <button type="button" aria-label={"减少" + item.name} disabled={!count} onClick={() => change("completed", item.id, -1)}>−</button>
              <span>有{count} / 需{max}</span><button type="button" aria-label={"增加" + item.name} disabled={count >= max} onClick={() => change("completed", item.id, 1, max)}>＋</button></div>;
          })}
        </details>
      </>}
    </div>
  </details>;
}

export function matchingBuildScope(team: Team, data: Season) {
  if (!data.id.startsWith(samples.season)) return;
  const sample = samples.records.find(record => record.teamId === team.id);
  if (!sample || usedPopulation(team.pieces) !== sample.level) return;
  const trait = traitCounts(team.pieces, data.units, data.traits, data.items).find(entry => entry.id === sample.traitId);
  return trait?.level === sample.tier ? sample : undefined;
}

export function ThirdGear({ sample, piece, items, traitName }: { sample: BuildSample; piece: Piece; items: ItemMap; traitName: string }) {
  // Published guides carry only their own gear, while the comparison also includes other observed builds.
  const names: Record<string, string> = samples.itemNames;
  const itemFor = (id: string): Item => items.get(id) ?? { id, name: names[id], description: "" };
  const options = [...new Set(sample.builds.flatMap(build => build.items))];
  const preferred = piece.items.slice(0, 2);
  const initial = preferred.length === 2 && thirdItems(sample.builds, preferred[0], preferred[1]).length ? preferred : sample.builds[0].items.slice(0, 2);
  const [pair, setPair] = useState(initial);
  const [lockedCount, setLockedCount] = useState<1 | 2>(2);
  const [showAll, setShowAll] = useState(false);
  const results = lockedCount === 2
    ? thirdItems(sample.builds, pair[0], pair[1]).map(({ id, games, mean }) => ({ ids: [id], games, mean }))
    : sample.builds.filter(build => build.items.includes(pair[0])).map(build => {
        const remaining = [...build.items];
        remaining.splice(remaining.indexOf(pair[0]), 1);
        return { ids: remaining, games: build.games, mean: build.mean };
      }).sort((a, b) => b.games - a.games);
  return <details className="guide-opt-gear guide-opt-compare"><summary>查配装数据</summary>
    <div className="guide-opt-panel">
      <div className="guide-opt-modes" role="group" aria-label="已有成装件数">
        {([1, 2] as const).map(count => <button type="button" key={count} aria-pressed={lockedCount === count} onClick={() => {
          setLockedCount(count);
          setShowAll(false);
        }}>已有{count}件</button>)}
      </div>
      <div className="guide-opt-locked">{pair.slice(0, lockedCount).map((value, index) => <label key={index}>
        <span>{index ? "第二件" : "第一件"}</span><select value={value} onChange={event => {
          const selected = event.target.value;
          setPair(previous => previous.map((id, position) => position === index ? selected : id));
          setShowAll(false);
        }}>
          {options.map(id => <option key={id} value={id}>{itemFor(id).name}</option>)}</select></label>)}</div>
      {results.length ? <table><thead><tr><th>{lockedCount === 2 ? "第三件" : "剩余两件"}</th><th>均名</th><th>场数 ↓</th></tr></thead><tbody>
        {(showAll ? results : results.slice(0, 3)).map(row => <tr key={row.ids.join(",")}><td><div className="guide-opt-build-items">
          {row.ids.map((id, index) => <span key={id + index}><ItemIcon item={itemFor(id)} size={23} />{itemFor(id).name}</span>)}</div></td>
          <td>{row.games >= 100 ? row.mean.toFixed(2) : "样本少"}</td><td>{row.games.toLocaleString("zh-CN")}</td></tr>)}
      </tbody></table> : <p role="status">暂无符合条件的三件套。</p>}
      {results.length > 3 && <button type="button" className="guide-opt-all-builds" aria-expanded={showAll}
        onClick={() => setShowAll(!showAll)}>{showAll ? "收起" : "再看 " + (results.length - 3) + " 套"}</button>}
      <small>{sample.level}级 · {sample.tier}{traitName} · {sample.stars}星 · 常规成装 · <a href={sample.url} target="_blank" rel="noreferrer">MetaTFT ↗</a><br/>{samples.patch} · {samples.date} 近{samples.windowDays}天</small>
    </div>
  </details>;
}
