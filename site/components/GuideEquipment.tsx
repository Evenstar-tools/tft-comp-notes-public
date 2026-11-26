"use client";
import { useEffect, useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { guideRoster, type GuideRole } from "@/domain/guide-reading";
import { compactUtilityCopy } from "@/domain/guide-copy";
import { equipmentLabel } from "@/domain/guide-equipment";
import { guideOpeningGear } from "@/domain/guide-execution";
import { itemLink } from "@/domain/links";
import type { Piece, Season, Team, Unit } from "@/domain/types";
import { ItemIcon } from "./ItemIcon";
import { matchingBuildScope, ThirdGear } from "./GuideEquipmentTools";

const unitShortNames: Record<string, string> = { "nunu-willump": "努努", "renata-glasc": "烈娜塔" };
const openingItemNames: Record<string, string> = {
  TFT_Item_UnstableConcoction: "正义",
  TFT_Item_RunaansHurricane: "海妖",
};

export function GuideEquipment({ team, data, roles, selectedPiece, onSelectPiece, guideHref, sectionId, guideStats = true }: {
  team: Team; data: Season; roles: GuideRole[]; selectedPiece: string; onSelectPiece: (id: string, trigger: HTMLButtonElement) => void; guideHref?: string;
  sectionId?: string; guideStats?: boolean;
}) {
  const [showNames, setShowNames] = useState(false);
  const loadoutsId = useId();
  useEffect(() => {
    try { setShowNames(sessionStorage.getItem("tft.guide.showGearNames") === "true"); } catch { /* Storage is optional. */ }
  }, []);
  const items = new Map(data.items.map(item => [item.id, item]));
  const members = guideRoster(team, data, roles);
  const equipped = members.filter(member => member.piece.items.length);
  const sample = guideStats ? matchingBuildScope(team, data) : undefined;
  const opening = sectionId && guideOpeningGear(sectionId, team, data);
  const others = members.filter(member => !member.piece.items.length);
  const utilities = roles.filter(role => role.label === "功能装");
  if (!members.length) return null;

  function utilityNote(unitId: string) {
    return [...new Set(utilities.filter(role => role.units.includes(unitId)).map(role =>
      compactUtilityCopy(role.text, unitId, team, data)).filter(Boolean))].join(" ");
  }

  function memberButton({ piece, unit, role }: { piece: Piece; unit: Unit; role?: string }) {
    const repeated = members.some(member => member.unit.id === unit.id && member.piece.instanceId !== piece.instanceId);
    const label = unit.name + (repeated ? " · 第 " + (Math.floor(piece.position / 7) + 1) + " 排第 " + (piece.position % 7 + 1) + " 格" : "");
    const utility = role !== "功能装" && utilities.some(entry => entry.units.includes(unit.id));
    const description = [role, utility && "功能装", piece.stars + " 星"].filter(Boolean).join(" · ");
    return <button className="guide-member-button" type="button" aria-label={label} aria-description={description}
      aria-pressed={selectedPiece === piece.instanceId} onClick={event => onSelectPiece(piece.instanceId, event.currentTarget)}>
      <img src={unit.image} width={42} height={42} alt="" loading="lazy" className={"guide-piece-portrait cost-" + unit.cost} />
      <span><strong title={unit.name}>{unitShortNames[unit.id] ?? unit.name}</strong><small>{description}</small></span>
    </button>;
  }

  const roster = <ul className="guide-other-units" aria-label={equipped.length ? "其余棋子" : "棋子名单"}>
    {others.map(member => {
      const note = utilityNote(member.unit.id);
      return <li key={member.piece.instanceId}>{memberButton(member)}
        {note && <p className="guide-loadout-note">{note}</p>}</li>;
    })}
  </ul>;
  return <section className="guide-gear" aria-label="当前棋盘配装">
    <div className="guide-gear-heading">
      <h3>{equipped.length ? "配装" : "阵容棋子"}</h3>
      {!!equipped.length && <label className="guide-gear-name-toggle">
        <input type="checkbox" checked={showNames} aria-controls={loadoutsId} onChange={event => {
          const checked = event.currentTarget.checked;
          setShowNames(checked);
          try { sessionStorage.setItem("tft.guide.showGearNames", String(checked)); } catch { /* Keep the selection in this view. */ }
        }} />装备名
      </label>}
    </div>
    {opening && <section className="guide-opening-gear" aria-label="开装与接装">
      <h4>开装与接装</h4>
      <ul>{opening.rows.map(row => <li key={row.to.id} className="guide-gear-handoff">
        <div className="guide-gear-first">
          <span className="guide-gear-first-icons">{row.items.map(item =>
            <a key={item.id} href={itemLink(item.id, row.to.id, guideHref)} aria-label={item.name} title={item.name}>
              <ItemIcon item={item} size={21} />
            </a>)}
          </span>
          <span>{row.items.map(item => openingItemNames[item.id] ?? equipmentLabel(item)).join("、")}</span>
        </div>
        <span className="guide-gear-holder"><img src={row.from.image} width={22} height={22} alt="" />{row.fromLabel}先带</span>
        <span className="guide-gear-holder guide-gear-recipient"><ArrowRight size={15} aria-hidden />
          <img src={row.to.image} width={22} height={22} alt="" />{row.toLabel}{["", "一", "两", "三"][row.stars]}星接
        </span>
      </li>)}</ul>
      <p>{opening.note}</p>
    </section>}
    {!!equipped.length && <ul className="guide-loadouts" id={loadoutsId} data-item-names={showNames || undefined}>{equipped.map(member => {
      const utility = utilityNote(member.unit.id);
      return <li className="guide-loadout" key={member.piece.instanceId}>
        {memberButton(member)}
        <ul className="guide-loadout-gear">{member.piece.items.map((id, index) => {
          const item = items.get(id);
          return <li key={id + index}>{item
            ? <a className="guide-loadout-slot" href={itemLink(id, member.unit.id, guideHref)} aria-label={item.name} data-item-name={item.name}>
                <ItemIcon item={item} size={36} />
                {showNames && <span className="guide-item-label">{equipmentLabel(item)}</span>}
              </a>
            : <span className="guide-loadout-slot" role="img" title={id} aria-label={"未知装备 " + id}><ItemIcon size={36} /></span>}</li>;
        })}</ul>
        {utility && <p className="guide-loadout-note">{utility}</p>}
        {sample?.unitId === member.unit.id && sample.stars === member.piece.stars &&
          <ThirdGear sample={sample} piece={member.piece} items={items} traitName={data.traits.find(trait => trait.id === sample.traitId)?.name ?? ""} />}
      </li>;
    })}</ul>}
    {!equipped.length ? roster : !!others.length && <details className="guide-unequipped">
      <summary>其余棋子 <span>{others.length}</span></summary>
      {roster}
    </details>}
  </section>;
}
