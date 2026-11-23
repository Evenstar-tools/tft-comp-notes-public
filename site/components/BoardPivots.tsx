"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { itemMap, unitMap } from "@/data";
import { findBoardPivots, type PublishedPivot } from "@/domain/board-pivots";
import { guideBoardName, guideLink } from "@/domain/guide-reading";
import { usedPopulation } from "@/domain/team";
import type { Piece } from "@/domain/types";
import { unlockText } from "@/domain/unlocks";
import { request } from "./api";
import "./board-pivots.css";

const unitName = (id: string) => unitMap.get(id)?.name ?? id;
const itemName = (id: string) => itemMap.get(id)?.name ?? id;
const members = (pieces: Piece[]) => pieces.map(piece => unitName(piece.unitId)).join("、");

export function BoardPivots({ pieces, onClose }: { pieces: Piece[]; onClose: () => void }) {
  const [choices, setChoices] = useState<PublishedPivot[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState("");
  const panel = useRef<HTMLElement>(null);
  const population = usedPopulation(pieces);
  const needCatalog = pieces.length > 0 && !choices;
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width:760px)").matches) panel.current?.scrollIntoView({ block: "nearest" });
  }, []);
  useEffect(() => {
    if (!needCatalog) return;
    const controller = new AbortController();
    request<{ choices: PublishedPivot[] }>("/api/teams?catalog=pivots", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setChoices(data.choices); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [needCatalog, attempt]);
  const matches = useMemo(() => findBoardPivots(pieces, population, choices ?? [], itemMap), [pieces, population, choices]);
  const viewed = matches.find(match => match.candidate.team.id === selected) ?? matches[0];
  return <section ref={panel} tabIndex={-1} className="board-pivots" id="board-pivots" aria-label="转阵预览" onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
  }}>
    <header className="pivot-tools"><span>{population > 0 && `${population} / ${population + 1} 人口`}</span>
      <button className="btn ghost icon sm" type="button" title="收起转阵" aria-label="收起转阵" onClick={onClose}><X size={15} aria-hidden /></button></header>
    {!pieces.length ? <p>先上棋子。</p> : error ? <p role="alert">{error} <button type="button" onClick={() => { setError(""); setAttempt(attempt + 1); }}>重试</button></p>
      : !choices ? <p role="status">正在读取已发布棋盘…</p>
      : !viewed ? <p>暂无合适的转阵。</p>
      : <>{matches.map(match => {
        const { candidate, kept, removed, added, transfers, missingEmblems } = match;
        const isSelected = match === viewed;
        const core = candidate.cores.map(id => unitMap.get(id)).find(Boolean)
          ?? unitMap.get(candidate.team.pieces.find(piece => piece.items.length)?.unitId ?? "");
        const locked = [...new Set(added.map(piece => piece.unitId))].flatMap(id => {
          const unit = unitMap.get(id);
          return unit && unlockText(unit) ? [unit] : [];
        });
        return <div className="pivot-choice" key={candidate.team.id}>
          <button type="button" className="pivot-heading" aria-expanded={isSelected}
            aria-label={candidate.section + " · " + guideBoardName(candidate.team)} onClick={() => setSelected(candidate.team.id)}>
            {core && <img src={core.image} alt="" className={"cost-" + core.cost} width={32} height={32}/>}
            <span><strong>{candidate.section}</strong><small>{guideBoardName(candidate.team)} · 留 {kept.length} 枚</small></span>
          </button>
          {isSelected && <div className="pivot-detail">
            <dl>
              {candidate.augment && <><dt>强化</dt><dd>需要{candidate.augment}</dd></>}
              {!!missingEmblems.length && <><dt>转职</dt><dd>缺{missingEmblems.map(itemName).join("、")}</dd></>}
              <dt>保留</dt><dd>{members(kept)}</dd>
              {!!removed.length && <><dt>下场</dt><dd>{members(removed)}</dd></>}
              {!!added.length && <><dt>补上</dt><dd>{members(added)}</dd></>}
              {!!transfers.length && <><dt>转装</dt><dd>{transfers.map(({ from, to, items }) => <div key={from.instanceId + to.instanceId}>
                {unitName(from.unitId)} → {to.stars} 星{unitName(to.unitId)}<small>{items.map(itemName).join("、")}</small>
              </div>)}</dd></>}
            </dl>
            {!!locked.length && <details className="pivot-locks"><summary>解锁 · {locked.map(unit => unit.name).join("、")}</summary>
              {locked.map(unit => <p key={unit.id}><b>{unit.name}</b>　{unlockText(unit)}</p>)}</details>}
            <a href={guideLink(candidate.sectionId, candidate.team.id)} target="_blank" rel="noreferrer">看 {candidate.population} 人口棋盘 ↗</a>
          </div>}
        </div>;
      })}</>}
  </section>;
}
