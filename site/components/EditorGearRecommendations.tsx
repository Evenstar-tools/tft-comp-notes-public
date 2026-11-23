"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { itemMap, season } from "@/data";
import buildSource from "@/data/conditional-gear-unit-ids.json";
import { itemName } from "@/domain/gear-library";
import type { HeroItemSample, HeroItemSource } from "@/domain/hero-insights";
import type { Item, Unit } from "@/domain/types";
import { formatHeroItemDelta, HeroItemPlacementDelta, heroItemDeltaHint } from "./HeroItemPlacementDelta";
import { ItemIcon } from "./ItemIcon";
import "./editor-gear-recommendations.css";

const count = new Intl.NumberFormat("zh-CN");
const rate = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const starChoices = [1, 2, 3];

type BuildSample = {
  rows: { items: [string, string, string]; games: number; mean: number | null }[];
  patch: string;
  windowDays: number;
  minGames: number;
  asOf: string;
  sourceUrl: string;
};

export function EditorGearRecommendations({ unit, items, gearSource, onEquip, onApplyBuild }: {
  unit: Unit;
  items: readonly HeroItemSample[];
  gearSource: HeroItemSource;
  onEquip: (item: Item) => void;
  onApplyBuild: (itemIds: readonly string[]) => void;
}) {
  const [stars, setStars] = useState(2);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; sample: BuildSample | null }>();
  const supportsBuilds = season.id.startsWith(`s19-pbe-${buildSource.patch}.`) && Object.hasOwn(buildSource.units, unit.id);
  const key = `${unit.id}/${stars}/${attempt}`;

  useEffect(() => {
    if (!supportsBuilds) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ unit: unit.id, stars: String(stars) });
    fetch("/api/gear-builds?" + query, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Build samples unavailable");
        const sample: BuildSample = await response.json();
        if (!Array.isArray(sample.rows)) throw new Error("Invalid build samples");
        if (!controller.signal.aborted) setResult({ key, sample });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, sample: null });
      });
    return () => controller.abort();
  }, [key, stars, supportsBuilds, unit.id]);

  const current = result?.key === key ? result : undefined;
  const common = items.flatMap(sample => {
    const item = itemMap.get(sample.itemId);
    return item ? [{ ...sample, item }] : [];
  }).slice(0, 4);
  const hasPlacementDelta = common.some(row => row.placementDelta !== undefined);
  const sample = current?.sample;
  const builds = (sample?.rows ?? []).flatMap(row => {
    const gear = row.items.map(id => itemMap.get(id));
    if (row.mean === null || gear.length !== 3 || !gear.every((item): item is Item => !!item)) return [];
    return [{ ...row, gear }];
  }).slice(0, 3);

  return (
    <div className="editor-gear-recommendations">
      <section aria-label="常用装备">
        <div className="editor-gear-heading">
          <h3>常用装备</h3>
          <span title={hasPlacementDelta ? heroItemDeltaHint : `${gearSource.source} · ${gearSource.version} · ${gearSource.window} · ${gearSource.date}`}>
            {hasPlacementDelta && "名次差 · "}{gearSource.source} · {gearSource.date.slice(5).replace("-", "/")}
          </span>
        </div>
        {common.length ? (
          <div className="editor-common-gear-list">
            {common.map(({ item, games, mean, rate: carryRate, placementDelta }) => {
              const name = itemName(item);
              const detail = [
                `${count.format(games)} 场`,
                mean === undefined ? undefined : `均名 ${mean.toFixed(2)}`,
                placementDelta === undefined ? undefined : `名次差 ${formatHeroItemDelta(placementDelta)}`,
                carryRate === undefined ? undefined : `携带率 ${rate.format(carryRate)}`,
              ].filter(Boolean).join(" · ");
              return (
                <button type="button" key={item.id} onClick={() => onEquip(item)}
                  aria-label={`装备${name}，${detail}`} title={`${name} · ${detail}`}>
                  <ItemIcon item={item} size={24} />
                  <span>{name}</span>
                  <small>{count.format(games)} 场</small>
                  {hasPlacementDelta && <small className="editor-common-gear-delta">
                    {placementDelta === undefined ? "—" : <HeroItemPlacementDelta value={placementDelta} />}
                  </small>}
                </button>
              );
            })}
          </div>
        ) : <p className="editor-gear-status">暂无达到 {gearSource.minGames} 场的单件样本。</p>}
      </section>
      <section className="editor-build-recommendations" aria-label="三件套推荐">
        <div className="editor-gear-heading">
          <h3>三件套推荐</h3>
          {supportsBuilds && <select aria-label="三件套样本星级" value={stars} onChange={event => setStars(Number(event.target.value))}>
            {starChoices.map(value => <option value={value} key={value}>{value} 星</option>)}
          </select>}
        </div>
        {builds.length ? (
          <>
            <div className="editor-build-columns" aria-hidden="true"><span>装备</span><span>场数</span><span>均名</span><span /></div>
            {builds.map(({ items: ids, gear, games, mean }) => {
              const names = gear.map(itemName).join("、");
              return (
                <button className="editor-build-choice" type="button" key={ids.join("|")} onClick={() => onApplyBuild(ids)}
                  aria-label={`套用${names}，${count.format(games)} 场，均名 ${mean?.toFixed(2)}`}
                  title={`套用三件套 · ${names}`}>
                  <span className="editor-build-icons">{gear.map((item, index) =>
                    <ItemIcon key={index} item={item} size={20} />
                  )}</span>
                  <span>{count.format(games)}</span>
                  <strong>{mean?.toFixed(2)}</strong>
                  <span className="editor-build-apply">套用</span>
                </button>
              );
            })}
          </>
        ) : (
          <div className="editor-gear-status" role="status">
            {!supportsBuilds ? "暂无该英雄的三件套数据。" :
              !current ? "正在加载三件套…" :
                !sample ? <>三件套暂未加载。<button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></> :
                  `暂无达到 ${sample.minGames} 场的三件套。`}
          </div>
        )}
        {sample && <div className="editor-build-source">
          <span title={`取数日期 ${sample.asOf.slice(0, 10)} · 按场数排序 · ${sample.minGames} 场起展示`}>{sample.patch} · 近 {sample.windowDays} 天</span>
          <a href={sample.sourceUrl} target="_blank" rel="noreferrer">MetaTFT <ArrowUpRight size={11} aria-hidden /></a>
        </div>}
      </section>
    </div>
  );
}
