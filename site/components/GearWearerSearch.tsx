"use client";

import { useId, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Search, X } from "lucide-react";
import { unitLabel, unitMap } from "@/data";
import { reverseWearerCandidates, reverseWearerExact, type GearFilters } from "@/domain/gear-library";
import type { Unit } from "@/domain/types";
import "./gear-wearer-search.css";

export function GearWearerSearch({ filters, onChange, label, inputRef }: {
  filters: GearFilters;
  onChange: (filters: GearFilters) => void;
  label: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [showOptions, setShowOptions] = useState(false);
  const [active, setActive] = useState(-1);
  const wearer = unitMap.get(filters.wearer);
  const candidates = wearer ? [] : reverseWearerCandidates(filters.query).slice(0, 6);
  const expanded = showOptions && candidates.length > 0;

  function pick(unit: Unit) {
    onChange({ ...filters, query: "", wearer: unit.id });
    setShowOptions(false);
    setActive(-1);
    input.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (wearer || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setShowOptions(false);
      setActive(-1);
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && candidates.length) {
      event.preventDefault();
      setShowOptions(true);
      setActive(index => index < 0
        ? (event.key === "ArrowDown" ? 0 : candidates.length - 1)
        : (index + (event.key === "ArrowDown" ? 1 : -1) + candidates.length) % candidates.length);
    }
    if (event.key === "Enter") {
      const unit = (expanded ? candidates[active] : undefined) ?? reverseWearerExact(filters.query);
      if (unit) {
        event.preventDefault();
        pick(unit);
      }
    }
  }

  return <div className="gear-wearer-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setShowOptions(false);
  }}>
    <div className="gear-wearer-field">
      <Search size={17} aria-hidden="true" />
      {wearer && <button type="button" className="gear-wearer-chip" aria-label={"清除英雄 " + wearer.name}
        onClick={() => {
          onChange({ ...filters, wearer: "" });
          input.current?.focus({ preventScroll: true });
        }}>
        <img src={wearer.image} alt="" width={22} height={22} />
        <span>{wearer.name}</span><X size={13} aria-hidden="true" />
      </button>}
      <input ref={node => {
        input.current = node;
        if (typeof inputRef === "function") inputRef(node);
        else if (inputRef) inputRef.current = node;
      }} type="text" role={wearer ? undefined : "combobox"} autoComplete="off" aria-label={wearer ? "筛选装备" : label}
        aria-autocomplete={wearer ? undefined : "list"} aria-expanded={wearer ? undefined : expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && candidates[active] ? listId + "-" + candidates[active].id : undefined}
        value={filters.query} maxLength={80} placeholder={wearer ? "筛选装备" : label}
        onFocus={() => setShowOptions(true)} onKeyDown={onKeyDown} onChange={event => {
          setShowOptions(true);
          setActive(-1);
          onChange({ ...filters, query: event.target.value });
        }} />
      {filters.query && <button type="button" className="gear-wearer-clear" aria-label="清除装备词" onClick={() => {
        onChange({ ...filters, query: "" });
        setActive(-1);
        input.current?.focus({ preventScroll: true });
      }}><X size={16} aria-hidden="true" /></button>}
    </div>
    {expanded && <ul id={listId} role="listbox" aria-label="按英雄反查" className="gear-wearer-options">
      {candidates.map((unit, index) => <li key={unit.id} id={listId + "-" + unit.id}
        role="option" aria-selected={active === index}
        onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()}
        onClick={() => pick(unit)}>
        <img src={unit.image} alt="" width={30} height={30} />
        <span>{unitLabel(unit).base}{unitLabel(unit).form && <small>{unitLabel(unit).form}</small>}</span>
        <small>{unit.cost} 费</small>
      </li>)}
    </ul>}
  </div>;
}
