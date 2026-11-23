"use client";
import { memo, useState } from "react";
import { Tooltip } from "radix-ui";
import type { Trait } from "@/domain/types";
import { traitGroup } from "@/domain/team";
import { requiresPrismaticQuest, traitActivationText } from "@/domain/trait-activation.mjs";
import { useIsMobile } from "@/hooks/use-mobile";
import { TraitBadge } from "./Glyphs";
import { MatrixTraitDetails } from "./MatrixDetails";

export type TraitCount = Trait & {
  count: number;
  active: boolean;
  level: number;
};

/**
 * 羁绊计数：图标、人数、名字、各档位（已达到的点亮）。
 * 动态名单按本局选人，任务档位只点亮棋盘能确定的部分。
 */
export const TraitTracker = memo(function TraitTracker({
  counts,
  selectedTraitIds,
  focusTraitIds,
  onToggleTrait,
  compact = false,
}: {
  counts: TraitCount[];
  selectedTraitIds?: readonly string[];
  focusTraitIds?: ReadonlySet<string>;
  onToggleTrait?: (id: string) => void;
  compact?: boolean;
}) {
  const isMobile = useIsMobile();
  const [detailId, setDetailId] = useState<string>();
  const touchDetails = compact && isMobile;
  const selected = touchDetails ? counts.find(trait => trait.id === detailId) : undefined;
  if (!counts.length)
    return (
      <p className="tracker-empty">暂无羁绊</p>
    );
  return (
    <Tooltip.Provider delayDuration={260}>
      {compact && <div className="tracker-heading">
        <strong>羁绊</strong><small>已开 {counts.filter(trait => trait.active).length}</small>
      </div>}
      <ul className={"trait-tracker" + (compact ? " is-compact" : "")} aria-label="羁绊计数">
        {counts.map((trait) => {
          const top =
            !trait.dynamic &&
            trait.thresholds.length > 1 &&
            trait.level === trait.thresholds.at(-1);
          const next = trait.thresholds.find((level) => level > trait.count);
          const questTier = trait.thresholds.at(-1);
          const atQuestCount = questTier != null && trait.count >= questTier && requiresPrismaticQuest(trait.id);
          const tone = top && !atQuestCount ? "top" : trait.active ? "active" : "neutral";
          const row = (
            <>
              <TraitBadge trait={trait} size={22} tone={tone} />
              <span className="tracker-main">
                <span className="tracker-name">
                  {trait.name}
                  {traitGroup(trait) === "已开专属" && <em>专属</em>}
                  {trait.countMode === "stars" && <em>按星级</em>}
                </span>
                <span className="tracker-levels">
                  {trait.thresholds.map(level => (
                    <span key={level} className={trait.level >= level ? "reached" : undefined}>{level}</span>
                  ))}
                  {trait.dynamic && <span>每局换人</span>}
                  {atQuestCount && <span>棱彩需完成任务</span>}
                </span>
              </span>
              <b className="tracker-count">
                {trait.dynamic ? "—" : <>{trait.count}{next && (!compact || !trait.active) && <small>/{next}</small>}</>}
              </b>
            </>
          );
          return (
            <li key={trait.id} className={trait.active ? "is-active" : undefined}
              data-trait-focus={focusTraitIds ? (focusTraitIds.has(trait.id) ? "related" : "dimmed") : undefined}>
              {onToggleTrait ? (
                touchDetails ? (
                  <button type="button" className="tracker-row" data-trait-id={trait.id}
                    data-filtered={selectedTraitIds?.includes(trait.id) ? "" : undefined}
                    title={trait.name}
                    aria-label={`${trait.name}，当前${trait.count}${trait.countMode === "stars" ? "星" : "个"}，${traitActivationText(trait)}`}
                    aria-expanded={selected?.id === trait.id} onClick={() => setDetailId(id => id === trait.id ? undefined : trait.id)}>
                    {row}
                  </button>
                ) : <Tooltip.Root>
                  <Tooltip.Trigger
                    type="button"
                    className="tracker-row"
                    data-trait-id={trait.id}
                    data-filtered={selectedTraitIds?.includes(trait.id) ? "" : undefined}
                    aria-label={trait.name}
                    aria-description={`当前${trait.count}${trait.countMode === "stars" ? "星" : "个"}，${traitActivationText(trait)}`}
                    aria-pressed={selectedTraitIds?.includes(trait.id) ?? false}
                    onClick={() => onToggleTrait(trait.id)}
                  >
                    {row}
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="tracker-tooltip"
                      side={isMobile ? "top" : "right"}
                      sideOffset={8}
                      collisionPadding={12}
                      hideWhenDetached
                    >
                      <div className="tracker-tooltip-title">
                        <TraitBadge trait={trait} size={24} tone={tone} />
                        <strong>{trait.name}</strong>
                      </div>
                      <MatrixTraitDetails trait={trait} compact showEmblem={false} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ) : (
                <div className="tracker-row" title={traitActivationText(trait)}>{row}</div>
              )}
            </li>
          );
        })}
      </ul>
      {selected && <div className="tracker-detail">
        <div className="tracker-tooltip-title"><TraitBadge trait={selected} size={20} /><strong>{selected.name}</strong></div>
        <MatrixTraitDetails trait={selected} compact showEmblem={false} />
        {onToggleTrait && <button type="button" className="btn secondary sm" onClick={() => {
          onToggleTrait(selected.id);
          setDetailId(undefined);
        }}>{selectedTraitIds?.includes(selected.id) ? "移除此羁绊筛选" : "按此羁绊找棋子"}</button>}
      </div>}
    </Tooltip.Provider>
  );
});
