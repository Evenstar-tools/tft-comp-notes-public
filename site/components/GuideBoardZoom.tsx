"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, MoveHorizontal } from "lucide-react";
import { guideRoster, type GuideRole } from "@/domain/guide-reading";
import { itemLink } from "@/domain/links";
import type { Piece, Season, Team } from "@/domain/types";
import { Board } from "./Board";
import { ItemIcon } from "./ItemIcon";
import { MatrixDialog } from "./MatrixDetails";
import "./guide-board-zoom.css";

export function GuideBoardZoom({ title, stage, team, data, roles, initialPiece, changedPositions, guideHref, onInspect, onClose }: {
  title: string; stage: string; team: Team; data: Season; roles: GuideRole[];
  initialPiece: string; changedPositions?: number[]; guideHref?: string;
  onInspect: (piece: Piece) => void; onClose: () => void;
}) {
  const roster = guideRoster(team, data, roles);
  const [selected, setSelected] = useState(initialPiece);
  const boardViewport = useRef<HTMLDivElement>(null);
  const member = roster.find(row => row.piece.instanceId === selected) ?? roster[0];
  const piece = member?.piece;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const viewport = boardViewport.current;
      if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return;
      const cell = viewport.querySelector(".board-hex[aria-pressed=true]")?.getBoundingClientRect();
      if (!cell) return;
      const bounds = viewport.getBoundingClientRect();
      if (cell.left < bounds.left || cell.right > bounds.right) {
        viewport.scrollLeft += (cell.left + cell.right - bounds.left - bounds.right) / 2;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return <MatrixDialog title={<>{title}<small>{stage}</small></>} className="guide-board-dialog guide-board-inspection"
    closeLabel="关闭棋盘" onClose={onClose}>
    <div className="zoom-board-layout" data-has-member={!!member}>
      <div className="zoom-board-pane">
        <p className="zoom-pan-hint"><MoveHorizontal size={16} aria-hidden />左右滑动棋盘</p>
        <div ref={boardViewport} className="read-board read-board-large" role="region" aria-label="放大棋盘站位" tabIndex={0}>
          <Board data={data} pieces={team.pieces} instrumentPositions={team.instrumentPositions} targeting={null}
            selectedId={piece?.instanceId ?? null} changedPositions={changedPositions}
            onCell={(_, picked) => { if (picked) setSelected(picked.instanceId); }} />
        </div>
      </div>
      {member && piece && <section className="zoom-unit" aria-label="选中棋子">
        <header className="zoom-unit-head" aria-live="polite" aria-atomic="true">
          <img className={"guide-piece-portrait cost-" + member.unit.cost} src={member.unit.image} width={52} height={52} alt="" />
          <div><h3>{member.unit.name}</h3>
            <p>{member.role && <b>{member.role} · </b>}{piece.stars} 星 · 第 {Math.floor(piece.position / 7) + 1} 排第 {piece.position % 7 + 1} 格</p>
          </div>
        </header>
        {piece.items.length > 0 ? <ul className="zoom-unit-items" aria-label="已携带装备">{piece.items.map((id, index) => {
          const item = data.items.find(entry => entry.id === id);
          return <li key={id + index}>{item
            ? <a href={itemLink(id, member.unit.id, guideHref)}><ItemIcon item={item} size={32} /><span>{item.name}</span></a>
            : <span>{id}</span>}</li>;
        })}</ul> : <p className="zoom-no-items">未带装备</p>}
        <button className="zoom-unit-details" type="button" onClick={() => onInspect(piece)}>棋子详情 <ArrowRight size={15} aria-hidden /></button>
      </section>}
    </div>
  </MatrixDialog>;
}
