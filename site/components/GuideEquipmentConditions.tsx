import { ArrowRight } from "lucide-react";
import { ItemIcon } from "./ItemIcon";
import { guideConditionHasName, guideConditionName, guideConditionTag, guideConditionsAnchor, type GuideCondition, type guideEquipmentConditions } from "@/domain/guide-equipment-conditions";
import { itemLink } from "@/domain/links";

export function GuideConditionIcon({ condition, size }: { condition: GuideCondition; size: number }) {
  if (condition.item) return <ItemIcon item={condition.item} size={size} />;
  return condition.image ? <img src={condition.image} width={size} height={size} alt="" loading="lazy" />
    : <span className="item-icon is-fallback" aria-hidden style={{ width: size, height: size }}>{condition.name.slice(0, 1)}</span>;
}

export function GuideEquipmentConditions({ conditions, guideHref, onViewBoard, anchored = true }: {
  conditions: NonNullable<ReturnType<typeof guideEquipmentConditions>>;
  guideHref?: string;
  onViewBoard?: () => void;
  anchored?: boolean;
}) {
  const { board, guideWide, label, rows, source, wearer } = conditions;
  const title = guideWide ? "定阵条件" : rows.some(row => row.featured) ? "顶级条件"
    : rows.some(row => row.category === "海克斯" || row.recipient) ? "阵容条件" : "装备条件";
  const singleAugment = rows.length === 1 && rows[0].category === "海克斯" && !label && !source && !board?.conditions;
  return <section id={anchored ? guideConditionsAnchor : undefined} className="guide-equipment-conditions" aria-label={title}>
    {!singleAugment && <div className="guide-equipment-conditions-head">
      <h3>{title}</h3>
      {(label || wearer) && <span className="guide-equipment-conditions-context">
        {label && (onViewBoard ? <button type="button" onClick={onViewBoard} aria-label={`查看${label}棋盘`}>{label}</button> : label)}
        {wearer && (label ? " · " : "") + wearer.name}
      </span>}
    </div>}
    <ul>{rows.map(row => {
      const name = guideConditionName(row);
      const swapLabel = row.replaced ? `${name}，替换${row.replaced.name}` : name;
      const tag = guideConditionTag(row);
      const augment = row.category === "海克斯";
      const showName = guideConditionHasName(row);
      return <li key={row.id + ":" + (row.recipient?.id ?? "")} data-augment={augment || undefined} data-named={showName || undefined}>
        <a className="guide-equipment-conditions-item" data-named={showName || undefined} href={row.item ? itemLink(row.id, row.recipient?.id ?? wearer?.id, guideHref) : row.href}
          aria-label={swapLabel} title={swapLabel}>
          <GuideConditionIcon condition={row} size={34} />
          {showName && <strong>{name}</strong>}
        </a>
        {row.replaced && <>
          {row.recipient ? <span className="guide-equipment-condition-detail">替换</span>
            : <ArrowRight className="guide-equipment-conditions-arrow" size={16} aria-hidden />}
          <a className="guide-equipment-conditions-item" href={itemLink(row.replaced.id, row.recipient?.id ?? wearer?.id, guideHref)}
            aria-label={`替换${row.replaced.name}`} title={`替换${row.replaced.name}`}>
            <ItemIcon item={row.replaced} size={34} />
          </a>
        </>}
        {tag && <span className="guide-condition-tag">{tag}</span>}
        {row.kind === "option" && <span className="guide-equipment-condition-detail">可选</span>}
        {row.detail && <span className="guide-equipment-condition-detail">{row.detail}</span>}
      </li>;
    })}</ul>
    {source && <a className="guide-equipment-conditions-source" href={source} target="_blank" rel="noreferrer">装备样本</a>}
  </section>;
}
