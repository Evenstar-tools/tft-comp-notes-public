"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Minus, Search, X } from "lucide-react";
import { TraitBadge } from "@/components/Glyphs";
import { itemMap, traitMap, unitMap } from "@/data";
import catalog from "@/data/medley-groups.json";
import type { MedleyBoardPiece, MedleyGuideFit, MedleySyncMeta } from "@/domain/medley-fit";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import type { Unit } from "@/domain/types";
import { beijingDateTime } from "@/lib/beijing-time";

const fixed = unitMap.get(catalog.fixedUnit)!;
const collab = traitMap.get("collab")!;
const groups = catalog.groups.map(group => ({
  number: group.number,
  units: group.unitIds.map(id => unitMap.get(id)!).filter(Boolean),
}));
const candidateIds = new Set([fixed.id, ...catalog.groups.flatMap(group => group.unitIds)]);
const unitNames = [...candidateIds]
  .filter(id => unitMap.has(id))
  .map(id => ({
    id,
    names: unitSearchNames(unitMap.get(id)!).map(name => name.toLowerCase()),
  }));

const compactNames: Record<string, string> = {
  "renata-glasc": "烈娜塔",
  "nunu-willump": "努努",
  "twisted-fate": "卡牌",
  "miss-fortune": "女枪",
  "dr-mundo": "蒙多",
  "baron-nashor": "大龙",
};

function shortUnitName(id: string) {
  const unit = unitMap.get(id);
  return compactNames[id] ?? unit?.name ?? id;
}

function matchingUnits(term: string) {
  const exact = unitNames.filter(unit => unit.names.includes(term));
  const matched = exact.length ? exact : unitNames.filter(unit => unit.names.some(name => name.includes(term)));
  return new Set(matched.map(unit => unit.id));
}

function tierInfo(score: number) {
  if (score === 3) return { cls: "s3", text: "3/3 满配" };
  if (score === 2) return { cls: "s2", text: "2/3 推荐" };
  if (score === 1) return { cls: "s1", text: "1/3 可过渡" };
  return { cls: "s0", text: "备选重合" };
}

function SignalDots({ score }: { score: number }) {
  return <span className="medley-signal-dots" aria-hidden="true">
    {[0, 1, 2].map(index => <i key={index} className={index < score ? "on" : undefined} />)}
  </span>;
}

function UnitAvatar({ unit, carry }: { unit: Unit; carry?: boolean }) {
  return <div className={"medley-avatar cost-" + unit.cost}>
    <img src={unit.image} alt="" loading="lazy" decoding="async" />
    <span className="medley-cost-dot">{unit.cost}</span>
    {carry && <span className="medley-carry-tag">主C</span>}
  </div>;
}

function BoardPieceTile({ piece, fullWidth }: { piece: MedleyBoardPiece; fullWidth?: boolean }) {
  const unit = unitMap.get(piece.unitId);
  if (!unit) return null;
  const name = shortUnitName(piece.unitId);
  const badge = piece.isLateMedley ? `${unit.cost}费·合奏` : (piece.isMedley ? "合奏" : null);
  const cls = [
    "medley-roster-unit",
    piece.isLateMedley ? "is-late-medley" : (piece.isMedley ? "is-medley" : ""),
    fullWidth ? "is-full" : "",
  ].filter(Boolean).join(" ");

  return <div className={cls} title={`${unit.name} · ${unit.cost}费${badge ? " · " + badge : ""}`}>
    {badge && <span className="medley-roster-badge">{badge}</span>}
    <UnitAvatar unit={unit} carry={piece.isCarry} />
    <span className="medley-roster-name">{name}</span>
    <div className="medley-roster-items">
      {piece.items.slice(0, 3).map((itemId, itemIndex) => {
        const item = itemMap.get(itemId);
        return item?.image
          ? <img key={`${itemId}-${itemIndex}`} src={item.image} alt={item.name} title={item.name} width={18} height={18} loading="lazy" decoding="async" />
          : null;
      })}
    </div>
  </div>;
}

function MiniUnit({ id, suffix }: { id: string; suffix?: string }) {
  const unit = unitMap.get(id);
  if (!unit) return null;
  return <span className={"medley-mini-unit cost-" + unit.cost}>
    <img src={unit.image} alt="" width={22} height={22} loading="lazy" decoding="async" />
    <span>{shortUnitName(id)}{suffix ?? ""}</span>
  </span>;
}

function MedleyChecksStrip({ fit }: { fit: MedleyGuideFit }) {
  const finalMet = fit.finalIds.length >= 3;
  const handoff = fit.handoff;
  const handoffMet = handoff?.quality === "usable";
  const handoffLabel = handoff?.quality === "unverified" ? "接装待核"
    : handoff?.quality === "weaker" ? "同星单件偏弱" : "无输出装继承";
  const lateMet = fit.lateIds.length > 0 && finalMet;

  return <div className="medley-checks-strip" aria-label="三项适配判定">
    <div className={"medley-check-chip" + (finalMet ? " met" : "")}>
      <span className="medley-check-icon" aria-hidden="true">
        {finalMet ? <Check size={11} strokeWidth={3.2} /> : <Minus size={10} strokeWidth={2.8} />}
      </span>
      <span className="medley-check-title">终盘 {fit.finalIds.length} 张合奏</span>
      {!!fit.finalIds.length && <span className="medley-check-detail">{fit.finalIds.map(shortUnitName).join(" · ")}</span>}
      <span className="sr-only">{finalMet ? "达成" : "未达成"}</span>
    </div>

    <div className={"medley-check-chip" + (handoffMet ? " met" : "")}>
      <span className="medley-check-icon" aria-hidden="true">
        {handoffMet ? <Check size={11} strokeWidth={3.2} /> : <Minus size={10} strokeWidth={2.8} />}
      </span>
      <span className="medley-check-title">
        {handoffMet ? (handoff.fromId === handoff.toId ? "主C留输出装" : "同定位接装") : handoffLabel}
      </span>
      {handoffMet && <span className="medley-check-detail">
        <MiniUnit id={handoff.fromId} />
        {handoff.fromId === handoff.toId
          ? <span className="medley-handoff-note">留原装</span>
          : <>
            <ArrowRight size={13} className="medley-handoff-arrow" aria-hidden="true" />
            <span className="sr-only">交给</span>
            <MiniUnit id={handoff.toId} />
          </>}
        <span className="medley-mini-items">
          {handoff.itemIds.map((itemId, idx) => {
            const item = itemMap.get(itemId);
            const row = handoff.evidence?.find(sample => sample.itemId === itemId);
            const title = row && item
              ? `${item.name} · ${row.stars} 星 ${row.equipped.games.toLocaleString("zh-CN")} 场，均名 ${row.equipped.mean.toFixed(2)}。未带时 ${row.alternatives.mean.toFixed(2)}。`
              : item?.name;
            return item?.image
              ? <img key={`${itemId}-${idx}`} src={item.image} alt={item.name} title={title} width={20} height={20} loading="lazy" decoding="async" />
              : null;
          })}
        </span>
        {handoff.source === "guide" && <span className="medley-handoff-note">攻略换人</span>}
      </span>}
      <span className="sr-only">{handoffMet ? "达成" : "未达成"}</span>
    </div>

    <div className={"medley-check-chip" + (lateMet ? " met-gold" : "")}>
      <span className="medley-check-icon" aria-hidden="true">
        {lateMet ? <Check size={11} strokeWidth={3.2} /> : <Minus size={10} strokeWidth={2.8} />}
      </span>
      <span className="medley-check-title">{lateMet ? "4–5费加入仍开3" : "无4–5费开3"}</span>
      {!!fit.lateIds.length && <span className="medley-check-detail">
        {fit.lateIds.map(id => {
          const unit = unitMap.get(id);
          return unit ? <MiniUnit key={id} id={id} suffix={` (${unit.cost}费)`} /> : null;
        })}
      </span>}
      <span className="sr-only">{lateMet ? "达成" : "未达成"}</span>
    </div>
  </div>;
}

function FitCard({
  fit,
  pinned,
  onHover,
  onPin,
  onOpenDrawer,
}: {
  fit: MedleyGuideFit;
  pinned: boolean;
  onHover: (fit: MedleyGuideFit | null) => void;
  onPin: (fit: MedleyGuideFit) => void;
  onOpenDrawer: (fit: MedleyGuideFit, tab: "opening" | "final") => void;
}) {
  const tier = tierInfo(fit.score);
  return <article
    className={`medley-fit-card${fit.score === 3 ? " is-perfect" : ""}${pinned ? " is-pinned" : ""}`}
    onPointerEnter={event => { if (event.pointerType === "mouse") onHover(fit); }}
    onPointerLeave={() => onHover(null)}
  >
    <header className="medley-fit-head">
      <div className="medley-fit-title-group">
        <span className={`medley-tier-pill ${tier.cls}`}>
          <SignalDots score={fit.score} />
          <span>{tier.text}</span>
        </span>
        <button type="button" className="medley-fit-name-btn" aria-pressed={pinned} onClick={() => onPin(fit)}>
          {fit.title}
        </button>
        <span className="medley-pop-tag">{fit.finalBoard.length} 人口终盘</span>
      </div>
      <div className="medley-fit-actions">
        {fit.openingBoard.length > 0
          ? <button type="button" className="medley-act-btn" onClick={() => onOpenDrawer(fit, "opening")}>
            {fit.handoff?.source === "guide" ? "原过渡" : "过渡盘"}
          </button>
          : (fit.stageHref
            ? <a className="medley-act-btn" href={fit.stageHref}>过渡盘</a>
            : <span className="medley-act-muted">过渡待核</span>)}
        <a className="medley-act-btn primary" href={fit.finalHref} aria-label={"查看阵容：" + fit.title}>
          终盘攻略<ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </header>
    <div className={`medley-roster-strip${fit.finalBoard.length <= 8 ? " pop-8" : ""}`} aria-label="完整终盘阵容">
      {fit.finalBoard.map(piece => <BoardPieceTile key={piece.unitId} piece={piece} />)}
    </div>
    <MedleyChecksStrip fit={fit} />
  </article>;
}

function formatSyncTime(iso?: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return beijingDateTime.format(date);
}

export function MedleyLibrary({
  fitsByGroup,
  syncMeta,
}: {
  fitsByGroup: Record<number, MedleyGuideFit[]>;
  syncMeta: MedleySyncMeta;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "fit" | "full">("all");
  const [howOpen, setHowOpen] = useState(false);
  const [lockedGroupNum, setLockedGroupNum] = useState<number | null>(null);
  const [hoveredFit, setHoveredFit] = useState<MedleyGuideFit | null>(null);
  const [pinnedFit, setPinnedFit] = useState<MedleyGuideFit | null>(null);
  const [extrasExpanded, setExtrasExpanded] = useState(false);
  const [drawerState, setDrawerState] = useState<{ groupNum: number; fit: MedleyGuideFit; tab: "opening" | "final" } | null>(null);

  const drawerRef = useRef<HTMLDialogElement>(null);
  const drawerOpen = drawerState !== null;
  useEffect(() => {
    const dialog = drawerRef.current;
    if (!drawerOpen || !dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [drawerOpen]);

  const cleaned = query.trim().toLowerCase();
  const groupNumberMatch = /^(?:#|组合\s*|第\s*)?(\d+)\s*组?$/.exec(cleaned);
  const terms = groupNumberMatch ? [] : cleaned.split(/[\s、，,]+/).filter(Boolean);
  const matches = terms.map(matchingUnits);
  const fixedMatched = matches.some(units => units.has(fixed.id));

  const shownGroups = groups.filter(group => {
    const fits = fitsByGroup[group.number] ?? [];
    if (filterMode === "fit" && !fits.length) return false;
    if (filterMode === "full" && !fits.some(fit => fit.score === 3)) return false;
    if (groupNumberMatch) return group.number === Number(groupNumberMatch[1]);
    return matches.every(units => units.has(fixed.id) || group.units.some(unit => units.has(unit.id)));
  });

  const focusedGroup = lockedGroupNum !== null
    ? groups.find(group => group.number === lockedGroupNum) ?? null
    : (shownGroups.length === 1 && (Boolean(cleaned) || filterMode !== "all") ? shownGroups[0] : null);

  const focusedFits = focusedGroup ? (fitsByGroup[focusedGroup.number] ?? []) : [];
  const activeFit = focusedGroup ? (hoveredFit ?? pinnedFit) : null;
  const activeFinalSet = new Set(activeFit ? activeFit.finalIds : []);
  const activeLateSet = new Set(activeFit && activeFit.finalIds.length >= 3 ? activeFit.lateIds : []);
  const activeHandoffFrom = activeFit?.handoff?.quality === "usable" ? activeFit.handoff.fromId : null;
  const drawerHandoff = drawerState?.fit.handoff?.quality === "usable" ? drawerState.fit.handoff : undefined;

  function clearSearch() {
    setQuery("");
    setLockedGroupNum(null);
    setHoveredFit(null);
    setPinnedFit(null);
    setExtrasExpanded(false);
    inputRef.current?.focus();
  }

  function resetToAll() {
    setQuery("");
    setFilterMode("all");
    setLockedGroupNum(null);
    setHoveredFit(null);
    setPinnedFit(null);
    setExtrasExpanded(false);
  }

  function enterGroup(groupNum: number) {
    setLockedGroupNum(groupNum);
    setHoveredFit(null);
    setPinnedFit(null);
    setExtrasExpanded(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const syncTime = formatSyncTime(syncMeta.publishedAt);

  return <div className="medley-library">
    <div className="medley-page-top">
      <div>
        <a className="text-link medley-back" href="/traits?trait=collab"><ArrowLeft size={14} aria-hidden="true" />羁绊速查</a>
        <div className="medley-title"><TraitBadge trait={collab} size={32} /><h1>合奏组合</h1></div>
        <p className="medley-subtitle">
          <span>每局随机 1/40 组（各 {(catalog.probability * 100).toFixed(1)}%）</span>
          <span className="medley-dot" aria-hidden="true">·</span>
          <span>娑娜每局固定计入，上场 {collab.thresholds.join(" / ")} 名开档</span>
        </p>
      </div>
      <button
        type="button"
        className="medley-how-toggle"
        aria-expanded={howOpen}
        onClick={() => setHowOpen(open => !open)}
      >
        <span>合奏怎么玩 & 3 项判定</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
    </div>

    {howOpen && <section className="medley-how-panel" aria-label="合奏玩法与适配规则">
      <div>
        <h3>为什么看合奏适配？</h3>
        <p>合奏前期相当于额外经济海克斯，来牌顺就早开 3 合奏，灵感送的弈子复制体能省下买牌与刷新金币；缺关键牌或需要拆核心羁绊时，直接按原过渡走即可。</p>
      </div>
      <div className="medley-how-rules">
        <h3>三条直观判定（最多算 5 套，默认展前 3 套完整阵容）</h3>
        <div className="medley-how-rule"><span className="medley-how-tag">① 终盘 ≥ 3 张</span><span>成型终盘自带 3 张及以上合奏棋子，不用硬挂凑数牌即可稳开 3 合奏。</span></div>
        <div className="medley-how-rule"><span className="medley-how-tag">② 同定位接装</span><span>开局合奏打工位与终盘主 C 同定位，有至少一件输出装能接或能原样留用。按同补丁、同英雄、同星级的样本逐件比较。</span></div>
        <div className="medley-how-rule"><span className="medley-how-tag">③ 4–5 费开 3</span><span>后期补进 4–5 费合奏棋子后仍能保持 3 合奏，换下低费打工牌不掉合奏收益。</span></div>
      </div>
    </section>}

    <section className="medley-toolbar-card" role="search" aria-label="合奏组合搜索与筛选">
      <div className="medley-toolbar-row">
        <label className="medley-search" htmlFor="medley-hero-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            id="medley-hero-search"
            type="search"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setLockedGroupNum(null);
              setHoveredFit(null);
              setPinnedFit(null);
              setExtrasExpanded(false);
            }}
            aria-describedby="medley-search-hint"
            placeholder="搜英雄、外号或组号"
          />
          {!!query && <button type="button" className="medley-clear" aria-label="清除搜索" onClick={clearSearch}>
            <X size={16} aria-hidden="true" />
          </button>}
        </label>
        <div className="medley-segmented" role="group" aria-label="合奏组筛选">
          <button type="button" aria-pressed={filterMode === "all"} onClick={() => { setFilterMode("all"); setLockedGroupNum(null); }}>全部 40 组</button>
          <button type="button" aria-pressed={filterMode === "fit"} onClick={() => { setFilterMode("fit"); setLockedGroupNum(null); }}>仅看适配</button>
          <button type="button" aria-pressed={filterMode === "full"} onClick={() => { setFilterMode("full"); setLockedGroupNum(null); }}>有 3/3 满配</button>
        </div>
      </div>
      <div className="medley-toolbar-sub">
        <span id="medley-search-hint">输入多个英雄用空格隔开，也支持直接输入组号（如 18、28）{fixedMatched ? ` · ${fixed.name}属于每组，上场才计数` : ""}</span>
        <span className="medley-count" role="status">
          {focusedGroup
            ? <>当前聚焦 <strong>第 {focusedGroup.number} 组</strong> · {focusedFits.length} 套适配</>
            : <>共 <strong>{shownGroups.length}</strong> / {groups.length} 组 · 点击任意组合看完整阵容</>}
        </span>
      </div>
    </section>

    {focusedGroup ? (() => {
      const top3 = focusedFits.slice(0, 3);
      const rest = focusedFits.slice(3, 5);
      const fixedLinked = Boolean(activeFit && activeFinalSet.has(fixed.id));
      return <div className="medley-focus-wrap">
        <section className="medley-pool-strip" aria-label="本局合奏搭档">
          <div className="medley-pool-meta">
            <div className="medley-pool-kicker">
              <span className="medley-group-num">第 {focusedGroup.number} 组</span>
              <button type="button" className="medley-pool-back" onClick={resetToAll}>← 全部 40 组</button>
            </div>
            <h2>本局合奏搭档</h2>
            <p className={"medley-pool-hint" + (activeFit ? " is-linked" : "")}>
              {activeFit ? `正在对照：${activeFit.title.split(" · ")[0]}` : "点选下方阵容，查看该留哪些棋子"}
            </p>
          </div>
          <div className="medley-pool-units">
            {focusedGroup.units.map(unit => {
              const searched = matches.some(ids => ids.has(unit.id));
              let linkCls = "";
              let roleTag = "";
              if (activeFit) {
                if (activeLateSet.has(unit.id)) { linkCls = "is-linked-late"; roleTag = `${unit.cost}费开3`; }
                else if (activeHandoffFrom === unit.id && !activeFinalSet.has(unit.id)) { linkCls = "is-linked"; roleTag = "打工接装"; }
                else if (activeFinalSet.has(unit.id)) { linkCls = "is-linked"; roleTag = activeHandoffFrom === unit.id ? "留牌+接装" : "终盘留牌"; }
                else { linkCls = "is-dimmed"; }
              }
              return <a
                key={unit.id}
                href={"/heroes?" + new URLSearchParams({ unit: unit.id })}
                className={`medley-pool-unit${searched && !activeFit ? " is-searched" : ""}${linkCls ? " " + linkCls : ""}`}
                title={`${unit.name} · ${unit.cost} 费`}
              >
                {roleTag && <span className="medley-pool-role">{roleTag}</span>}
                <UnitAvatar unit={unit} />
                <span className="medley-pool-name">{shortUnitName(unit.id)}</span>
              </a>;
            })}
          </div>
          <div className="medley-pool-fixed">
            <a
              href={"/heroes?" + new URLSearchParams({ unit: fixed.id })}
              className={`medley-pool-unit is-fixed${fixedLinked ? " is-linked" : ""}`}
              title={`${fixed.name} · 每组固定计入`}
            >
              {fixedLinked && <span className="medley-pool-role">终盘留</span>}
              <UnitAvatar unit={fixed} />
              <span className="medley-pool-name">{shortUnitName(fixed.id)}</span>
            </a>
            <div className="medley-pool-fixed-text">
              <strong>固定计入</strong>
              <span>每组通用 · {collab.thresholds.join("/")}开档</span>
            </div>
          </div>
        </section>

        {focusedFits.length ? <>
          <div className="medley-fits-bar">
            <div className="medley-fits-bar-left">
              <h3>适配阵容</h3>
              <span>
                {rest.length
                  ? `展示最适配前 3 套完整阵容（共 ${focusedFits.length} 套候选）`
                  : `共 ${focusedFits.length} 套适配阵容，已完整展示`}
              </span>
            </div>
            <div className="medley-legend-row" aria-hidden="true">
              <span className="medley-legend-item"><i className="medley-lg-swatch is-medley" />本组合奏重合</span>
              <span className="medley-legend-item"><i className="medley-lg-swatch is-late" />4–5 费合奏开 3</span>
              <span className="medley-legend-item"><i className="medley-lg-swatch is-carry" />主C 与核心装</span>
            </div>
          </div>

          <div className="medley-fit-cards">
            {top3.map(fit => <FitCard
              key={fit.sectionId + ":" + fit.teamId}
              fit={fit}
              pinned={pinnedFit?.sectionId === fit.sectionId}
              onHover={setHoveredFit}
              onPin={target => setPinnedFit(prev => prev?.sectionId === target.sectionId ? null : target)}
              onOpenDrawer={(target, tab) => setDrawerState({ groupNum: focusedGroup.number, fit: target, tab })}
            />)}
          </div>

          {rest.length > 0 && <section className="medley-extra-box" aria-label="备选适配阵容">
            <div className="medley-extra-head">
              <span>另外 {rest.length} 套备选适配阵容（第 4–{focusedFits.length} 套）</span>
              <button type="button" className="medley-extra-toggle" onClick={() => setExtrasExpanded(v => !v)}>
                {extrasExpanded ? "收起备选 ▴" : `展开全部 ${rest.length} 套完整阵容 ▾`}
              </button>
            </div>
            {extrasExpanded
              ? <div className="medley-extra-expanded">
                {rest.map(fit => <FitCard
                  key={fit.sectionId + ":" + fit.teamId}
                  fit={fit}
                  pinned={pinnedFit?.sectionId === fit.sectionId}
                  onHover={setHoveredFit}
                  onPin={target => setPinnedFit(prev => prev?.sectionId === target.sectionId ? null : target)}
                  onOpenDrawer={(target, tab) => setDrawerState({ groupNum: focusedGroup.number, fit: target, tab })}
                />)}
              </div>
              : <div className="medley-extra-compact">
                {rest.map(fit => {
                  const tier = tierInfo(fit.score);
                  return <button key={fit.sectionId} type="button" className="medley-extra-row" onClick={() => setExtrasExpanded(true)}>
                    <span className="medley-extra-row-left">
                      <span className={`medley-tier-pill ${tier.cls}`}><SignalDots score={fit.score} /><span>{tier.text}</span></span>
                      <strong>{fit.title}</strong>
                      <span className="medley-extra-thumbs" aria-hidden="true">
                        {fit.finalBoard.slice(0, 5).map(piece => {
                          const unit = unitMap.get(piece.unitId);
                          return unit ? <img key={piece.unitId} className={"cost-" + unit.cost} src={unit.image} alt="" width={24} height={24} loading="lazy" decoding="async" /> : null;
                        })}
                      </span>
                    </span>
                    <span className="medley-extra-meta">终盘合奏 {fit.finalIds.length} 张 · 展开完整阵容 ▾</span>
                  </button>;
                })}
              </div>}
          </section>}
        </> : <div className="medley-empty-box">
          <p>{syncMeta.editionMatched ? "这组暂无已核对的适配阵容，可按常规运营过渡。" : "当前站点攻略库非 S19 PBE 版本，暂未自动匹配合奏阵容。"}</p>
          <button type="button" onClick={resetToAll}>返回全部 40 组</button>
        </div>}
      </div>;
    })() : shownGroups.length ? <div className="medley-groups-grid" aria-label="合奏组合列表">
      {shownGroups.map(group => {
        const fits = fitsByGroup[group.number] ?? [];
        const top = fits[0];
        const hasPerfect = fits.some(fit => fit.score === 3);
        const badgeCls = hasPerfect ? "is-gold" : (fits.length ? "is-ok" : "is-none");
        const badgeText = hasPerfect ? `含 3/3 满配 · ${fits.length} 套` : (fits.length ? `${fits.length} 套适配` : "暂无适配");
        return <article
          key={group.number}
          className="medley-group-card"
          tabIndex={0}
          role="button"
          onClick={() => enterGroup(group.number)}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              enterGroup(group.number);
            }
          }}
        >
          <header className="medley-gc-head">
            <div className="medley-gc-left">
              <span className="medley-group-num">第 {group.number} 组</span>
              <span className="medley-gc-sub">{group.units.length} 位搭档</span>
            </div>
            <span className={`medley-gc-badge ${badgeCls}`}>{badgeText}</span>
          </header>
          <div className={group.units.length === 5 ? "medley-gc-roster five" : "medley-gc-roster"}>
            {group.units.map(unit => {
              const matched = matches.some(ids => ids.has(unit.id));
              return <div key={unit.id} className={"medley-gc-unit" + (matched ? " is-matched" : "")}>
                <UnitAvatar unit={unit} />
                <span>{shortUnitName(unit.id)}</span>
              </div>;
            })}
          </div>
          <footer className="medley-gc-foot">
            {top ? <>
              <div className="medley-gc-top-fit">
                <span className={`medley-tier-pill is-compact ${tierInfo(top.score).cls}`}><SignalDots score={top.score} /></span>
                <strong title={top.title}>{top.title}</strong>
              </div>
              <span className="medley-gc-enter">看完整阵容 →</span>
            </> : <>
              <span className="medley-gc-muted">点击查看搭档详情</span>
              <span className="medley-gc-enter">进入 →</span>
            </>}
          </footer>
        </article>;
      })}
    </div> : <div className="medley-empty-box">
      <p>没有找到符合条件的合奏组合。</p>
      <button type="button" onClick={resetToAll}>清除筛选</button>
    </div>}

    <footer className="medley-source">
      <span>
        {syncMeta.editionMatched
          ? `已按当前公开攻略库自动计算（共 ${syncMeta.guideCount} 套 S19 阵容${syncTime ? ` · 同步于 ${syncTime}` : ""}），新增或更新攻略发布后自动重算`
          : "合奏表对应 S19 PBE，与当前攻略版本不同时自动停用适配推荐"}
      </span>
      <span className="medley-source-links">
        <span>资料核对 {catalog.checkedOn}</span>
        <a href={catalog.sources.maomi} target="_blank" rel="noreferrer">猫咪 TFT <ArrowUpRight size={13} aria-hidden="true" /></a>
        <a href={catalog.sources.tftips} target="_blank" rel="noreferrer">TFTips 对照 <ArrowUpRight size={13} aria-hidden="true" /></a>
      </span>
    </footer>

    {drawerState && <dialog ref={drawerRef} className="medley-drawer" aria-label={drawerState.fit.title}
      onCancel={event => { event.preventDefault(); setDrawerState(null); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
          setDrawerState(null);
        }
      }}>
        <div className="medley-drawer-head">
          <div>
            <h3>{drawerState.fit.title}</h3>
            <p>
              第 {drawerState.groupNum} 组合奏适配 · {drawerState.tab === "opening"
                ? (drawerState.fit.stageLabel || "前期过渡盘")
                : `${drawerState.fit.finalBoard.length} 人口成型终盘`}
            </p>
          </div>
          <button type="button" className="medley-drawer-close" onClick={() => setDrawerState(null)} aria-label="关闭">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="medley-drawer-tabs">
          {drawerState.fit.openingBoard.length > 0 && <button
            type="button"
            className={"medley-drawer-tab" + (drawerState.tab === "opening" ? " active" : "")}
            onClick={() => setDrawerState(prev => prev ? { ...prev, tab: "opening" } : null)}
          >
            过渡盘
          </button>}
          <button
            type="button"
            className={"medley-drawer-tab" + (drawerState.tab === "final" ? " active" : "")}
            onClick={() => setDrawerState(prev => prev ? { ...prev, tab: "final" } : null)}
          >
            终盘成型
          </button>
        </div>
        <div className="medley-drawer-body">
          <div className="medley-drawer-grid">
            {(drawerState.tab === "opening" ? drawerState.fit.openingBoard : drawerState.fit.finalBoard)
              .map(piece => <BoardPieceTile key={piece.unitId} piece={piece} fullWidth />)}
          </div>
          <div className="medley-drawer-note">
            {drawerState.tab === "opening"
              ? (drawerHandoff
                ? <>过渡思路：前期优先留合奏牌开 3 合奏，由 <strong>{shortUnitName(drawerHandoff.fromId)}</strong> 携带 {drawerHandoff.itemIds.map(id => itemMap.get(id)?.name ?? id).join("、")}{drawerHandoff.fromId === drawerHandoff.toId ? " 留到终盘。" : <> 打工，后期交给主 C <strong>{shortUnitName(drawerHandoff.toId)}</strong>。</>}</>
                : "过渡思路：前期用重合的合奏低费牌吃灵感收益，稳血上人口后再按终盘替换。")
              : <>终盘状态：共 {drawerState.fit.finalBoard.length} 人口，包含 <strong>{drawerState.fit.finalIds.length} 张</strong>本组合奏棋子（{drawerState.fit.finalIds.map(shortUnitName).join("、") || "无"}）。{drawerState.fit.finalIds.length >= 3 && drawerState.fit.lateIds.length > 0 && <>高费合奏 <strong>{drawerState.fit.lateIds.map(shortUnitName).join("、")}</strong> 进场后仍可保持 3 合奏。</>}</>}
          </div>
        </div>
        <div className="medley-drawer-foot">
          {drawerState.tab === "opening" && drawerState.fit.stageHref
            ? <a className="medley-act-btn primary" href={drawerState.fit.stageHref}>前往过渡攻略页<ArrowUpRight size={14} aria-hidden="true" /></a>
            : <a className="medley-act-btn primary" href={drawerState.fit.finalHref}>前往终盘攻略页<ArrowUpRight size={14} aria-hidden="true" /></a>}
          <button type="button" className="medley-act-btn" onClick={() => setDrawerState(null)}>收起</button>
        </div>
    </dialog>}
  </div>;
}
