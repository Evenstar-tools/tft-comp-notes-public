"use client";
import { GameIconImage } from "./GameIconImage";
import { memo } from "react";
import { Check, Lock, Plus } from "lucide-react";
import { Tooltip } from "radix-ui";
import { unlockText } from "@/domain/unlocks";
import { unitLabel } from "@/data";
import type { Trait, Unit } from "@/domain/types";
import { Stars, TraitBadge } from "./Glyphs";

/**
 * 英雄卡片。
 * - variant="card"：英雄列表，用赛季头像。
 * - variant="tile"：羁绊网，用方形赛季头像，密度优先。
 * 单击只选中；加入阵容是独立的 ＋ 按钮（悬停 / 聚焦出现）或双击。
 */
export const UnitCard = memo(function UnitCard({
  unit,
  variant = "card",
  selected,
  dimmed,
  inTeam,
  teamStars,
  caption,
  matchedTraits,
  onSelect,
  onAdd,
  singleAction = false,
  onUnlock,
}: {
  unit: Unit;
  variant?: "card" | "tile";
  selected?: boolean;
  dimmed?: boolean;
  inTeam?: boolean;
  teamStars?: number;
  caption?: string;
  matchedTraits?: readonly Trait[];
  onSelect?: (id: string) => void;
  onAdd?: (id: string) => void;
  singleAction?: boolean;
  onUnlock?: (id: string) => void;
}) {
  const { base, form } = unitLabel(unit);
  const condition = unlockText(unit);
  const src = unit.image;
  const tile = variant === "tile";
  const compactName = (tile || singleAction) && base.length > 4 ? base.split("·")[0] : base;
  const [w, h] = [96, 96];
  const main = (
      <button
        type="button"
        className="unit-card-main"
        aria-label={`${unit.name}，${unit.cost}费${condition ? "，需要解锁" : ""}${inTeam ? "，已在阵容" : ""}${teamStars ? "，最高" + teamStars + "星" : ""}${singleAction ? (inTeam ? "，定位棋子" : "，加入阵容") : ""}`}
        aria-description={matchedTraits?.length ? "命中羁绊 " + matchedTraits.map(trait => trait.name).join("、") : undefined}
        title={(tile || compactName !== base) && !condition ? [unit.name, caption].filter(Boolean).join(" · ") : undefined}
        aria-pressed={!!selected}
        onClick={() => onSelect?.(unit.id)}
        onDoubleClick={onAdd && !singleAction ? () => onAdd(unit.id) : undefined}
        draggable={!!onAdd}
        onDragStart={(event) => {
          event.dataTransfer.setData("unit-id", unit.id);
          event.dataTransfer.effectAllowed = "copy";
        }}
      >
        <span className="unit-visual">
          <span className="unit-art">
            {src ? (
              <GameIconImage
                src={src}
                alt=""
                width={w}
                height={h}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ) : (
              <span className="unit-placeholder">{base.slice(0, 2)}</span>
            )}
            <span className="unit-cost">{unit.cost}</span>
            {condition && !onUnlock && (
              <span className="unit-flag is-lock">
                <Lock size={10} strokeWidth={2.5} aria-hidden />
              </span>
            )}
            {inTeam && (
              <span className="unit-flag is-team" title={teamStars ? "已上阵 · 最高" + teamStars + "星" : "已在阵容"}>
                {tile && teamStars ? <Stars count={teamStars} size={10} /> : <Check size={11} strokeWidth={3} aria-hidden />}
              </span>
            )}
          </span>
          <span className="unit-name">
            <span>{compactName}</span>
            {form && <small>{form}</small>}
          </span>
        </span>
        {matchedTraits?.length ? (
          <span className="unit-trait-matches" aria-hidden="true">
            {matchedTraits.map(trait => (
              <span key={trait.id} className="unit-trait-match" data-trait-id={trait.id}>
                <TraitBadge trait={trait} size={13} tone="active" />
                <span>{trait.name}</span>
              </span>
            ))}
          </span>
        ) : null}
      </button>
  );
  return (
    <div
      className={`unit-card is-${variant} cost-${unit.cost}${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}${inTeam ? " is-in-team" : ""}`}
    >
      {condition ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>{main}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="unit-unlock-tooltip" side="top" sideOffset={7} collisionPadding={12}>
              <strong>{unit.name} · 解锁条件</strong>
              <span>{condition}</span>
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : main}
      {tile && caption && <span className="matrix-unit-caption">{caption}</span>}
      {condition && onUnlock && (
        <button type="button" className="unit-lock-action"
          aria-label={`查看${unit.name}解锁条件`} title={condition}
          onClick={() => onUnlock(unit.id)}>
          <Lock size={10} strokeWidth={2.5} aria-hidden />
        </button>
      )}
      {onAdd && !tile && !singleAction && (
        <button
          type="button"
          className="unit-add"
          title="加入阵容（也可双击卡片）"
          aria-label={`把${unit.name}加入阵容`}
          onClick={() => onAdd(unit.id)}
        >
          <Plus size={14} strokeWidth={2.5} aria-hidden />
        </button>
      )}
    </div>
  );
});
