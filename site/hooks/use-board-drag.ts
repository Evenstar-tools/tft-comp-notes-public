"use client";
import { useCallback, useEffect, useRef, type DragEvent, type MouseEvent, type PointerEvent } from "react";

type BoardDrag = {
  pointerId: number;
  move: (position: number) => void;
  accepts?: (slot: HTMLElement) => boolean;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  source: HTMLButtonElement;
  visual: HTMLElement;
  dragging: boolean;
  ghost: HTMLElement | null;
};

export type BoardDragPreview = {
  source: number | null; destination: number | null; blocked: boolean; alternate: boolean; equipment: boolean;
};

export function useBoardDrag(
  onDropUnit?: (position: number, id: string) => void,
  movable = false,
  onPreview?: (preview: BoardDragPreview | null) => void,
  allowStack = false,
) {
  const drag = useRef<BoardDrag | null>(null);
  const target = useRef<HTMLElement | null>(null);
  const frame = useRef(0);
  const suppressClick = useRef(false);

  function showTarget(slot: HTMLElement | null, blocked = false, first = false, fromTray = false) {
    if (slot === target.current && !first) return;
    target.current?.removeAttribute("data-drop-target");
    const active = drag.current;
    const source = active?.source;
    const equipment = !!active && active.visual !== source;
    const sourcePosition = source?.dataset.boardSlot ?? source?.dataset.boardAlternateSlot;
    const destination = slot && slot.dataset.boardSlot !== sourcePosition ? slot : null;
    if (destination) {
      const kind = equipment ? "equipment" : !destination.classList.contains("is-filled") ? "move" : fromTray ? "stack" : "swap";
      destination.dataset.dropTarget = blocked ? "blocked" : kind;
    }
    target.current = slot;
    onPreview?.(source || (fromTray && destination) ? {
      source: source ? Number(sourcePosition) : null,
      destination: destination ? Number(destination.dataset.boardSlot) : null,
      blocked: !!destination && blocked,
      alternate: source?.dataset.boardAlternateSlot !== undefined,
      equipment,
    } : null);
  }

  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    target.current?.removeAttribute("data-drop-target");
    target.current = null;
    onPreview?.(null);
    const active = drag.current;
    drag.current = null;
    if (!active) return;
    active.visual.removeAttribute("data-drag-source");
    active.ghost?.remove();
    if (active.source.hasPointerCapture(active.pointerId)) {
      active.source.releasePointerCapture(active.pointerId);
    }
  }, [onPreview]);
  useEffect(() => {
    if (!movable) return;
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && drag.current) reset();
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape);
      reset();
    };
  }, [movable, reset]);

  function slotAt(board: HTMLElement, element: Element | null) {
    const alternate = element?.closest<HTMLElement>("[data-board-alternate-slot]");
    const slot = alternate
      ? board.querySelector<HTMLElement>(`[data-board-slot="${alternate.dataset.boardAlternateSlot}"]`)
      : element?.closest<HTMLElement>("[data-board-slot]") ?? null;
    return slot && board.contains(slot) ? slot : null;
  }

  function acceptsTray(slot: HTMLElement) {
    return !slot.classList.contains("is-filled") || (allowStack && slot.dataset.hasAlternate !== "true");
  }

  function dropSlot(board: HTMLElement, active: BoardDrag, x: number, y: number) {
    const slot = slotAt(board, document.elementFromPoint(x, y));
    return slot && (!active.accepts || active.accepts(slot)) ? slot : null;
  }

  return {
    start(event: PointerEvent<HTMLButtonElement>, move: BoardDrag["move"], accepts?: BoardDrag["accepts"], visual = event.currentTarget as HTMLElement) {
      if (!event.isPrimary || event.button !== 0) return;
      const source = event.currentTarget;
      const { clientX, clientY } = event;
      drag.current = { pointerId: event.pointerId, move, accepts, x: clientX, y: clientY,
        clientX, clientY, source, visual, dragging: false, ghost: null };
      source.setPointerCapture(event.pointerId);
    },
    onPointerDownCapture() {
      suppressClick.current = false;
    },
    onClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.stopPropagation();
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const board = event.currentTarget;
      active.clientX = event.clientX;
      active.clientY = event.clientY;
      if (!active.dragging) {
        if (Math.hypot(active.clientX - active.x, active.clientY - active.y) < 5) return;
        active.dragging = true;
        suppressClick.current = true;
      }
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (drag.current !== active) return;
        const { clientX, clientY, visual, source } = active;
        const slot = slotAt(board, document.elementFromPoint(clientX, clientY));
        const first = !active.ghost;
        if (!active.ghost) {
          const ghost = visual.cloneNode(true) as HTMLElement;
          ghost.classList.remove("is-selected");
          ghost.classList.add("board-drag-ghost");
          ghost.removeAttribute("data-board-slot");
          ghost.removeAttribute("data-board-alternate-slot");
          ghost.removeAttribute("data-board-item-index");
          ghost.setAttribute("aria-hidden", "true");
          ghost.inert = true;
          if (visual !== source) {
            const itemBox = visual.getBoundingClientRect();
            const boardBox = board.getBoundingClientRect();
            ghost.classList.add("board-equipment-ghost");
            Object.assign(ghost.style, {
              left: `${itemBox.left - boardBox.left}px`, top: `${itemBox.top - boardBox.top}px`,
              width: `${itemBox.width}px`, height: `${itemBox.height}px`,
            });
          }
          active.ghost = ghost;
          visual.setAttribute("data-drag-source", "");
          board.appendChild(ghost);
        }
        active.ghost.style.transform = `translate3d(${clientX - active.x}px, ${clientY - active.y}px, 0)`;
        if (first || slot !== target.current) showTarget(slot, !!slot && !!active.accepts && !active.accepts(slot), first);
      });
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const slot = active.dragging
        ? dropSlot(event.currentTarget, active, event.clientX, event.clientY)
        : null;
      reset();
      if (slot && slot !== active.source) active.move(Number(slot.dataset.boardSlot));
    },
    onPointerCancel(event: PointerEvent) {
      if (drag.current?.pointerId === event.pointerId) reset();
    },
    onLostPointerCapture(event: PointerEvent) {
      if (drag.current?.pointerId === event.pointerId) reset();
    },
    onDragOver(event: DragEvent<HTMLDivElement>) {
      if (!onDropUnit || !event.dataTransfer.types.includes("unit-id")) return;
      const slot = slotAt(event.currentTarget, event.target as Element);
      const blocked = slot !== null && !acceptsTray(slot);
      showTarget(slot, blocked, false, true);
      if (!slot || blocked) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) showTarget(null);
    },
    onDrop(event: DragEvent<HTMLDivElement>) {
      const slot = slotAt(event.currentTarget, event.target as Element);
      const id = event.dataTransfer.getData("unit-id");
      showTarget(null);
      if (!slot || !id || !acceptsTray(slot)) return;
      event.preventDefault();
      onDropUnit?.(Number(slot.dataset.boardSlot), id);
    },
    onDragEnd() {
      showTarget(null);
    },
  };
}
