"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { itemMap, season } from "@/data";
import { emblemItemId, emblemLink } from "@/domain/links";
import { traitActivationText } from "@/domain/trait-activation.mjs";
import reference from "@/data/trait-reference.json";
import type { Trait } from "@/domain/types";

type Reference = {
  summary: string;
  tiers: { min: number; description: string }[];
  emblem?: { name: string; image?: string; components?: string[] };
};
const references: Partial<Record<string, Reference>> = reference;

export function MatrixDialog({ title, onClose, action, children, className = "", closeLabel = "关闭资料" }: {
  title: ReactNode; onClose: () => void; action?: ReactNode; children: ReactNode; className?: string; closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={ref} className={`matrix-dialog ${className}`} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="matrix-dialog-content">
        <header className="matrix-dialog-bar">
          <h2 id={titleId}>{title}</h2>
          {action}
          <button type="button" aria-label={closeLabel} onClick={onClose}><X size={18} aria-hidden /></button>
        </header>
        <div className="matrix-dialog-body">{children}</div>
      </div>
    </dialog>
  );
}

export function MatrixTraitDetails({ trait, compact = false, showEmblem = true, showBasicActivation = true, renderTiers }: {
  trait: Trait; compact?: boolean; showEmblem?: boolean; showBasicActivation?: boolean;
  renderTiers?: (tiers: Reference["tiers"]) => ReactNode;
}) {
  const info = references[trait.id];
  const holderName = trait.axis === "special" ? season.units.find(unit => unit.traits.includes(trait.id))?.name : undefined;
  const effect = info?.summary || trait.description.replace(/^\s*[(（]1[)）]\s*/, "");
  const emblemItem = itemMap.get(emblemItemId(trait.id));
  const emblem = info?.emblem ?? emblemItem;
  const activation = traitActivationText(trait, holderName, showBasicActivation);
  return (
    <div className={compact ? "matrix-trait-info is-inline" : "matrix-trait-info"}>
      {activation && <p><strong className="matrix-rule-label">开启条件</strong>{activation}</p>}
      {effect && <p>{effect}</p>}
      {renderTiers ? renderTiers(info?.tiers ?? []) : !!info?.tiers.length && <dl className="matrix-tiers">{info.tiers.map(tier => (
        <div key={tier.min}><dt>{tier.min}</dt><dd>{tier.description}</dd></div>
      ))}</dl>}
      {showEmblem && emblem && <section className="matrix-emblem">
        {emblem.image && <img src={emblem.image} width={32} height={32} alt="" />}
        <div>{emblemItem ? <a className="text-link" href={emblemLink(trait.id)}>{emblem.name}</a> : <strong>{emblem.name}</strong>}{!!emblem.components?.length &&
          <small>{emblem.components.map(id => itemMap.get(id)?.name ?? id).join(" + ")}</small>}</div>
      </section>}
    </div>
  );
}
