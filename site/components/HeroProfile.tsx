"use client";

import { ArrowLeft, ArrowUpRight, ChevronDown, SquarePen } from "lucide-react";
import type { ReactNode } from "react";
import { season, traitMap, unitLabel } from "@/data";
import type { HeroGuideIndex } from "@/domain/hero-guides";
import type { Unit } from "@/domain/types";
import { heroAugmentForUnit } from "@/domain/hero-augments";
import { TraitBadge } from "./Glyphs";
import { HeroBoardContext } from "./HeroBoardContext";
import { HeroAugmentGear } from "./HeroAugmentDetails";
import { HeroArtwork } from "./HeroArtwork";
import { UnitDetails } from "./UnitBrowser";
import "@/app/heroes/hero-profile.css";

const costGroups = [...new Set(season.units.map(unit => unit.cost))].sort((a, b) => a - b);

export function HeroProfile({ unit, guides, statsContent, returnHref, backLabel, onBack, onSelect, editorHref, augmentId, onAugmentChange }: {
  unit: Unit;
  guides: HeroGuideIndex[string] | null;
  statsContent: ReactNode;
  returnHref: string;
  backLabel: string;
  onBack: () => void;
  onSelect: (id: string) => void;
  editorHref?: string;
  augmentId?: string;
  onAugmentChange: (id: string) => void;
}) {
  const { base, form } = unitLabel(unit);
  const augment = heroAugmentForUnit(unit.id, season.id);
  const enhanced = !!augment && augment.id === augmentId;
  const related = guides?.filter(guide => enhanced ? guide.augmentId === augment?.id : !guide.augmentId) ?? null;
  const boardContext = <HeroBoardContext unit={unit} guides={related} returnHref={returnHref} hideGear={enhanced} />;
  return (
    <div className={"hero-profile" + (enhanced ? " is-augmented" : "")}>
      <div className="hero-profile-bar">
        <button type="button" className="hero-profile-back" onClick={onBack}><ArrowLeft size={17} aria-hidden />{backLabel}</button>
        <label className="hero-profile-picker">
          <select aria-label="切换英雄" value={unit.id} onChange={event => onSelect(event.target.value)}>
            {costGroups.map(cost => <optgroup key={cost} label={cost + " 费"}>
              {season.units.filter(option => option.cost === cost).map(option =>
                <option key={option.id} value={option.id}>{option.name}</option>)}
            </optgroup>)}
          </select>
          <ChevronDown size={14} aria-hidden />
        </label>
      </div>
      <header className={`hero-profile-banner cost-${unit.cost}${unit.splashImage ? " has-splash" : ""}`}>
        <HeroArtwork unit={unit} className="hero-profile-splash" eager />
        <div className="hero-profile-title">
          <img className="hero-profile-portrait" src={unit.image} alt="" width={80} height={80} />
          <div className="hero-profile-labels">
            <span className="hero-profile-cost">{unit.cost} 费</span>
            <h1 tabIndex={-1}>{base} {form && <small>{form}</small>}</h1>
            <div className="hero-profile-traits">
              {unit.traits.map(id => {
                const trait = traitMap.get(id);
                return trait && <a href={"/traits?trait=" + encodeURIComponent(id)} key={id}>
                  <TraitBadge trait={trait} size={15} />{trait.name}
                </a>;
              })}
            </div>
          </div>
        </div>
        {unit.splashImage && <a className="hero-profile-art" href={unit.splashImage}
          target="_blank" rel="noreferrer" aria-label="查看高清原画" title="查看高清原画"><ArrowUpRight size={17} aria-hidden /></a>}
      </header>
      <div className="hero-profile-columns">
        <div className="hero-profile-context">
          <div className="hero-profile-reference">
            <UnitDetails unit={unit} embedded action={enhanced ? undefined : boardContext} showAugmentGear={false}
              augmented={enhanced} onAugmentedChange={value => onAugmentChange(value ? augment?.id ?? "" : "")} />
          </div>
          {editorHref && <a className="hero-profile-build-link" href={editorHref}><SquarePen size={16} aria-hidden />用此英雄构建阵容</a>}
        </div>
        {enhanced ? <div className="hero-profile-evidence">
          <div className="hero-profile-gear"><HeroAugmentGear augment={augment} /></div>
          {!!related?.length && <div className="hero-profile-support hero-profile-performance">{boardContext}</div>}
        </div> : <div className="hero-profile-evidence">
          {statsContent}
        </div>}
      </div>
    </div>
  );
}
