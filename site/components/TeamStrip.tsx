"use client";
import { memo } from "react";
import { unitMap } from "@/data";
import type { Piece } from "@/domain/types";
import { Stars } from "./Glyphs";

/** 棋盘收起后的阵容条：按站位顺序列出棋子，仍可点选。 */
export const TeamStrip = memo(function TeamStrip({
  pieces,
  selectedId,
  relatedPieceIds,
  onSelect,
}: {
  pieces: Piece[];
  selectedId: string | null;
  relatedPieceIds?: ReadonlySet<string>;
  onSelect: (position: number, piece: Piece) => void;
}) {
  if (!pieces.length)
    return <p className="tracker-empty">选棋子加入阵容，也可以展开棋盘指定站位。</p>;
  return (
    <div className="team-strip">
      {[...pieces]
        .sort((a, b) => a.position - b.position)
        .map((piece) => {
          const unit = unitMap.get(piece.unitId);
          return (
            unit && (
              <button
                type="button"
                key={piece.instanceId}
                className={`strip-piece cost-${unit.cost}${piece.instanceId === selectedId ? " is-selected" : ""}`}
                data-trait-focus={relatedPieceIds ? (relatedPieceIds.has(piece.instanceId) ? "related" : "dimmed") : undefined}
                aria-pressed={piece.instanceId === selectedId}
                aria-label={`${unit.name} ${piece.stars}星`}
                title={unit.name}
                onClick={() => onSelect(piece.position, piece)}
              >
                <img src={unit.image} alt="" width={96} height={96} decoding="async" />
                <Stars count={piece.stars} size={9} />
              </button>
            )
          );
        })}
    </div>
  );
});
