"use client";

import { useState } from "react";
import { itemMap } from "@/data";
import { augmentHref } from "@/domain/augment-library";
import { itemLink } from "@/domain/links";
import { itemAliases } from "@/domain/roster-import";
import { heroAugmentGearSource, type HeroAugment } from "@/domain/hero-augments";
import type { Unit } from "@/domain/types";
import { ItemIcon } from "./ItemIcon";
import "./hero-augment-details.css";

const shortNames = new Map(Object.entries(itemAliases).map(([short, full]) => [full, short]));

export function HeroAugmentGear({ augment, wornItems }: { augment: HeroAugment; wornItems?: string[] }) {
  const equipped = wornItems && [...wornItems].sort().join(",");
  const builds = augment.gear.filter(build => [...build.items].sort().join(",") !== equipped);
  if (!builds.length) return null;
  const label = builds.length === augment.gear.length ? "强化后配装" : "强化后备选";
  return <section className="hero-augment-gear" aria-label={label}>
    <header>
      <h3>{label}</h3>
      <a href={heroAugmentGearSource} target="_blank" rel="noreferrer">出装参考</a>
    </header>
    <ul className="hero-augment-builds">
      {builds.map(build => <li key={build.label}>
        <h4>{build.label}</h4>
        <ul className="hero-augment-items">{build.items.map((id, index) => {
          const item = itemMap.get(id);
          return item && <li key={id + index}>
            <a href={itemLink(id, augment.unitId)} title={item.name} aria-label={item.name}>
              <ItemIcon item={item} size={28} />{shortNames.get(item.name) ?? item.name}
            </a>
          </li>;
        })}</ul>
        <p>{build.note}</p>
      </li>)}
    </ul>
  </section>;
}

export function HeroSkill({ unit, augment, defaultAugmented = false, augmented, onAugmentedChange, showGear = true, sectionId, wornItems }: {
  unit: Unit;
  augment?: HeroAugment;
  defaultAugmented?: boolean;
  augmented?: boolean;
  onAugmentedChange?: (value: boolean) => void;
  showGear?: boolean;
  sectionId?: string;
  wornItems?: string[];
}) {
  const [localAugmented, setLocalAugmented] = useState(defaultAugmented);
  const enhanced = augment && (augmented ?? localAugmented) ? augment : undefined;
  const setMode = onAugmentedChange ?? setLocalAugmented;
  const name = enhanced?.label ?? unit.abilityName;
  const mana = enhanced ? enhanced.startingMana + "/" + enhanced.maxMana : unit.mana;
  const role = enhanced?.role ?? augment?.baseRole;
  return <>
    <section className="detail-section hero-skill" id={sectionId} tabIndex={sectionId ? -1 : undefined}>
      <div className="hero-skill-heading">
        <h3>技能</h3>
        {augment && <div className="hero-skill-switch" role="group" aria-label="技能形态">
          <button type="button" aria-pressed={!enhanced} onClick={() => setMode(false)}>常规</button>
          <button type="button" aria-pressed={!!enhanced} onClick={() => setMode(true)}>强化后</button>
        </div>}
      </div>
      {(name || mana || role) && <div className="ability-head">
        <div className="hero-skill-name">
          {enhanced ? <a href={augmentHref(enhanced.id)}>{name}</a> : name && <strong>{name}</strong>}
          {role && <span className="hero-skill-role">{role}</span>}
        </div>
        {mana && <span className="mana">法力 {mana}</span>}
      </div>}
      <p className="ability-text">{(enhanced ? enhanced.ability : unit.ability) || "技能资料待补充"}</p>
    </section>
    {enhanced && showGear && <HeroAugmentGear augment={enhanced} wornItems={wornItems} />}
  </>;
}
