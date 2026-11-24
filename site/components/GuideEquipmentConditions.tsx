import { ArrowRight } from "lucide-react";
import { ItemIcon } from "./ItemIcon";
import { guideConditionTag, guideConditionsAnchor, type GuideCondition, type guideEquipmentConditions } from "@/domain/guide-equipment-conditions";
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
  const singleAugment = rows.length === 1 && rows[0].category === "海克斯" && !label && !source;
  return <section id={guideConditionsAnchor} className="guide-equipment-conditions" aria-label={title} data-standalone-augment={singleAugment || undefined}>
    {!singleAugment && <div className="guide-equipment-conditions-head">
      <h3>{title}</h3>
      {(wearer || (onViewBoard && label)) && <span className="guide-equipment-conditions-context">
        {onViewBoard && label && <><button type="button" onClick={onViewBoard} aria-label={`查看${label}棋盘`}>{label}</button>{wearer && " · "}</>}{wearer?.name}
      </span>}
    </div>}
    <ul>{rows.map(row => {
      const swapLabel = row.replaced ? `${row.name}替换${row.replaced.name}` : row.name;
      const tag = guideConditionTag(row);
      const augment = row.category === "海克斯";
      return <li key={row.id} data-augment={augment || undefined}>
        <a className="guide-equipment-conditions-item" data-augment={augment || undefined} href={row.item ? itemLink(row.id, wearer?.id, guideHref) : row.href}
          aria-label={swapLabel} title={swapLabel}>
          <GuideConditionIcon condition={row} size={34} />
          {augment && <strong>{row.name}</strong>}
        </a>
        {row.replaced && <>
          <ArrowRight className="guide-equipment-conditions-arrow" size={16} aria-hidden />
          <a className="guide-equipment-conditions-item" href={itemLink(row.replaced.id, wearer?.id, guideHref)}
            aria-label={row.replaced.name} title={row.replaced.name}>
            <ItemIcon item={row.replaced} size={34} />
          </a>
        </>}
        {tag && <span className="guide-condition-tag">{tag}</span>}
        {row.detail && <span className="guide-equipment-condition-detail">{row.detail}</span>}
      </li>;
    })}</ul>
    {source && <a className="guide-equipment-conditions-source" href={source} target="_blank" rel="noreferrer">条件样本</a>}
  </section>;
}
