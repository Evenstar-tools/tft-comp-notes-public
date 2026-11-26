"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, UserMinus, X } from "lucide-react";
import { useMemo } from "react";
import { maxExcludedWearers } from "@/domain/gear-library";
import { guideSearchKey } from "@/domain/guide-search";
import type { Unit } from "@/domain/types";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import "./wearer-exclusion.css";

export function WearerExclusion({ units, excluded, onChange }: {
  units: Unit[];
  excluded: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const names = useMemo(() => new Map(units.map(unit => [unit.id, unitSearchNames(unit).map(guideSearchKey)])), [units]);
  const selected = useMemo(() => excluded.flatMap(id => units.find(unit => unit.id === id) ?? []), [excluded, units]);
  const full = selected.length >= maxExcludedWearers;
  function matches(unit: Unit, query: string) {
    const needle = guideSearchKey(query);
    return !needle || Boolean(names.get(unit.id)?.some(name => name.includes(needle)));
  }

  return <Combobox.Root multiple items={units} value={selected} filter={matches} autoHighlight limit={6}
    itemToStringLabel={unit => unit.name} itemToStringValue={unit => unit.id} onValueChange={next => {
      if (next.length <= maxExcludedWearers) onChange(next.map(unit => unit.id));
    }}>
    <div className="wearer-exclude" data-excluded={selected.length ? "" : undefined}>
      <Combobox.InputGroup className="wearer-exclude-field">
        <UserMinus size={17} aria-hidden="true" className="wearer-exclude-icon" />
        <Combobox.Input aria-label="剔除棋子，最多两个" autoComplete="off" spellCheck={false}
          placeholder={full ? "已剔除 2 个" : selected.length ? "再剔除一个" : "剔除棋子（最多 2 个）"} />
      </Combobox.InputGroup>
      {!!selected.length && <Combobox.Chips className="wearer-exclude-chips" aria-label="已剔除棋子">
        {selected.map(unit => <Combobox.Chip className="wearer-exclude-chip" key={unit.id}>
          <span title={unit.name}>{unit.name}</span>
          <Combobox.ChipRemove tabIndex={0} aria-label={"恢复" + unit.name} title={"恢复" + unit.name}>
            <X size={14} aria-hidden="true" />
          </Combobox.ChipRemove>
        </Combobox.Chip>)}
      </Combobox.Chips>}
    </div>
    <Combobox.Portal>
      <Combobox.Positioner className="wearer-exclude-positioner" align="end" sideOffset={6} collisionPadding={10}>
        <Combobox.Popup className="wearer-exclude-popup">
          <Combobox.Empty className="wearer-exclude-empty">没有找到棋子</Combobox.Empty>
          <Combobox.List className="wearer-exclude-list" aria-label="可剔除棋子">
            {(unit: Unit) => <Combobox.Item key={unit.id} value={unit} className="wearer-exclude-option"
              disabled={full && !excluded.includes(unit.id)}>
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
