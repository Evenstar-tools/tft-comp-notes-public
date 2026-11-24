"use client";
import { Fragment, memo, useCallback, useMemo, useRef, useState } from "react";
import { useBoardDrag, type BoardDragPreview } from "@/hooks/use-board-drag";
import { Plus } from "lucide-react";
import type { BoardInstrumentId, Piece, Season, Team } from "@/domain/types";
import { itemMap, season, unitLabel, unitMap } from "@/data";
import { boardInstruments, boardMarkerNote } from "@/domain/board-instruments";
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  HEX_WIDTH,
  HEX_HEIGHT,
  boardNeighbors,
  hexPosition,
} from "@/domain/board-layout";
import { ItemIcon } from "./ItemIcon";
import { Stars } from "./Glyphs";

const ROWS = [0, 1, 2, 3];
const COLUMNS = [0, 1, 2, 3, 4, 5, 6];
const compactNames: Record<string, string> = { "renata-glasc": "烈娜塔", "nunu-willump": "努努", vladimir: "吸血鬼" };
// 几何来自 domain/board-layout.ts（网页与导出图共用），这里只换算成百分比。
const CELL_STYLE = Array.from({ length: 28 }, (_, position) => {
  const point = hexPosition(position);
  return {
    left: `${(point.x / BOARD_WIDTH) * 100}%`,
    top: `${(point.y / BOARD_HEIGHT) * 100}%`,
    width: `${(HEX_WIDTH / BOARD_WIDTH) * 100}%`,
    height: `${(HEX_HEIGHT / BOARD_HEIGHT) * 100}%`,
  };
});

export const Board = memo(function Board({
  pieces,
  selectedId,
  relatedPieceIds,
  targeting,
  onCell,
  onMove,
  onMoveEquipment,
  canReceiveEquipment,
  onSwitchAlternate,
  onSplitAlternate,
  instrumentPositions,
  onMoveInstrument,
  onSelectInstrument,
  onDropUnit,
  onRemove,
  data,
  changedPositions,
  readOnly = false,
}: {
  data?: Season;
  changedPositions?: number[];
  readOnly?: boolean;
  pieces: Piece[];
  /** 当前选中的棋盘棋子 instanceId。 */
  selectedId: string | null;
  relatedPieceIds?: ReadonlySet<string>;
  /** 有待放置的英雄或待移动的棋子时，空格显示为可落点。 */
  targeting: "place" | "move" | null;
  /** 点击任意格子；由编辑器决定是选中、放置还是移动。 */
  onCell: (position: number, piece: Piece | undefined, trigger: HTMLButtonElement) => void;
  onMove?: (instanceId: string, position: number) => void;
  onMoveEquipment?: (instanceId: string, index: number, itemId: string, position: number) => void;
  canReceiveEquipment?: (itemId: string, piece: Piece) => boolean;
  onSwitchAlternate?: (instanceId: string) => void;
  onSplitAlternate?: (instanceId: string, position: number) => void;
  instrumentPositions?: Team["instrumentPositions"];
  onMoveInstrument?: (id: BoardInstrumentId, position: number) => void;
  onSelectInstrument?: () => void;
  onDropUnit?: (position: number, unitId: string) => void;
  onRemove?: (instanceId: string) => void;
}) {
  const [dragPreview, setDragPreview] = useState<BoardDragPreview | null>(null);
  const draggingInstrument = useRef(false);
  const dragNote = useRef<HTMLSpanElement>(null);
  const restingNote = useRef<HTMLSpanElement>(null);
  const units = useMemo(() => data ? new Map(data.units.map(unit => [unit.id, unit])) : unitMap, [data]);
  const itemsById = useMemo(() => data ? new Map(data.items.map(item => [item.id, item])) : itemMap, [data]);
  const instruments = useMemo(() => boardInstruments(pieces, data ?? season, instrumentPositions), [pieces, data, instrumentPositions]);
  const [instrumentId, selectInstrument] = useState<BoardInstrumentId | null>(null);
  const currentInstrument = onMoveInstrument && !targeting
    ? [...instruments].find(([, instrument]) => instrument.id === instrumentId)
    : undefined;
  const selectedInstrument = currentInstrument?.[1];
  const byPosition = useMemo(() => new Map(pieces.map(piece => [piece.position, piece])), [pieces]);
  const selectedPiece = pieces.find((entry) => entry.instanceId === selectedId);
  const selectedUnit = selectedPiece && units.get(selectedPiece.unitId);
  const origin = dragPreview?.source;
  const movingInstrument = origin == null ? undefined : instruments.get(origin);
  const destination = dragPreview?.destination;
  const previewOrigin = movingInstrument ? (!dragPreview?.blocked ? destination : null) : currentInstrument?.[0];
  const coverage = previewOrigin == null || (movingInstrument || selectedInstrument)?.id === "infernalIdol"
    ? [] : boardNeighbors(previewOrigin);
  const previewDrag = useCallback((preview: BoardDragPreview | null) => {
    const source = preview?.source;
    const target = preview?.destination;
    const instrument = source == null ? undefined : instruments.get(source);
    if (instrument || draggingInstrument.current) setDragPreview(instrument ? preview : null);
    draggingInstrument.current = !!instrument;
    if (!dragNote.current || !restingNote.current) return;
    const sourcePiece = source == null ? undefined : byPosition.get(source);
    const draggedPiece = preview?.alternate ? sourcePiece?.alternate : sourcePiece;
    const targetPiece = target == null ? undefined : byPosition.get(target);
    const sourceName = draggedPiece && units.get(draggedPiece.unitId)?.name;
    const targetName = targetPiece && units.get(targetPiece.unitId)?.name;
    let text = "";
    if (preview?.equipment) {
      text = targetName ? (preview.blocked ? `${targetName}的装备栏已满` : `松手转移装备给${targetName}`) : "拖到另一名棋子身上";
    } else if (preview?.blocked) text = instrument || preview.alternate ? "拖到空格放置" : "每格可叠放一个替补棋子";
    else if (preview && target == null) text = "拖到棋盘格内放置";
    else if (instrument) text = instrument.id === "infernalIdol" ? `移动${instrument.name}` : `${instrument.name} · 相邻格预览`;
    else if (targetName) text = sourceName ? `${sourceName}与${targetName}互换` : `松手叠放到${targetName}左上角`;
    else if (source === null) text = "松手放置棋子";
    else if (sourceName) text = `移动${sourceName}`;
    dragNote.current.textContent = text;
    dragNote.current.hidden = !text;
    restingNote.current.hidden = !!text;
  }, [byPosition, instruments, units]);
  const { start, ...dragHandlers } = useBoardDrag(onDropUnit, !!onMove || !!onMoveInstrument || !!onMoveEquipment, previewDrag, !!onSwitchAlternate);

  function clickCell(position: number, piece: Piece | undefined, trigger: HTMLButtonElement, instrument?: BoardInstrumentId) {
    if (instrument && onSelectInstrument && targeting === "move") {
      onSelectInstrument();
      selectInstrument(instrument);
      return;
    }
    if (onMoveInstrument && !targeting && !piece) {
      if (selectedInstrument) {
        if (selectedInstrument.id !== instrument) onMoveInstrument(selectedInstrument.id, position);
        selectInstrument(null);
        return;
      }
      if (instrument) {
        selectInstrument(instrument);
        return;
      }
    }
    selectInstrument(null);
    onCell(position, piece, trigger);
  }

  return (
    <>
      <div
        className={`board${targeting ? ` is-targeting is-${targeting}` : selectedInstrument ? " is-targeting is-instrument-targeting" : ""}`}
        role="group"
        aria-label="4 排 7 列阵容棋盘"
        {...(!data ? dragHandlers : {})}
        onKeyDown={event => { if (event.key === "Escape") selectInstrument(null); }}
        style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}
      >
        {ROWS.map((row) => (
          <div className="board-row" key={row}>
            {COLUMNS.map((column) => {
              const position = row * 7 + column;
              const piece = byPosition.get(position);
              const unit = piece && units.get(piece.unitId);
              const alternate = piece?.alternate && onSwitchAlternate ? units.get(piece.alternate.unitId) : undefined;
              const instrument = !piece ? instruments.get(position) : undefined;
              const items = piece?.items.map((id) => itemsById.get(id)) ?? [];
              const name = unit ? unitLabel(unit).base : "";
              const isSelected = piece ? piece.instanceId === selectedId : !!instrument && selectedInstrument?.id === instrument.id;
              const occupantLabel = unit
                ? `${unit.name} ${piece!.stars}星${items.length ? ` 装备：${items.map((item) => item?.name ?? "").join("、")}` : ""}`
                : instrument?.id === "infernalIdol" ? `${instrument.name}，站位示意`
                : instrument ? `空位，${instrument.name}，乐器站位示意` : "空位";
              return <Fragment key={position}>
                <button
                  type="button"
                  className={`board-hex${unit ? ` is-filled cost-${unit.cost}` : ""}${instrument ? " has-instrument" : ""}${isSelected ? " is-selected" : ""}${changedPositions?.includes(position) ? " read-change" : ""}${coverage.includes(position) ? " instrument-coverage" : ""}`}
                  style={CELL_STYLE[position]}
                  data-board-slot={!data ? position : undefined}
                  data-has-alternate={!data && alternate ? "true" : undefined}
                  data-trait-focus={piece && relatedPieceIds ? (relatedPieceIds.has(piece.instanceId) ? "related" : "dimmed") : undefined}
                  onPointerDown={data ? undefined : event => {
                    const grip = (event.target as HTMLElement).closest<HTMLElement>("[data-board-item-index]");
                    if (piece && grip && onMoveEquipment) {
                      const index = Number(grip.dataset.boardItemIndex);
                      const itemId = piece.items[index];
                      if (itemId) start(event, target => onMoveEquipment(piece.instanceId, index, itemId, target), slot => {
                        const target = byPosition.get(Number(slot.dataset.boardSlot));
                        return !!target && target !== piece && (canReceiveEquipment?.(itemId, target) ?? true);
                      }, grip);
                      return;
                    }
                    if (piece && onMove) start(event, target => onMove(piece.instanceId, target));
                    if (instrument && onMoveInstrument) start(event, target => {
                      selectInstrument(null);
                      onMoveInstrument(instrument.id, target);
                    }, slot => !slot.classList.contains("is-filled"));
                  }}
                  aria-label={`第${row + 1}排第${column + 1}格 ${occupantLabel}`}
                  title={instrument ? `${instrument.name} · 站位示意` : undefined}
                  aria-pressed={piece || (onMoveInstrument && instrument) ? isSelected : undefined}
                  onClick={event => clickCell(position, piece, event.currentTarget, instrument?.id)}
                  disabled={readOnly || (!!data && !piece)}
                  onContextMenu={data ? undefined : (event) => {
                    if (!piece) return;
                    event.preventDefault();
                    onRemove?.(piece.instanceId);
                  }}
                >
                  <span className="board-surface">
                    {unit ? (
                      <span className="board-avatar">
                        <img
                          src={unit.image}
                          alt=""
                          width={96}
                          height={96}
                          draggable={false}
                        decoding="async" />
                      </span>
                    ) : instrument ? (
                      <span className="board-instrument" aria-hidden="true">
                        <img src={instrument.image} alt="" width={28} height={28} draggable={false} />
                        <span>{instrument.name}</span>
                      </span>
                    ) : (
                      <span className="empty-hex">
                        {!data && <span className="empty-hex-dot" aria-hidden><Plus /></span>}
                      </span>
                    )}
                  </span>
                  {unit && (
                    <>
                      {data && <span className="read-cost">{unit.cost}</span>}
                      <span className="board-rank" data-stars={piece!.stars} aria-hidden="true">
                        <Stars count={piece!.stars} size={14} />
                      </span>
                      <span className="board-unit-name">
                        {compactNames[unit.id] ? <>
                          <span className="board-full-name">{name}</span>
                          <span className="board-compact-name">{compactNames[unit.id]}</span>
                        </> : name}
                      </span>
                      {!!items.length && (
                        <span className="board-items">
                          {items.map((item, index) => onMoveEquipment && !data && !readOnly && item ? (
                            <span className="board-item-grip" key={`${item.id}-${index}`} data-board-item-index={index}
                              title={`${item.name} · 拖到其他棋子`}>
                              <ItemIcon item={item} className="board-item" />
                            </span>
                          ) : <ItemIcon key={`${item?.id}-${index}`} item={item} className="board-item" />)}
                        </span>
                      )}
                    </>
                  )}
                  <svg
                    className="board-selection"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <polygon
                      points="50,1 99,25.5 99,74.5 50,99 1,74.5 1,25.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </button>
                {piece && alternate && <button
                  type="button"
                  className={`board-alternate cost-${alternate.cost}`}
                  data-board-alternate-slot={position}
                  style={{ left: CELL_STYLE[position].left, top: CELL_STYLE[position].top }}
                  aria-label={`换上${alternate.name}`}
                  title={`换上${alternate.name} · 拖到空格拆开`}
                  onClick={() => onSwitchAlternate?.(piece.instanceId)}
                  onPointerDown={onSplitAlternate ? event => start(event, target => onSplitAlternate(piece.instanceId, target),
                    slot => !slot.classList.contains("is-filled")) : undefined}
                >
                  <img src={alternate.image} alt="" width={40} height={40} draggable={false} />
                </button>}
              </Fragment>;
            })}
          </div>
        ))}
      </div>
      {(instruments.size > 0 || onMoveInstrument || onMoveEquipment) && <p className="board-instrument-note" role={onMoveInstrument || onMoveEquipment ? "status" : undefined}>
        <span ref={restingNote}>{!!instruments.size && `${boardMarkerNote(instruments)}${onMoveInstrument && selectedInstrument ? ` · 选空格移动${selectedInstrument.name}` : onMoveInstrument ? " · 可拖动" : ""}`}</span>
        <span ref={dragNote} hidden />
      </p>}
      {!data && selectedPiece && selectedUnit && (
        <div className="board-mobile-detail" aria-label="所选棋子详情">
          <strong>
            {selectedUnit.name}
            <span className="muted"> · {selectedUnit.cost} 费</span>
            <Stars count={selectedPiece.stars} />
          </strong>
          <div className="board-mobile-equipment">
            {selectedPiece.items.length ? (
              selectedPiece.items.map((id, index) => {
                const item = itemMap.get(id);
                return (
                  item && (
                    <span key={`${id}-${index}`}>
                      <ItemIcon item={item} size={24} /> {item.name}
                    </span>
                  )
                );
              })
            ) : (
              <span className="muted">未装备</span>
            )}
          </div>
        </div>
      )}
    </>
  );
});
