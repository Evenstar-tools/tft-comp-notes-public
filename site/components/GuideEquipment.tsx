"use client";
import { useEffect, useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { complementItems, guideRoster, type GuideRole } from "@/domain/guide-reading";
import { compactUtilityCopy } from "@/domain/guide-copy";
import { equipmentLabel } from "@/domain/guide-equipment";
import { guideOpeningGear } from "@/domain/guide-execution";
import { itemLink } from "@/domain/links";
import type { Item, Piece, Season, Team, Unit } from "@/domain/types";
import { ItemIcon } from "./ItemIcon";
import { CarouselGear, matchingBuildScope, ThirdGear } from "./GuideEquipmentTools";

const unitShortNames: Record<string, string> = { "nunu-willump": "努努", "renata-glasc": "烈娜塔" };
const openingItemNames: Record<string, string> = {
  TFT_Item_UnstableConcoction: "正义",
  TFT_Item_RunaansHurricane: "海妖",
};

export function GuideEquipment({ team, data, roles, selectedPiece, onSelectPiece, guideHref, sectionId, guideStats = true }: {
  team: Team; data: Season; roles: GuideRole[]; selectedPiece: string; onSelectPiece: (id: string, trigger: HTMLButtonElement) => void; guideHref?: string;
  sectionId?: string; guideStats?: boolean;
}) {
  const [partId, setPartId] = useState("");
  const [showNames, setShowNames] = useState(false);
  const loadoutsId = useId();
  useEffect(() => {
    try { setShowNames(sessionStorage.getItem("tft.guide.showGearNames") === "true"); } catch { /* Storage is optional. */ }
  }, []);
  const items = new Map(data.items.map(item => [item.id, item]));
  const units = new Map(data.units.map(unit => [unit.id, unit]));
  const members = guideRoster(team, data, roles);
  const equipped = members.filter(member => member.piece.items.length);
  const targets = equipped.flatMap(({ piece, unit }) => piece.items.flatMap(id => {
    const item = items.get(id);
    return item?.components?.length === 2 && item.components.every(part => items.has(part)) ? [{ owner: unit.name, item }] : [];
  }));
  const sample = guideStats ? matchingBuildScope(team, data) : undefined;
  const opening = sectionId && guideOpeningGear(sectionId, team, data);
  const others = members.filter(member => !member.piece.items.length);
  const utilities = roles.filter(role => role.label === "功能装");
  const owners = new Map<string, string[]>();
  for (const piece of team.pieces) for (const id of new Set(piece.items)) {
    const list = owners.get(id) ?? [];
    if (!list.includes(piece.unitId)) list.push(piece.unitId);
    owners.set(id, list);
  }
  const used = [...owners.keys()].map(id => items.get(id)).filter((item): item is Item => !!item);
  const components = [...new Set(used.flatMap(item => item.components ?? []))].flatMap(id => items.get(id) ?? []);
  const name = (id: string) => units.get(id)?.name ?? id;
  if (!members.length) return null;

  function utilityNote(unitId: string) {
    return [...new Set(utilities.filter(role => role.units.includes(unitId)).map(role =>
      compactUtilityCopy(role.text, unitId, team, data)).filter(Boolean))].join(" ");
  }

  function memberButton({ piece, unit, role }: { piece: Piece; unit: Unit; role?: string }) {
    const repeated = members.some(member => member.unit.id === unit.id && member.piece.instanceId !== piece.instanceId);
    const label = unit.name + (repeated ? " · 第 " + (Math.floor(piece.position / 7) + 1) + " 排第 " + (piece.position % 7 + 1) + " 格" : "");
    return <button className="guide-member-button" type="button" aria-label={label} aria-description={[role, piece.stars + " 星"].filter(Boolean).join(" · ")}
      aria-pressed={selectedPiece === piece.instanceId} onClick={event => onSelectPiece(piece.instanceId, event.currentTarget)}>
      <img src={unit.image} width={42} height={42} alt="" loading="lazy" className={"guide-piece-portrait cost-" + unit.cost} />
      <span><strong title={unit.name}>{unitShortNames[unit.id] ?? unit.name}</strong><small>{role && <>{role} · </>}{piece.stars} 星</small></span>
    </button>;
  }

  const roster = <ul className="guide-other-units" aria-label={equipped.length ? "其余棋子" : "棋子名单"}>
    {others.map(member => {
      const note = utilityNote(member.unit.id);
      return <li key={member.piece.instanceId}>{memberButton(member)}
        {note && <p className="guide-loadout-note">{note}</p>}</li>;
    })}
  </ul>;
  const recipes = components.length ? <div className="guide-parts">
    <div className="guide-part-options" role="group" aria-label="按手中散件查成装">{components.map(part =>
      <button type="button" key={part.id} onClick={() => setPartId(partId === part.id ? "" : part.id)} title={part.name} aria-label={part.name} aria-pressed={partId === part.id}>
        <ItemIcon item={part} size={30} /></button>)}</div>
    {partId && <div className="guide-builds" aria-live="polite">{used.filter(item => item.components?.includes(partId)).map(item => {
      const wearers = owners.get(item.id) ?? [];
      return <div className="guide-item-row" key={item.id}><ItemIcon item={item} size={30} /><div>
        <a className="guide-item-link" href={itemLink(item.id, wearers.length === 1 ? wearers[0] : undefined, guideHref)}>{item.name}</a>
        <span>还缺{complementItems(item.components ?? [], partId).map(id => items.get(id)?.name ?? id).join("、")}</span>
        <small>{wearers.map(name).join("、")}</small>
      </div></div>;
    })}</div>}
  </div> : undefined;

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
    {equipped.length ? <div className="guide-gear-tools">
      <CarouselGear targets={targets} items={items} seasonId={data.id} recipes={recipes} />
      {!!others.length && <details className="guide-unequipped">
        <summary>其余棋子 <span>{others.length}</span></summary>
        {roster}
      </details>}
    </div> : roster}
  </section>;
}
