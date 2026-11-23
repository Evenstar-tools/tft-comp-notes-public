"use client";
import { useEffect, useMemo, useState } from "react";
import { itemMap, season, unitMap } from "@/data";
import { hasUnlockCondition, unlockText } from "@/domain/unlocks";
import { emptyTeam, usedPopulation } from "@/domain/team";
import { independentDraft, parseRoster } from "@/domain/roster-import";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import type { Team } from "@/domain/types";
import { request } from "./api";

type Choice = { section: string; sectionId: string; appendable: boolean; team: Team };
export function QuickImport({ dirty, busy, activeStage, hasStagePieces, allowCatalog, onClose, onImport, onFillStage }: {
  dirty: boolean; busy: boolean; activeStage: string; hasStagePieces: boolean; allowCatalog: boolean;
  onClose: () => void; onImport: (draft: Team) => void; onFillStage: (draft: Team) => void;
}) {
  const [mode, setMode] = useState<"text" | "library">("text");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [selected, select] = useState("");
  const [destination, setDestination] = useState<"copy" | "variant" | "stage">("copy");
  const [catalog, setCatalog] = useState<Choice[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!allowCatalog || mode !== "library" || catalog) return;
    let active = true;
    setError("");
    request<{ choices: Choice[] }>("/api/teams?catalog=1").then(data => {
      if (active) setCatalog(data.choices);
    }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [allowCatalog, mode, catalog, attempt]);
  const parsed = useMemo(() => parseRoster(text, season.units, season.items), [text]);
  const needle = query.trim().normalize("NFKC").toLowerCase();
  const filtered = (catalog ?? []).filter(({ section, team }) => !needle ||
    [section, team.name, ...team.pieces.flatMap(piece => {
      const unit = unitMap.get(piece.unitId);
      return unit ? unitSearchNames(unit) : [];
    })].some(name => name.normalize("NFKC").toLowerCase().includes(needle)));
  const choice = filtered.find(entry => entry.team.id === selected) ?? filtered[0];
  const pieces = mode === "library" ? choice?.team.pieces ?? [] : parsed.pieces;
  const population = usedPopulation(pieces);
  const incompatible = mode === "library" && pieces.some(piece => !unitMap.has(piece.unitId) || piece.items.some(id => !itemMap.has(id)));
  const valid = pieces.length > 0 && !incompatible && (mode === "library" || !parsed.errors.length);
  const locks = [...new Set(pieces.map(piece => piece.unitId))].flatMap(id => {
    const unit = unitMap.get(id);
    return unit && hasUnlockCondition(unit) ? [unit] : [];
  });
  function build(accept: (draft: Team) => void) {
    if (!valid) return;
    const blank = emptyTeam();
    if (mode === "library" && choice) {
      const boardRole = choice.appendable && destination !== "copy" ? destination : undefined;
      const suffix = boardRole === "stage" ? " · 过渡" : boardRole === "variant" ? " · 变阵" : " · 副本";
      const draft = independentDraft({ ...choice.team, name: choice.team.name.slice(0, 80 - suffix.length) + suffix }, blank);
      accept({ ...draft, sectionId: boardRole ? choice.sectionId : undefined, boardRole });
    } else {
      const name = title.trim() || parsed.name || pieces.slice(0,3).map(piece => unitMap.get(piece.unitId)?.name).join("、") + "阵容";
      accept(independentDraft({ name: name.slice(0,80), category: blank.category, notes: parsed.notes, pieces }, blank));
    }
  }
  return <section className="quick-import" id="quick-import" aria-label="快速导入阵容"
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><h2>快速导入</h2><button className="btn ghost sm" type="button" onClick={onClose}>收起</button></header>
    {allowCatalog && <div className="quick-modes" aria-label="导入方式">
      <button type="button" aria-pressed={mode === "text"} onClick={() => setMode("text")}>粘贴名单或阵容文字</button>
      <button type="button" aria-pressed={mode === "library"} onClick={() => setMode("library")}>按笔记选阵容</button>
    </div>}
    {mode === "text" ? <>
      <label><span className="sr-only">棋子名单或阵容文字</span><textarea rows={3} value={text} maxLength={14000}
        placeholder="两星提莫、吉格斯、璐璐、小炮" onChange={event => setText(event.target.value)} /></label>
      {pieces.length > 0 && <label>阵容名称<input maxLength={80} value={title} placeholder={parsed.name || "可选，按名单自动命名"} onChange={event => setTitle(event.target.value)} /></label>}
      {!!parsed.errors.length && <ul className="quick-errors" role="alert">{[...new Set(parsed.errors)].map(message => <li key={message}>{message}</li>)}</ul>}
    </> : <>
      <label><span className="sr-only">查找已发布棋盘</span><input placeholder="搜阵容、棋子名或外号" value={query} onChange={event => {setQuery(event.target.value); select(""); setDestination("copy");}} /></label>
      {error ? <p role="alert">{error} <button type="button" onClick={() => retry(n => n+1)}>重新读取</button></p> : !catalog ? <p role="status">正在读取已发布棋盘…</p> :
        !filtered.length ? <p>没有匹配的已发布棋盘。</p> : <label>选择棋盘<select value={choice?.team.id ?? ""} onChange={e => { select(e.target.value); setDestination("copy"); }}>{filtered.map(entry =>
          <option key={entry.team.id} value={entry.team.id}>{entry.section} / {entry.team.name}</option>)}</select></label>}
    </>}
    {mode === "library" && choice?.appendable && <label>保存为<select aria-label="导入后用作" value={destination}
      onChange={event => setDestination(event.target.value as typeof destination)}>
      <option value="copy">独立草稿</option>
      <option value="variant">同篇新增变阵</option>
      <option value="stage">同篇新增过渡阶段</option>
    </select></label>}
    {incompatible && <p className="quick-errors" role="alert">包含当前赛季没有的棋子或装备。</p>}
    {pieces.length > 0 && <div className="quick-preview">
      <strong role="status">{population} 人口{population !== pieces.length ? ` · ${pieces.length} 枚` : ""}</strong>
      <ul>{[...pieces].sort((a, b) => a.position - b.position).map(piece => <li key={piece.position}>
        <span>{unitMap.get(piece.unitId)?.name ?? piece.unitId} · {piece.stars} 星</span>
        <small>{Math.floor(piece.position / 7) + 1} 排 {piece.position % 7 + 1} 格</small>
        {piece.items.length > 0 && <small className="quick-gear">{piece.items.map(id => itemMap.get(id)?.name ?? id).join("、")}</small>}
      </li>)}</ul>
      {!!locks.length && <details><summary>解锁条件（{locks.length}）</summary>
        {locks.map(unit => <p key={unit.id}><strong>{unit.name}</strong> {unlockText(unit)}</p>)}
      </details>}
    </div>}
    <div className="quick-import-actions">
      {(mode === "text" || destination === "copy") &&
        <button type="button" className="btn primary" disabled={!valid || busy} onClick={() => build(onFillStage)}>
          {hasStagePieces ? "替换" : "填入"}{activeStage}棋盘
        </button>}
      <button type="button" className="btn secondary" disabled={!valid || busy} onClick={() => build(onImport)}>
        {dirty ? "保存当前并建立新草稿" : "建立新草稿"}
      </button>
    </div>
  </section>;
}
