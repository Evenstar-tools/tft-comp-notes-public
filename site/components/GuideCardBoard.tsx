import { ArrowUpRight, ChevronDown } from "lucide-react";
import { equipmentLabel } from "@/domain/guide-equipment";
import { guideRoster, type GuideRole } from "@/domain/guide-reading";
import { traitCounts, traitGroup, usedPopulation } from "@/domain/team";
import type { Season, Team } from "@/domain/types";
import { Board } from "./Board";
import { Stars, TraitBadge } from "./Glyphs";
import { ItemIcon } from "./ItemIcon";
import "./guide-card-board.css";

type RosterMember = ReturnType<typeof guideRoster>[number];

function coreRole(role?: string) {
  if (role === "主C" || role === "主输出") return "主C";
  return role === "主坦" ? role : undefined;
}

function shortName(member: RosterMember) {
  return member.unit.id === "renata-glasc" ? "烈娜塔" : member.unit.name.split(" · ")[0];
}

export function GuideCardBoard({ team, data, roles, chaseTargets, eager, title, controls, expanded, strategy, onToggle }: {
  team: Team; data: Season; roles: GuideRole[]; chaseTargets: readonly string[]; eager: boolean;
  title: string; controls: string; expanded: boolean; strategy?: string; onToggle: () => void;
}) {
  const members = guideRoster(team, data, roles);
  const roster = [...members.filter(member => coreRole(member.role)), ...members.filter(member => !coreRole(member.role))];
  const traits = traitCounts(team.pieces, data.units, data.traits, data.items)
    .filter(trait => traitGroup(trait) === "已开常规").slice(0, 3);
  const itemMap = new Map(data.items.map(item => [item.id, item]));
  const lineupLabel = roster.map(({ unit, piece, role }) => {
    const core = coreRole(role);
    return core ? `${unit.name} ${core} ${piece.stars} 星` : unit.name;
  }).join("、");
  const action = expanded ? "收起快看" : "快看棋盘";
  const level = usedPopulation(team.pieces);

  return <button className="guide-card-board-toggle" type="button" aria-label={action + " · " + title}
    aria-expanded={expanded} aria-controls={expanded ? controls : undefined}
    aria-describedby={expanded ? undefined : controls + "-roster"} onClick={onToggle}>
    <span className="guide-card-board-top">
      {expanded ? <span id={controls + "-title"} className="guide-quick-title">
        <strong>{level} 人口棋盘</strong>
        {strategy && strategy !== `${level}级成型` && <small>{strategy}</small>}
      </span> : <span className="guide-card-traits">
        {traits.map(trait => <span key={trait.id} title={(trait.gameName ?? trait.name) + " " + trait.level + (trait.countMode === "stars" ? " 星" : "")}>
          <TraitBadge trait={trait} size={15} tone="active" /><b>{trait.level}</b>
        </span>)}
      </span>}
      <span className="guide-card-board-label">{action} <ChevronDown size={15} aria-hidden="true" /></span>
    </span>
    {!expanded && <>
      <span id={controls + "-roster"} className="sr-only">{lineupLabel}</span>
      <span className="guide-card-avatars">
        {roster.map(member => {
          const { piece, unit, role } = member;
          const chaseThree = piece.stars === 3 && chaseTargets.includes(unit.id);
          const core = coreRole(role);
          return <span className={"guide-card-avatar cost-" + unit.cost} data-core={core} key={piece.instanceId}
            title={unit.name + (chaseThree ? " · 追三星" : core ? ` · ${piece.stars} 星` : "")}>
            <span className="guide-card-portrait">
              <img src={unit.image} alt="" width={56} height={42} draggable={false} loading={eager ? "eager" : "lazy"} decoding="async" />
              {(core || chaseThree) && <Stars className="guide-card-stars" count={piece.stars} size={12} />}
            </span>
            {core && <>
              {piece.items.length > 0 && <span className="guide-card-items">{piece.items.map((id, index) => {
                const item = itemMap.get(id);
                return <span title={item?.name ?? id} key={index}><ItemIcon item={item} size={15} /></span>;
              })}</span>}
              <span className="guide-card-unit">{shortName(member)}</span>
              <span className="guide-card-role">{core}</span>
            </>}
          </span>;
        })}
      </span>
    </>}
  </button>;
}

export function GuideQuickView({ id, team, data, roles, note, href }: {
  id: string; team: Team; data: Season; roles: GuideRole[]; note?: string; href: string;
}) {
  const equipped = guideRoster(team, data, roles).filter(member => member.piece.items.length);
  const core = equipped.filter(member => coreRole(member.role));
  const members = core.length ? core : equipped.slice(0, 3);
  const items = new Map(data.items.map(item => [item.id, item]));

  return <section id={id} className="guide-quick-view" aria-labelledby={id + "-title"}>
    <div className="read-board">
      <Board data={data} pieces={team.pieces} instrumentPositions={team.instrumentPositions}
        selectedId={null} targeting={null} onCell={() => {}} readOnly />
    </div>
    <div className="guide-quick-view-gear">
      <header className="guide-quick-gear-head">
        {members.length > 0 && <h4>{core.length ? "核心配装" : "配装"}</h4>}
        <a className="guide-quick-full" href={href} data-home-board={team.id}>完整攻略 <ArrowUpRight size={14} aria-hidden /></a>
      </header>
      {members.length > 0 &&
        <ul>{members.map(member => {
          const { unit, piece, role } = member;
          return <li key={piece.instanceId}>
            <img className={"guide-piece-portrait cost-" + unit.cost} src={unit.image} alt="" width={38} height={38} loading="lazy" decoding="async" />
            <span className="guide-quick-view-owner">
              <strong>{shortName(member)}</strong>
              <small>{coreRole(role) ? coreRole(role) + " · " : ""}{piece.stars} 星</small>
            </span>
            <span className="guide-quick-view-items">
              {piece.items.map((itemId, index) => {
                const item = items.get(itemId);
                return <span title={item?.name ?? itemId} key={index}>
                  <ItemIcon item={item} size={28} />{item ? equipmentLabel(item) : itemId}
                </span>;
              })}
            </span>
          </li>;
        })}</ul>}
      {note && <p>{note}</p>}
    </div>
  </section>;
}
