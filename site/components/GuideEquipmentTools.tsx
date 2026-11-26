"use client";
import { useState } from "react";
import samples from "@/data/guide-item-builds.json";
import { thirdItems } from "@/domain/guide-equipment";
import { traitCounts, usedPopulation } from "@/domain/team";
import type { Item, Piece, Season, Team } from "@/domain/types";
import { ItemIcon } from "./ItemIcon";
import "./guide-equipment-tools.css";

type ItemMap = ReadonlyMap<string, Item>;
type BuildSample = typeof samples.records[number];

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
