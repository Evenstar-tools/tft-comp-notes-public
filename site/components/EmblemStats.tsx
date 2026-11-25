"use client";

import { ChevronDown } from "lucide-react";
import { Tooltip } from "radix-ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { itemMap, unitMap } from "@/data";
import currentPatch from "@/data/current-patch.json";
import snapshot from "@/data/emblem-stats.json";
import { itemReference } from "@/data/item-reference";
import { compareGearWearerSamples, filterEmblems, gearFilters, gearHref, selectableWearers, type GearFilters, type GearOrder } from "@/domain/gear-library";
import { gearSampleMinimum } from "@/domain/gear-wearer";
import { guideLink } from "@/domain/guide-reading";
import { emblemItemId } from "@/domain/links";
import type { Item } from "@/domain/types";
import { ItemIcon } from "./ItemIcon";
import { EmblemEntryPosition } from "./EmblemEntryPosition";
import { usePageReturnView } from "./usePageReturnView";
import { WearerExclusion } from "./WearerExclusion";
import { GearCategoryEmpty, GearCategoryNav } from "./GearCategoryNav";
import { GearWearerSearch } from "./GearWearerSearch";

type Sample = { games: number; mean: number | null; winRate: number | null };
type Holder = { unitId: string; games: number; mean: number; winRate: number; delta: number | null };
type Emblem = Sample & { sourceId: string; holders: Holder[] };
type Order = "mean" | "winRate" | "games";
type HolderOptions = { order: Order; lowCosts: boolean; more: boolean };
type EmblemView = GearFilters & { holders: HolderOptions };
type EmblemVisit = { url: string; view: EmblemView; top: number; panels: number[] };
export type EmblemGuideUse = { unitId: string; sectionId: string; teamId: string; title: string; board: string };
const defaultHolders: HolderOptions = { order: "mean", lowCosts: false, more: false };

const data: Record<string, Emblem> = snapshot.emblems;
const visitKey = "emblemLibraryVisit";
const openEmblem = (trait: string | null | undefined) => trait && Object.hasOwn(data, trait) ? trait : "";

const number = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const time = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(snapshot.updatedAt));
const displayMinimum = gearSampleMinimum("emblem", snapshot.mode === "PBE", snapshot.minGames);
const currentPatchVersion = currentPatch.metaTftPatch
  ? currentPatch.metaTftPatch.patch + (currentPatch.metaTftPatch.bPatch ?? "") : "";
const isPreviousPatch = Boolean(currentPatchVersion && snapshot.patch && snapshot.patch !== currentPatchVersion);
const hasSample = (sample: Sample) => sample.games >= displayMinimum;
const isSmallSample = (sample: Sample) => hasSample(sample) && sample.games < snapshot.minGames;

function Mean({ sample }: { sample: Sample }) {
  const value = hasSample(sample) ? sample.mean : null;
  const qualified = value !== null && sample.games >= snapshot.minGames;
  const tone = qualified && value < 4 ? "good" : qualified && value >= 4.5 ? "weak" : undefined;
  return <strong className={tone}>{value?.toFixed(2) ?? "—"}</strong>;
}
function Win({ sample }: { sample: Sample }) {
  return <strong>{hasSample(sample) && sample.winRate != null ? percent.format(sample.winRate) : "—"}</strong>;
}
function Wearer({ id }: { id: string }) {
  const unit = unitMap.get(id);
  return unit ? <span className="emblem-wearer">
    <img src={unit.image} alt="" width={26} height={26} loading="lazy" className={"cost-" + unit.cost} />
    <span>{unit.name}</span>
  </span> : <span>—</span>;
}
function deltaLabel(n: number | null) {
  if (n === null) return "—";
  return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2);
}

function EmblemAttributes({ item }: { item: Item }) {
  const reference = itemReference.items[item.id];
  return <>
    {!!reference?.stats.length && <dl className="emblem-attributes" aria-label="装备属性">
      {reference.stats.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>}
    <p className="emblem-effect">{reference?.description || item.description}</p>
  </>;
}

function EmblemSourceLink({ entry }: { entry: Emblem }) {
  return <a href={"https://www.metatft.com/items/" + encodeURIComponent(entry.sourceId) + "?set=TFTSet19"} target="_blank" rel="noreferrer">原始战绩</a>;
}

function Holders({ traitId, item, entry, highlight, guideHref, options, onOptions }: {
  traitId: string; item: Item; entry: Emblem; highlight?: string; guideHref?: string;
  options: HolderOptions; onOptions: (options: HolderOptions) => void;
}) {
  const { order: holderSort, lowCosts, more } = options;
  const rows = entry.holders.filter(holder => hasSample(holder) && (!lowCosts || (unitMap.get(holder.unitId)?.cost ?? 99) <= 3));
  if (holderSort === "winRate") rows.sort((a,b) => b.winRate - a.winRate || a.mean - b.mean);
  if (holderSort === "games") rows.sort((a,b) => b.games - a.games || a.mean - b.mean);
  const count = 8;
  const visible = more ? rows : rows.slice(0,count);
  const highlightedHolder = highlight && rows.find(row => row.unitId === highlight);
  const tableRows = highlightedHolder && !visible.includes(highlightedHolder) ? [...visible, highlightedHolder] : visible;
  const seraphineGuide = traitId === "k-da" && entry.holders.some(row => row.unitId === "seraphine") && guideHref;
  return <div className="emblem-detail" id={"wearers-" + traitId}>
    <section className="emblem-equipment-summary" aria-label={item.name + "装备属性"}>
      <EmblemAttributes item={item} />
      {seraphineGuide && <a className="text-link emblem-guide-link" href={seraphineGuide}>K/DA转芬妮攻略</a>}
    </section>
    <div className="emblem-holder-list">
      <div className="emblem-detail-tools">
        <h2>使用者</h2>
        <select aria-label="使用者排序" value={holderSort} onChange={event => onOptions({ ...options, order: event.target.value as Order })}>
          <option value="mean">均名最低</option><option value="winRate">登顶率最高</option><option value="games">场数最多</option>
        </select>
        <label className="emblem-cost-filter"><input type="checkbox" checked={lowCosts} onChange={event => onOptions({ ...options, lowCosts: event.target.checked })} />只看 1–3 费</label>
      </div>
      {tableRows.length ? <table aria-label="纹章使用者统计" className="emblem-holders">
        <thead><tr><th scope="col">棋子</th><th scope="col">均名</th><th scope="col">登顶率</th><th scope="col">场数</th><th scope="col" title="携带纹章的均名减该棋子总体均名">均名变化</th></tr></thead>
        <tbody>{tableRows.map(row => <tr key={row.unitId} data-highlight={row.unitId === highlight || undefined}
          data-small-sample={isSmallSample(row) || undefined}>
          <th scope="row"><Wearer id={row.unitId} /></th>
          <td><Mean sample={row} /></td><td><Win sample={row} /></td>
          <td>{number.format(row.games)}{isSmallSample(row) && <span className="emblem-small-sample">少样本</span>}</td>
          <td>{deltaLabel(row.delta)}</td>
        </tr>)}</tbody>
      </table> : <p className="emblem-empty">暂无符合条件的携带记录</p>}
      <div className="emblem-detail-bottom">
        {rows.length > count && <button type="button" aria-expanded={more} className="text-link" onClick={() => onOptions({ ...options, more: !more })}>{more ? "收起更多" : "展开全部 " + rows.length + " 人"}</button>}
        <EmblemSourceLink entry={entry} />
      </div>
    </div>
  </div>;
}

function WearerEmblemDetails({ traitId, item, entry, uses, returnHref }: {
  traitId: string; item: Item; entry: Emblem; uses: EmblemGuideUse[]; returnHref: string;
}) {
  const hasGuides = uses.length > 0;
  return <div className="emblem-detail" data-attributes-only={!hasGuides || undefined} id={"wearers-" + traitId}>
    <section className="emblem-equipment-summary" aria-label={item.name + "装备属性"}>
      <EmblemAttributes item={item} />
      {!hasGuides && <div className="emblem-detail-bottom"><EmblemSourceLink entry={entry} /></div>}
    </section>
    {hasGuides && <div className="emblem-holder-list">
      <div className="emblem-detail-tools"><h2>配装攻略</h2></div>
      <ul className="emblem-wearer-guides">{uses.map(use => <li key={use.sectionId + "/" + use.teamId}>
        <a className="text-link" href={guideLink(use.sectionId, use.teamId, returnHref)}>{use.title}</a>
        {use.board && use.title !== use.board && <span>{use.board}</span>}
      </li>)}</ul>
      <div className="emblem-detail-bottom"><EmblemSourceLink entry={entry} /></div>
    </div>}
  </div>;
}

export function EmblemStats({ traitId, holderId, initialFilters, guideHref, guideUses }: {
  traitId?: string; holderId?: string; initialFilters: GearFilters; guideHref?: string;
  guideUses: Record<string, EmblemGuideUse[]>;
}) {
  const [view, setView] = usePageReturnView<EmblemView>(visitKey, { ...initialFilters, holders: defaultHolders });
  const filters = { ...initialFilters, ...view, order: gearFilters({ order: view.order }).order };
  const { query, order, excluded, wearer } = filters;
  const selectedUnit = unitMap.get(wearer);
  const searchInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(openEmblem(traitId));
  const clickedRow = useRef<{ element: HTMLButtonElement; top: number; pushed?: boolean } | null>(null);
  const restoreTop = useRef<number | undefined>(undefined);
  useEffect(() => {
    function restore() {
      if (location.pathname !== "/emblems") return;
      const params = Object.fromEntries(new URLSearchParams(location.search));
      const visit = history.state?.[visitKey] as EmblemVisit | undefined;
      const saved = visit?.url === location.href ? visit : undefined;
      restoreTop.current = saved?.top;
      setOpen(openEmblem(params.trait));
      setView({ ...gearFilters(params), holders: saved?.view.holders ?? defaultHolders });
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [setView]);
  useLayoutEffect(() => {
    const top = restoreTop.current;
    restoreTop.current = undefined;
    if (top !== undefined) {
      window.scrollTo({ top, behavior: "instant" });
      const frame = requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
      return () => cancelAnimationFrame(frame);
    }
    const row = clickedRow.current;
    clickedRow.current = null;
    // 想看的纹章上方可能刚收起一整块使用者列表。
    if (row) window.scrollBy({ top: row.element.getBoundingClientRect().top - row.top, behavior: "instant" });
    if (row?.pushed) rememberVisit(view);
  }, [open, view]);

  const visible = filterEmblems(query).flatMap(([id, entry]) => {
    const sample = selectedUnit ? entry.holders.find(holder => holder.unitId === wearer) : entry;
    return sample ? [{ id, entry, sample }] : [];
  }).sort((a, b) => {
    if (selectedUnit) return compareGearWearerSamples(a.sample, b.sample, order, displayMinimum);
    if (order === "games") return b.sample.games - a.sample.games;
    if (hasSample(a.sample) !== hasSample(b.sample)) return Number(hasSample(b.sample)) - Number(hasSample(a.sample));
    return order === "wins" ? (b.sample.winRate ?? -1) - (a.sample.winRate ?? -1) : (a.sample.mean ?? 9) - (b.sample.mean ?? 9);
  });

  function resultHref(next: string, nextFilters: GearFilters) {
    const highlight = next && next === traitId ? holderId : undefined;
    return gearHref("emblems", nextFilters, {
      trait: next || undefined, unit: highlight,
    });
  }
  function updateUrl(next: string, nextFilters: GearFilters) {
    window.history.replaceState(window.history.state, "", resultHref(next, nextFilters));
  }
  function changeFilters(next: GearFilters) {
    setView({ ...next, holders: view.holders });
    updateUrl(open, next);
  }

  return <div className="emblem-page" data-wearer-view={selectedUnit ? "" : undefined}>
    <EmblemEntryPosition traitId={traitId} holderId={holderId} />
    <header className="page-heading emblem-heading">
      <h1>装备图鉴</h1>
      <div className="emblem-catalog-tabs"><GearCategoryNav current="emblems" filters={filters} /></div>
      <details className="emblem-method">
        <summary>
          <span>数据批次 {snapshot.mode} {snapshot.patch}</span>
          {isPreviousPatch && <span className="emblem-stale-badge">上一版</span>}
        </summary>
        <div className="emblem-method-panel">
          <p>{snapshot.set} · 近 {snapshot.days} 天 · <time dateTime={snapshot.updatedAt}>{time}</time>（北京时间）</p>
          <p>最佳使用者 ≥ {snapshot.minGames} 场；均名变化 = 携装均名 − 总体均名。</p>
          <a href="https://www.metatft.com/items?set=TFTSet19" target="_blank" rel="noreferrer">MetaTFT 数据</a>
          <a href="https://www.datatft.com/explorerForPBE" target="_blank" rel="noreferrer">DataTFT 检索</a>
        </div>
      </details>
    </header>
    <div className="emblem-toolbar">
      <GearWearerSearch filters={filters} onChange={changeFilters} label="搜索羁绊、纹章或英雄" inputRef={searchInput} />
      <label className="emblem-select"><span className="sr-only">转职排行排序</span><select aria-label="转职排行排序" value={order}
        onChange={event => changeFilters({ ...filters, order: event.target.value as GearOrder })}>
        <option value="mean">均名最低</option><option value="wins">登顶率最高</option><option value="games">场数最多</option>
      </select></label>
      {!selectedUnit && <WearerExclusion units={selectableWearers} excluded={excluded} onChange={excluded => changeFilters({ ...filters, excluded })} />}
    </div>
    {visible.length > 0 && <div className="emblem-column-head" aria-hidden="true">
      <span>纹章</span><span>均名</span><span>登顶率</span><span>场数</span>
      {!selectedUnit && (visible.some(({ id }) => id !== open)
        ? <span className="emblem-best-heading" title={`满 ${snapshot.minGames} 场，按均名排序`}>最佳使用者<small>均名 · 场数</small></span>
        : <span />)}
      <span />
    </div>}
    <Tooltip.Provider delayDuration={180} disableHoverableContent><ol className="emblem-results">
      {visible.map(({ id, entry, sample }) => {
        const item = itemMap.get(emblemItemId(id));
        if (!item) return null;
        const holders = entry.holders.filter(holder => holder.unitId !== excluded);
        const expanded = open === id;
        const smallSample = isSmallSample(sample);
        const best = expanded || selectedUnit ? [] : holders.filter(holder => holder.games >= snapshot.minGames && unitMap.has(holder.unitId))
          .sort((a, b) => a.mean - b.mean || b.games - a.games).slice(0, 3);
        return <li key={id} className="emblem-result">
          <Tooltip.Root>
            <button type="button" className="emblem-row" data-trait={id} data-small-sample={smallSample || undefined} aria-expanded={expanded}
              aria-controls={expanded ? "wearers-" + id : undefined} onClick={event => {
                const element = event.currentTarget;
                clickedRow.current = { element, top: element.getBoundingClientRect().top, pushed: !!selectedUnit };
                const next = expanded ? "" : id;
                setView({ ...view, holders: defaultHolders });
                setOpen(next);
                if (selectedUnit) {
                  rememberVisit(view);
                  history.pushState({ ...history.state, [visitKey]: null }, "", resultHref(next, filters));
                } else {
                  updateUrl(next, filters);
                }
              }}>
              <span className="emblem-identity">
                {expanded ? <ItemIcon item={item} size={32} /> : <Tooltip.Trigger asChild>
                  <span className="emblem-icon-trigger"><ItemIcon item={item} size={32} /></span>
                </Tooltip.Trigger>}
                <span>{item.name}</span>
              </span>
              <span className="emblem-metric"><Mean sample={sample} /><small>均名</small></span>
              <span className="emblem-metric"><Win sample={sample} /><small>登顶率</small></span>
              <span className="emblem-count">{number.format(sample.games)}<small className={smallSample ? "sr-only" : undefined}>场数</small>
                {smallSample && <span className="emblem-small-sample">少样本</span>}
              </span>
              {!expanded && !selectedUnit && <span className="emblem-best">
                <small className="sr-only">最佳使用者</small>
                {best.length ? best.map(holder => <span key={holder.unitId} className="emblem-best-entry">
                  <Wearer id={holder.unitId} /><span className="emblem-best-mean"><b>{holder.mean.toFixed(2)}</b><small>{number.format(holder.games)} 场</small></span>
                </span>) : <span className="emblem-best-empty" title={`暂无满 ${snapshot.minGames} 场的使用者`} aria-label={`暂无满 ${snapshot.minGames} 场的使用者`}>—</span>}
              </span>}
              <ChevronDown size={15} className="emblem-chevron" aria-hidden />
            </button>
            {!expanded && <Tooltip.Portal>
              <Tooltip.Content side="top" align="start" alignOffset={12} sideOffset={4} collisionPadding={12} className="emblem-equipment-tooltip">
                <div className="emblem-tooltip-title"><ItemIcon item={item} size={28} /><strong>{item.name}</strong></div>
                <EmblemAttributes item={item} />
              </Tooltip.Content>
            </Tooltip.Portal>}
          </Tooltip.Root>
          {expanded && (selectedUnit
            ? <WearerEmblemDetails traitId={id} item={item} entry={entry} returnHref={resultHref(id, filters)}
                uses={(guideUses[item.id] ?? []).filter(use => use.unitId === wearer)} />
            : <Holders traitId={id} item={item} entry={{ ...entry, holders }} highlight={id === traitId ? holderId : undefined} guideHref={guideHref}
                options={view.holders} onOptions={options => setView({ ...view, holders: options })} />)}
        </li>;
      })}
    </ol></Tooltip.Provider>
    {!visible.length && (selectedUnit && !query.trim()
      ? <p className="emblem-empty" role="status">暂无{selectedUnit.name}的纹章携带记录。</p>
      : <GearCategoryEmpty current="emblems" filters={filters} onClear={() => {
          changeFilters({ ...filters, query: "" });
          searchInput.current?.focus();
        }} />)}
  </div>;
}

function rememberVisit(view: EmblemView) {
  const visit: EmblemVisit = { url: location.href, view, top: scrollY, panels: [] };
  history.replaceState({ ...history.state, [visitKey]: visit }, "");
}
