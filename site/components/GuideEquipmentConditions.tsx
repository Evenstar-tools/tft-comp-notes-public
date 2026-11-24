import { ItemIcon } from "./ItemIcon";
import { equipmentConditionLabels, guideConditionsAnchor, type GuideCondition, type guideEquipmentConditions } from "@/domain/guide-equipment-conditions";
import { itemLink } from "@/domain/links";

export function GuideConditionIcon({ condition, size }: { condition: GuideCondition; size: number }) {
  if (condition.item) return <ItemIcon item={condition.item} size={size} />;
  return condition.image ? <img src={condition.image} width={size} height={size} alt="" loading="lazy" />
    : <span className="item-icon is-fallback" aria-hidden style={{ width: size, height: size }}>{condition.name.slice(0, 1)}</span>;
}

export function GuideEquipmentConditions({ conditions, guideHref, onViewBoard }: {
  conditions: NonNullable<ReturnType<typeof guideEquipmentConditions>>;
  guideHref?: string;
  onViewBoard?: () => void;
}) {
  const { label, rows, source, wearer } = conditions;
  const title = rows.some(row => row.category === "海克斯") ? "阵容条件" : "装备条件";
  return <section id={guideConditionsAnchor} className="guide-equipment-conditions" aria-label={title}>
    <div className="guide-equipment-conditions-head">
      <h3>{title}</h3>
      <span className="guide-equipment-conditions-context">{onViewBoard ? <button type="button" onClick={onViewBoard} aria-label={`查看${label}棋盘`}>{label}</button> : label}{wearer && " · " + wearer.name}</span>
      {source && <a className="guide-equipment-conditions-source" href={source} target="_blank" rel="noreferrer">条件样本</a>}
    </div>
    <ul>{rows.map(row => <li key={row.id}>
      <a className="guide-equipment-conditions-item" href={row.item ? itemLink(row.id, wearer?.id, guideHref) : row.href}>
        <GuideConditionIcon condition={row} size={34} />
        <span><strong>{row.name}</strong><small>{row.category}</small></span>
      </a>
      <span className="guide-equipment-conditions-kind" data-kind={row.kind}>{row.featured ? "顶级条件" : equipmentConditionLabels[row.kind]}</span>
      <p>{row.replaced && <><strong>换下{row.replaced.name}</strong> · </>}{row.action}</p>
      {row.games !== undefined && <small className="guide-equipment-conditions-sample">{row.item ? "同套实戴" : "实选"} {row.games} 场</small>}
    </li>)}</ul>
  </section>;
}
