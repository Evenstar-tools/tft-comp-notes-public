"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** 工具栏下拉面板：点按钮开合，点外面或按 Esc 关闭。 */
export function Popover({
  label,
  icon,
  align = "start",
  onOpen,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  align?: "start" | "end";
  onOpen?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="popover" ref={root}>
      <button
        type="button"
        className="btn secondary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        {icon}
        <span className="btn-label">{label}</span>
        <ChevronDown size={14} className="chevron" aria-hidden />
      </button>
      {open && (
        <div className={`popover-panel align-${align}`} id={id} role="dialog">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
