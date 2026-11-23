"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronRight, Lock, Plus } from "lucide-react";
import { traitMap, unitLabel } from "@/data";
import type { Trait, Unit } from "@/domain/types";
import { unlockText } from "@/domain/unlocks";
import { TraitBadge } from "./Glyphs";
import { HeroArtwork } from "./HeroArtwork";
import { MatrixDialog, MatrixTraitDetails } from "./MatrixDetails";
import "./editor-unit-details.css";

type Detail = "ability" | "unlock" | Trait;

export function EditorUnitDetails({ unit, onAdd }: { unit: Unit; onAdd?: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const { base, form } = unitLabel(unit);
  const traits = unit.traits.map(id => traitMap.get(id)).filter(trait => !!trait);
  const condition = unlockText(unit);
  const unlockNote = unit.unlock?.note || unit.sourceUnlock?.note;
  const heroHref = "/heroes?" + new URLSearchParams({ unit: unit.id });
  const abilityName = unit.abilityName || "技能";
  const abilityText = unit.ability || "技能资料待补充";

  return (
    <article className={`editor-unit-details cost-${unit.cost}`} aria-label={`${unit.name}资料`}>
      <header className="editor-unit-identity">
        <HeroArtwork unit={unit} className="editor-unit-art" />
        <img className="editor-unit-portrait" src={unit.image} alt="" width={42} height={42} />
        <div>
          <p className="editor-unit-cost">{unit.cost} 费{form && <span> · {form}</span>}</p>
          <h2>{base}</h2>
        </div>
        <a className="editor-unit-external" href={heroHref} target="_blank" rel="noreferrer"
          aria-label={`打开${unit.name}英雄详情`} title="在新标签页查看英雄详情">
          <ArrowUpRight size={15} aria-hidden />
        </a>
      </header>

      <section className="editor-unit-section" aria-label="技能">
        <div className="editor-unit-section-head">
          <h3 aria-label={abilityName}>
            {unit.ability ? <button className="editor-unit-more" type="button" aria-label="完整技能"
              title="查看完整技能" aria-haspopup="dialog" onClick={() => setDetail("ability")}>
              {abilityName}<ChevronRight size={12} aria-hidden />
            </button> : abilityName}
          </h3>
          {unit.mana && <span className="editor-unit-stat">法力 {unit.mana}</span>}
        </div>
        <p className="editor-unit-ability">{abilityText}</p>
      </section>

      {condition && <section className="editor-unit-section" aria-label="解锁条件">
        <button className="editor-unit-unlock" type="button" aria-haspopup="dialog" onClick={() => setDetail("unlock")}>
          <span><Lock size={13} aria-hidden />解锁条件</span>
          <ChevronRight size={14} aria-hidden />
        </button>
        <p>{condition}</p>
      </section>}

      {traits.length > 0 && <section className="editor-unit-section" aria-label="羁绊">
        <h3>羁绊</h3>
        <div className="editor-unit-traits">
          {traits.map(trait => <button key={trait.id} type="button" className="editor-unit-trait"
            aria-haspopup="dialog" aria-label={`查看${trait.name}羁绊`} onClick={() => setDetail(trait)}>
            <TraitBadge trait={trait} size={17} />
            <span>{trait.name}</span>
            <small>
              {trait.dynamic ? "动态" : trait.thresholds.join(" · ")}
              {!trait.dynamic && trait.thresholds.length > 0 && trait.countMode === "stars" && " 星"}
            </small>
            <ChevronRight size={13} aria-hidden />
          </button>)}
        </div>
      </section>}

      {onAdd && <button className="btn secondary sm" type="button" onClick={onAdd}>
        <Plus size={14} aria-hidden />加入阵容
      </button>}

      {detail && <MatrixDialog
        title={detail === "ability" ? abilityName : detail === "unlock" ? "解锁条件" : detail.name}
        onClose={() => setDetail(null)}>
        {typeof detail === "object" ? <MatrixTraitDetails trait={detail} /> :
          <div className="editor-unit-full-text">
            {detail === "ability" && unit.mana && <p className="editor-unit-stat">法力 {unit.mana}</p>}
            <p>{detail === "ability" ? abilityText : condition}</p>
            {detail === "unlock" && unlockNote && <p className="editor-unit-stat">{unlockNote}</p>}
          </div>}
      </MatrixDialog>}
    </article>
  );
}
