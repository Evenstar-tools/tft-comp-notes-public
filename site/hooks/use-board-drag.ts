"use client";
import { useCallback, useEffect, useRef, type DragEvent, type MouseEvent, type PointerEvent } from "react";

type BoardDrag = {
  pointerId: number;
  move: (position: number) => void;
  accepts?: (slot: HTMLElement) => boolean;
  x: number;
  y: number;
  source: HTMLButtonElement;
  ghost: HTMLElement | null;
};

export type BoardDragPreview = { source: number; destination: number | null; blocked: boolean; alternate: boolean };

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

  function showTarget(slot: HTMLElement | null, blocked = false, first = false) {
    if (slot === target.current && !first) return;
    target.current?.removeAttribute("data-drop-target");
    const source = drag.current?.source;
    const sourcePosition = source?.dataset.boardSlot ?? source?.dataset.boardAlternateSlot;
    const destination = slot && slot.dataset.boardSlot !== sourcePosition ? slot : null;
    if (destination) destination.dataset.dropTarget = blocked ? "blocked" : destination.classList.contains("is-filled") ? "stack" : "move";
    target.current = slot;
    onPreview?.(source ? {
      source: Number(sourcePosition),
      destination: destination ? Number(destination.dataset.boardSlot) : null,
      blocked: !!destination && blocked,
      alternate: source.dataset.boardAlternateSlot !== undefined,
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
    active.source.removeAttribute("data-drag-source");
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
    start(event: PointerEvent<HTMLButtonElement>, move: BoardDrag["move"], accepts?: BoardDrag["accepts"]) {
      if (!event.isPrimary || event.button !== 0) return;
      const source = event.currentTarget;
      drag.current = { pointerId: event.pointerId, move, accepts, x: event.clientX, y: event.clientY, source, ghost: null };
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
      const { clientX, clientY } = event;
      const dx = clientX - active.x;
      const dy = clientY - active.y;
      if (!active.ghost && Math.hypot(dx, dy) < 5) return;
      const paint = (ghost: HTMLElement, first = false) => {
        const slot = slotAt(board, document.elementFromPoint(clientX, clientY));
        ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        showTarget(slot, !!slot && !!active.accepts && !active.accepts(slot), first);
      };
      if (!active.ghost) {
        const ghost = active.source.cloneNode(true) as HTMLElement;
        ghost.classList.remove("is-selected");
        ghost.classList.add("board-drag-ghost");
        ghost.removeAttribute("data-board-slot");
        ghost.removeAttribute("data-board-alternate-slot");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        active.ghost = ghost;
        active.source.setAttribute("data-drag-source", "");
        board.appendChild(ghost);
        suppressClick.current = true;
        paint(ghost, true);
        return;
      }
      const ghost = active.ghost;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => paint(ghost));
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const slot = active.ghost
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
      showTarget(slot, blocked);
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
