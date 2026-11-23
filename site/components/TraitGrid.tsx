"use client";
import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Crosshair, Plus, X } from "lucide-react";
import { season, traitMap, unitMap } from "@/data";
import { relatedUnitIds } from "@/domain/team";
import { matrixAxes, matrixCells, type MatrixAxis } from "@/domain/trait-matrix";
import { traitLibraryLink } from "@/domain/library-navigation";
import type { Unit } from "@/domain/types";
import { TraitBadge } from "./Glyphs";
import { MatrixDialog, MatrixTraitDetails } from "./MatrixDetails";
import { UnitCard } from "./UnitCard";
import { usePageReturnView } from "./usePageReturnView";

const axes = matrixAxes(season.traits, season.units);
const scrollPanels = [".library-columns .trait-grid-scroll"];
export type MatrixReading = { trait?: string; tier?: number; profileAction?: ReactNode };
type MatrixVisit = { panel: "hero" | { trait: string } | null; onlyRelated?: boolean };
const specialNames = new Map(season.units.map(unit => [unit.id,
  unit.traits.flatMap(id => { const t = traitMap.get(id); return t?.axis === "special" ? [t.name] : []; }).join(" / "),
]));

function AxisHeader({ trait, scope, active, onOpen }: {
  trait: MatrixAxis; scope: "col" | "row"; active: boolean; onOpen: (id: string) => void;
}) {
  const name = trait.name;
  return (
    <th scope={scope} data-trait={trait.id} className={active ? "is-active" : undefined}>
      {trait.id.startsWith("other-") ? <span className="axis-other">{name}</span> : (
        <button className="axis-button" type="button" aria-haspopup="dialog"
          aria-label={name + "羁绊资料"} onClick={() => onOpen(trait.id)}>
          <span className="axis-head"><TraitBadge trait={trait} size={18} tone="dim" /><span className="axis-name">{name}</span></span>
          <span className="axis-levels">{trait.thresholds.map((level, index) => (
            <span key={level}>{index > 0 && <>/<wbr /></>}{level}</span>
          ))}{traitMap.get(trait.id)?.countMode === "stars" && "星"}</span>
        </button>
      )}
    </th>
  );
}

export const TraitGrid = memo(function TraitGrid({
  units, selectedId, inTeam, starsInTeam, onSelect, onAdd, onClearSelection, details,
  detailLabel = "查看资料", filtered = false, onClearFilters, reading,
}: {
  units: Unit[];
  selectedId: string | null;
  inTeam: Set<string>;
  starsInTeam?: ReadonlyMap<string, number>;
  onSelect: (id: string) => void;
  onAdd?: (id: string) => void;
  onClearSelection: () => void;
  details: ReactNode;
  detailLabel?: string;
  filtered?: boolean;
  onClearFilters?: () => void;
  reading?: MatrixReading;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const lastTile = useRef<HTMLElement | null>(null);
  const [visit, setVisit] = usePageReturnView<MatrixVisit>(reading ? "heroGridVisit" : undefined, { panel: null }, scrollPanels);
  const { panel, onlyRelated } = visit;
  const setPanel = (panel: MatrixVisit["panel"]) => setVisit(previous => ({ ...previous, panel }));
  const selected = selectedId ? unitMap.get(selectedId) : undefined;
  const selectedTrait = panel && panel !== "hero" ? traitMap.get(panel.trait) : undefined;
  const readingTrait = reading?.trait ? traitMap.get(reading.trait) : undefined;
  useEffect(() => {
    if (!selectedId && onlyRelated) setVisit(previous => ({ ...previous, onlyRelated: false }));
  }, [selectedId, onlyRelated, setVisit]);
  const readingTier = readingTierFor(readingTrait?.id);
  function readingTierFor(traitId?: string) {
    return traitId && readingTrait?.id === traitId && traitMap.get(traitId)?.thresholds.includes(reading?.tier ?? 0)
      ? reading?.tier : undefined;
  }
  const related = useMemo(() => relatedUnitIds(selectedId, season.units), [selectedId]);
  const focused = !!selected && Boolean(onlyRelated);
  const visible = useMemo(() => focused ? units.filter(unit => related.has(unit.id)) : units, [units, related, focused]);
  const { rows, columns, cells } = useMemo(() => matrixCells(visible, axes), [visible]);
  const selectedInView = !!selected && visible.some(unit => unit.id === selected.id);
  const addLabel = selected && inTeam.has(selected.id) ? "再加一枚" : "加入阵容";
  const selectedTraits = selected?.traits.map(id => traitMap.get(id)).filter(trait => !!trait).map(trait => trait.name).join(" / ");

  function locate() {
    const area = viewport.current;
    if (!area) return;
    const last = lastTile.current;
    const tile = last?.closest(".is-selected") && area.contains(last) ? last : area.querySelector<HTMLElement>(".is-selected .unit-card-main");
    if (!tile) return;
    const rect = tile.getBoundingClientRect(), box = area.getBoundingClientRect();
    const corner = area.querySelector(".grid-corner")!.getBoundingClientRect();
    const selection = area.closest(".trait-grid-view")?.querySelector(".matrix-selection");
    const bottom = selection && getComputedStyle(selection).position === "fixed"
      ? Math.min(box.bottom, selection.getBoundingClientRect().top) : Math.min(box.bottom, innerHeight);
    area.scrollBy({ left: rect.left - box.left - corner.width - (area.clientWidth - corner.width - rect.width) / 2,
      top: rect.top - (Math.max(box.top, 0) + corner.height + bottom - rect.height) / 2 });
    tile.focus({ preventScroll: true });
  }
  const showTrait = (id: string) => setPanel({ trait: id });

  return (
    <div className={"trait-grid-view" + (reading ? " is-library-matrix" : "")}>
      <div className="grid-context">
        <div className={"matrix-selection" + (selected ? " has-unit" : "")}>
          <p className="matrix-current" aria-live="polite">{selected ? <>
            <strong>{selected.name}</strong><span>{selectedTraits}</span>
            {inTeam.has(selected.id) && <small>已上阵{starsInTeam?.get(selected.id) ? " · " + starsInTeam.get(selected.id) + "星" : ""}</small>}
          </> : "点棋子看搭档，点表头查羁绊"}</p>
          {selected && <div className="matrix-primary">
            <button type="button" className="chip" aria-haspopup="dialog" onClick={() => setPanel("hero")}>{detailLabel}</button>
            {onAdd && <button type="button" className="chip matrix-add" onClick={() => onAdd(selected.id)}><Plus size={14} aria-hidden />{addLabel}</button>}
            <button type="button" className="matrix-clear" aria-label="清除选择" onClick={onClearSelection}><X size={14} aria-hidden /></button>
          </div>}
        </div>
        <div className="grid-tools">
          <button type="button" className="chip grid-locate" disabled={!selectedInView} onClick={locate}><Crosshair size={13} aria-hidden />定位棋子</button>
          <button type="button" className="chip grid-focus" aria-pressed={focused} disabled={!selected}
            onClick={() => setVisit(previous => ({ ...previous, onlyRelated: !focused }))}>只看同羁绊{focused && " · " + visible.length}</button>
          {readingTrait && <a className="chip grid-performance-link" href={traitLibraryLink(readingTrait.id, readingTier)}>
            {readingTrait.name} · {readingTier ? readingTier + (readingTrait.countMode === "stars" ? "星" : "档") : ""}战绩
          </a>}
        </div>
      </div>
      {focused && filtered && <div className="grid-filter-note" role="status">
        <span>当前筛选内的关联英雄</span><button type="button" className="chip" onClick={onClearFilters}>清除筛选看全部关联</button>
      </div>}
      {!visible.length ? <p className="empty-inline">{focused ? "当前筛选中没有同羁绊英雄，可关闭「只看同羁绊」或重置筛选。" : "没有匹配的英雄，换个筛选试试。"}</p> : (
        <div ref={viewport} className="trait-grid-scroll" role="region" aria-label="羁绊网，可横向和纵向滚动" tabIndex={0}
          onClickCapture={event => { const tile = (event.target as Element).closest<HTMLElement>(".unit-card-main"); if (tile) lastTile.current = tile; }}>
          <table className={"trait-grid" + (selected ? " has-selection" : "")}>
            <thead><tr><th className="grid-corner"><span>职业 →</span><span>主题 ↓</span></th>
              {columns.map(col => <AxisHeader key={col.id} trait={col} scope="col" active={!!selected?.traits.includes(col.id)} onOpen={showTrait} />)}
            </tr></thead>
            <tbody>{rows.map(row => {
              const rowActive = !!selected?.traits.includes(row.id);
              return <tr key={row.id}>
                <AxisHeader trait={row} scope="row" active={rowActive} onOpen={showTrait} />
                {columns.map(col => {
                  const members = cells.get(row.id + "|" + col.id);
                  const colActive = !!selected?.traits.includes(col.id);
                  const intersection = members?.some(unit => unit.id === selectedId);
                  return <td key={col.id} className={intersection ? "in-band is-intersection" : rowActive || colActive ? "in-band" : undefined}>
                    {members && <div className="grid-cell">{members.map(unit =>
                      <UnitCard key={unit.id} unit={unit} variant="tile" selected={unit.id === selectedId}
                        dimmed={!!selected && !related.has(unit.id)} inTeam={inTeam.has(unit.id)}
                        caption={row.id === "other-row" || col.id === "other-column" ? specialNames.get(unit.id) : undefined}
                        teamStars={starsInTeam?.get(unit.id)} onSelect={id => { if (id !== selectedId) onSelect(id); }} onAdd={onAdd} />
                    )}</div>}
                  </td>;
                })}
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
      {selectedTrait && <MatrixDialog title={selectedTrait.name} className={reading ? "matrix-performance-dialog" : ""} onClose={() => setPanel(null)}>
        <MatrixTraitDetails trait={selectedTrait} renderTiers={reading && (effects => <div className="matrix-reading-tiers">
          <p className="matrix-tier-caption">档位战绩</p>
          <dl className="matrix-tiers">
            {selectedTrait.thresholds.map(tier => {
              const label = tier + (selectedTrait.countMode === "stars" ? "星" : "档");
              return <div key={tier}><dt><a href={traitLibraryLink(selectedTrait.id, tier)} aria-current={readingTierFor(selectedTrait.id) === tier || undefined}
                aria-label={selectedTrait.name + label + "战绩"}>{label} →</a></dt>
              <dd>{effects.find(effect => effect.min === tier)?.description}</dd></div>;
            })}
          </dl>
        </div>)} />
      </MatrixDialog>}
      {panel === "hero" && selected && <MatrixDialog className="matrix-hero-dialog" title={<span className="sr-only">{selected.name}</span>}
        onClose={() => setPanel(null)}
        action={reading?.profileAction ?? (onAdd && !inTeam.has(selected.id) ? <button type="button" className="matrix-dialog-add"
          onClick={() => { setPanel(null); onAdd(selected.id); }}><Plus size={14} aria-hidden />加入阵容</button> : undefined)}>
        {details}
      </MatrixDialog>}
    </div>
  );
});
