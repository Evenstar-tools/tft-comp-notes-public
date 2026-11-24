import { ItemIcon } from "./ItemIcon";
import { equipmentConditionLabels, type guideEquipmentConditions } from "@/domain/guide-equipment-conditions";
import { itemLink } from "@/domain/links";

export function GuideEquipmentConditions({ conditions, guideHref, onViewBoard }: {
  conditions: NonNullable<ReturnType<typeof guideEquipmentConditions>>;
  guideHref?: string;
  onViewBoard?: () => void;
}) {
  const { label, rows, source, wearer } = conditions;
  return <section className="guide-equipment-conditions" aria-label="装备条件">
    <div className="guide-equipment-conditions-head">
      <h3>装备条件</h3>
      <span className="guide-equipment-conditions-context">{onViewBoard ? <button type="button" onClick={onViewBoard} aria-label={`查看${label}棋盘`}>{label}</button> : label} · {wearer.name}</span>
      <a className="guide-equipment-conditions-source" href={source} target="_blank" rel="noreferrer" aria-label="MetaTFT 同条件三件套数据">实戴数据</a>
    </div>
    <ul>{rows.map(({ item, replaced, category, kind, action, games }) => <li key={item.id}>
      <a className="guide-equipment-conditions-item" href={itemLink(item.id, wearer.id, guideHref)}>
        <ItemIcon item={item} size={34} />
        <span><strong>{item.name}</strong><small>{category}</small></span>
      </a>
      <span className="guide-equipment-conditions-kind" data-kind={kind}>{equipmentConditionLabels[kind]}</span>
      <p>{replaced && <><strong>换下{replaced.name}</strong> · </>}{action}</p>
      {games !== undefined && <small className="guide-equipment-conditions-sample">同套实戴 {games} 场</small>}
    </li>)}</ul>
  </section>;
}
