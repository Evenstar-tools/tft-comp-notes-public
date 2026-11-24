"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Info, LockKeyhole } from "lucide-react";
import { itemMap, season, traitMap, unitMap } from "@/data";
import { conditionalGearCohorts, conditionalGearItemNames, conditionalGearRows, conditionalGearSource } from "@/domain/conditional-gear";
import { itemName } from "@/domain/gear-library";
import { getStatPeriod } from "@/domain/stat-periods";
import type { Item } from "@/domain/types";
import { ItemIcon } from "./ItemIcon";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import "./conditional-gear.css";

const number = new Intl.NumberFormat("zh-CN");
const queryDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });
const defaultWearerIds: readonly string[] = [];
const initialResultCount = 5;
const extraResultCount = 10;
type Order = "games" | "mean";
type Source = "global" | "guide";
type SampleRow = ReturnType<typeof conditionalGearRows>[number];
type GlobalSample = {
  rows: SampleRow[];
  patch: string;
  windowDays: number;
  minGames: number;
  asOf: string;
  sourceUrl: string;
  limit: number;
};

export function ConditionalGear({ lockedItems, wearer = "", wearerIds = defaultWearerIds, active = true, fixedWearer = false, holdControl, period }: {
  lockedItems: readonly Item[];
  wearer?: string;
  wearerIds?: readonly string[];
  active?: boolean;
  fixedWearer?: boolean;
  holdControl?: ReactNode;
  period?: string;
}) {
  const title = useId();
  const historicalPeriod = period ? getStatPeriod(period) : undefined;
  const hasSampleSource = !period || (historicalPeriod?.channel === "pbe" && !!historicalPeriod.metaTft);
  const lockedIds = lockedItems.map(item => item.id);
  const cohorts = period ? [] : conditionalGearCohorts(season.id, lockedIds);
  const candidates = [...new Set([wearer, ...cohorts.map(entry => entry.unitId), ...wearerIds])]
    .filter(id => unitMap.has(id));
  const defaultUnitId = unitMap.has(wearer) ? wearer : wearerIds.find(id => unitMap.has(id)) ?? candidates[0] ?? "";
  const [unitChoice, setUnitChoice] = useState<{ wearer: string; unitId: string }>();
  const unitId = !fixedWearer && unitChoice?.wearer === wearer && candidates.includes(unitChoice.unitId) ? unitChoice.unitId : defaultUnitId;
  const unit = unitMap.get(unitId);
  const forUnit = cohorts.filter(entry => entry.unitId === unitId);
  const [starChoice, setStarChoice] = useState<{ unitId: string; stars: number }>();
  const stars = starChoice?.unitId === unitId ? starChoice.stars :
    fixedWearer ? 2 : forUnit.find(entry => entry.stars === 2)?.stars ?? forUnit[0]?.stars ?? 2;
  const forStars = forUnit.filter(entry => entry.stars === stars);
  const [scopeChoice, setScopeChoice] = useState("");
  const scope = forStars.find(entry => entry.teamId === scopeChoice) ?? forStars[0];
  const canUseGuide = !period && (!fixedWearer || !!forStars.length);
  const [modeChoice, setMode] = useState<Source>("global");
  const mode = canUseGuide ? modeChoice : "global";
  const [order, setOrder] = useState<Order>("games");
  const [visibleCount, setVisibleCount] = useState(initialResultCount);
  const [attempt, setAttempt] = useState(0);
  const [globalResult, setGlobalResult] = useState<{ key: string; data: GlobalSample | null }>();
  const query = new URLSearchParams({ unit: unitId, stars: String(stars), view: "table" });
  for (const id of lockedIds) query.append("item", id);
  if (period) query.set("stats", period);
  const requestUrl = "/api/gear-builds?" + query;
  const requestKey = requestUrl + "/" + attempt;
  useEffect(() => {
    if (!active || mode !== "global" || !unitId || !hasSampleSource) return;
    const controller = new AbortController();
    fetch(requestUrl, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Build samples unavailable");
        const data: GlobalSample = await response.json();
        if (!Array.isArray(data.rows)) throw new Error("Invalid build samples");
        if (!controller.signal.aborted) setGlobalResult({ key: requestKey, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setGlobalResult({ key: requestKey, data: null });
      });
    return () => controller.abort();
  }, [active, hasSampleSource, mode, requestKey, requestUrl, unitId]);
  const currentResult = globalResult?.key === requestKey ? globalResult : undefined;
  const global = mode === "global" ? currentResult?.data : undefined;
  const rows = mode === "global" ? global?.rows ?? [] : scope ? conditionalGearRows(scope, lockedIds) : [];
  const sorted = order === "mean"
    ? [...rows].sort((a, b) => (a.mean ?? 9) - (b.mean ?? 9) || b.games - a.games)
    : rows;
  const scopeLabel = ({ level, tier, traitId }: (typeof cohorts)[number]) =>
    [level ? level + " 人口" : "", tier && traitId ? tier + " " + (traitMap.get(traitId)?.name ?? traitId) : ""].filter(Boolean).join(" · ") || "全部结算盘";
  const singleItem = lockedItems[0];
  const resultLabel = lockedIds.length === 2 ? "第三件装备" : lockedIds.length === 1 ? "剩余两件" : "装备组合";
  const minGames = global?.minGames ?? conditionalGearSource.minGames;
  const meanHint = `少于 ${number.format(minGames)} 场标为「少样本」。`;
  function changeUnit(id: string) {
    setUnitChoice({ wearer, unitId: id });
    setStarChoice(undefined);
    setScopeChoice("");
    setVisibleCount(initialResultCount);
  }
  function changeMode(next: Source) {
    setMode(next);
    setVisibleCount(initialResultCount);
  }

  return <section className="conditional-gear" aria-labelledby={title}>
    <div className="conditional-gear-title">
      <h3 id={title}>三件套</h3>
      {holdControl ?? (singleItem && <span className="conditional-gear-locked" title={"已固定" + itemName(singleItem)}><LockKeyhole size={13} aria-hidden />
        <ItemIcon item={singleItem} size={22} /><strong>{itemName(singleItem)}</strong>
      </span>)}
    </div>
    {unit && hasSampleSource && <div className="conditional-gear-toolbar"><div className="conditional-gear-filters">
      {!fixedWearer && <label>英雄<select aria-label="英雄" value={unitId} onChange={event => changeUnit(event.target.value)}>
        {candidates.map(id => <option key={id} value={id}>{unitMap.get(id)?.name}</option>)}
      </select></label>}
      <label>星级<select aria-label="星级" value={stars} onChange={event => {
        setStarChoice({ unitId, stars: Number(event.target.value) });
        setScopeChoice("");
        setVisibleCount(initialResultCount);
      }}>
        {[1, 2, 3].map(value => <option key={value} value={value}>{value} 星</option>)}
      </select></label>
      {mode === "guide" && forStars.length > 1 && <label>结算盘<select aria-label="结算盘" value={scope?.teamId} onChange={event => {
        setScopeChoice(event.target.value);
        setVisibleCount(initialResultCount);
      }}>
        {forStars.map(entry => <option key={entry.teamId} value={entry.teamId}>{scopeLabel(entry)}</option>)}
      </select></label>}
    </div>
    {canUseGuide && <div className="conditional-gear-modes" role="group" aria-label="样本范围">
      <button type="button" aria-pressed={mode === "global"} onClick={() => changeMode("global")}>不限阵容</button>
      <button type="button" aria-pressed={mode === "guide"} onClick={() => changeMode("guide")}>攻略样本</button>
    </div>}
    {mode === "guide" && scope && forStars.length === 1 &&
      <span className="conditional-gear-cohort">{scopeLabel(scope)}</span>}
    {(global || (mode === "guide" && scope)) && <Popover>
      <PopoverTrigger asChild>
        <button className="conditional-gear-source-button" type="button" aria-label="三件套数据来源" title="三件套数据来源">
          <Info size={15} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="conditional-gear-source" align="end">
        <p>{meanHint}</p>
        {global ? <>
          <p>{global.patch} · 近 {global.windowDays} 天 · {queryDate.format(new Date(global.asOf))} 查询</p>
          {!fixedWearer && <p>无重复棋子 · 最多 {global.limit} 组</p>}
          <a href={global.sourceUrl} target="_blank" rel="noreferrer">原始查询</a>
        </> : scope && <>
          <p>{conditionalGearSource.patch} · 近 {conditionalGearSource.windowDays} 天 · {conditionalGearSource.date}</p>
          <a href={scope.url} target="_blank" rel="noreferrer">原始样本</a>
        </>}
      </PopoverContent>
    </Popover>}</div>}
    {rows.length > 0 ? <>
      <table>
        <thead>
          <tr><th scope="col">{resultLabel}</th>
            <th scope="col" aria-sort={order === "games" ? "descending" : "none"}>
              <button type="button" onClick={() => setOrder("games")} title="按场数从高到低">场数</button>
            </th>
            <th scope="col" aria-sort={order === "mean" ? "ascending" : "none"}>
              <button type="button" onClick={() => setOrder("mean")} title={"按均名从低到高。" + meanHint}
                aria-describedby={title + "-mean"}>均名</button>
              <span className="sr-only" id={title + "-mean"}>{meanHint}</span>
            </th>
          </tr>
        </thead>
        <tbody>{sorted.slice(0, visibleCount).map(row =>
          <tr key={row.items.join("|")}>
            <td><div className="conditional-gear-build">{row.items.map((id, index) => {
              const gear = itemMap.get(id) ?? { id, name: conditionalGearItemNames[id] ?? id, description: "" };
              return <span key={index}><ItemIcon item={gear} size={24} />{itemName(gear)}</span>;
            })}</div></td>
            <td>{number.format(row.games)}</td>
            <td>{row.mean === null ? <span className="conditional-gear-small">—</span> : row.games < minGames
              ? <span className="conditional-gear-small"><small>少样本</small>{row.mean.toFixed(2)}</span>
              : row.mean.toFixed(2)}</td>
          </tr>)}
        </tbody>
      </table>
      {sorted.length > initialResultCount && <div className="conditional-gear-actions">
        {sorted.length > visibleCount && <button type="button" className="conditional-gear-more"
          onClick={() => setVisibleCount(value => value + extraResultCount)}>再看 {Math.min(extraResultCount, sorted.length - visibleCount)} 组</button>}
        {visibleCount > initialResultCount && <button type="button" className="conditional-gear-more"
          onClick={() => setVisibleCount(initialResultCount)}>收起</button>}
      </div>}
    </> : !hasSampleSource
      ? <p className="conditional-gear-empty" role="status">这期暂无可核对的三件套来源。</p>
      : mode === "global" && unit && active && !currentResult
      ? <p className="conditional-gear-empty" role="status">正在查三件套…</p>
      : mode === "global" && currentResult?.data === null
        ? <div className="conditional-gear-empty conditional-gear-error" role="status">
          <span>暂时取不到不限阵容的样本。</span>
          <button type="button" className="conditional-gear-more" onClick={() => setAttempt(count => count + 1)}>重试</button>
          {scope && <button type="button" className="conditional-gear-more" onClick={() => changeMode("guide")}>看攻略样本</button>}
        </div>
        : <p className="conditional-gear-empty" role="status">
          {global ? "暂无符合条件的三件套。" :
            unit ? `暂无${unit.name} ${stars} 星符合条件的攻略样本。` : "这件装备暂无已收录的三件套样本。"}
        </p>}
  </section>;
}
