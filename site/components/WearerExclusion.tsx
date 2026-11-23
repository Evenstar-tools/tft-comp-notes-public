"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, UserMinus, X } from "lucide-react";
import { useMemo } from "react";
import { guideSearchKey } from "@/domain/guide-search";
import type { Unit } from "@/domain/types";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import "./wearer-exclusion.css";

export function WearerExclusion({ units, excluded, onChange }: {
  units: Unit[];
  excluded: string;
  onChange: (id: string) => void;
}) {
  const names = useMemo(() => new Map(units.map(unit => [unit.id, unitSearchNames(unit).map(guideSearchKey)])), [units]);
  const selected = units.find(unit => unit.id === excluded) ?? null;
  function matches(unit: Unit, query: string) {
    const needle = guideSearchKey(query);
    return !needle || Boolean(names.get(unit.id)?.some(name => name.includes(needle)));
  }

  return <Combobox.Root items={units} value={selected} filter={matches} autoHighlight limit={6}
    itemToStringLabel={unit => unit.name} itemToStringValue={unit => unit.id} onValueChange={unit => onChange(unit?.id ?? "")}>
    <Combobox.InputGroup className="wearer-exclude" data-excluded={selected ? "" : undefined}>
      <UserMinus size={17} aria-hidden="true" className="wearer-exclude-icon" />
      <Combobox.Input aria-label="剔除棋子" placeholder="搜棋子并剔除" autoComplete="off" spellCheck={false}
        onFocus={event => event.currentTarget.select()} />
      <Combobox.Clear tabIndex={0} className="wearer-exclude-clear" aria-label="清除剔除" title="清除剔除">
        <X size={16} aria-hidden="true" />
      </Combobox.Clear>
    </Combobox.InputGroup>
    <Combobox.Portal>
      <Combobox.Positioner className="wearer-exclude-positioner" align="end" sideOffset={6} collisionPadding={10}>
        <Combobox.Popup className="wearer-exclude-popup">
          <Combobox.Empty className="wearer-exclude-empty">没有找到棋子</Combobox.Empty>
          <Combobox.List className="wearer-exclude-list" aria-label="可剔除棋子">
            {(unit: Unit) => <Combobox.Item key={unit.id} value={unit} className="wearer-exclude-option">
              <span className="wearer-exclude-unit">
                <img src={unit.image} alt="" width={26} height={26} loading="lazy" className={"cost-" + unit.cost} />
                <span>{unit.name}</span>
              </span>
              <Combobox.ItemIndicator><Check size={16} aria-hidden="true" /></Combobox.ItemIndicator>
            </Combobox.Item>}
          </Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  </Combobox.Root>;
}
