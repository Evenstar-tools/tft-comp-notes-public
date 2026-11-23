import { itemMap, unitMap } from "@/data";
import type { AugmentBoard } from "@/domain/guide-placement";
import { itemAliases } from "@/domain/roster-import";
import { ItemIcon } from "./ItemIcon";
import "./augment-board-builds.css";

const number = new Intl.NumberFormat("zh-CN");
const shortNames = new Map(Object.entries(itemAliases).map(([alias, name]) => [name, alias]));

export function AugmentBoardBuilds({ boards, boardLinks }: {
  boards: AugmentBoard[];
  boardLinks?: Record<string, { label: string; href: string }>;
}) {
  const groups = new Map<string, AugmentBoard[]>();
  for (const board of boards) {
    const entries = groups.get(board.teamId) ?? [];
    entries.push(board);
    groups.set(board.teamId, entries);
  }
  return <div className="augment-builds">
    {[...groups].map(([teamId, entries]) => {
      const first = entries[0];
      const board = boardLinks?.[teamId];
      return <div key={teamId} className="augment-build-group">
        <div className="augment-build-head">
          <div className="augment-build-heading">
            {board && <a href={board.href}>{board.label}</a>}
            <span>{unitMap.get(first.unitId)?.name}三星</span>
          </div>
          <a href={first.url} target="_blank" rel="noreferrer" title={first.label + " · MetaTFT · " + first.date}>出装数据</a>
        </div>
        <ul>{entries.map(build => <li key={build.itemIds.join(",")}>
          <div className="augment-build-gear">
            <span className="augment-build-kind">{build.kind === "guide" ? "攻略配装" : "实战配装"}</span>
            {build.itemIds.map((id, index) => {
              const item = itemMap.get(id);
              return item ? <span className="augment-build-item" title={item.name} key={id + index}>
                <ItemIcon item={item} size={18} />{shortNames.get(item.name) ?? item.name}
              </span> : null;
            })}
          </div>
          <div className="augment-build-result">
            {build.games > 0 && build.mean !== undefined ? <>
              <strong>均名 {build.mean.toFixed(2)}</strong><span>{number.format(build.games)} 场</span>
            </> : <span>暂无同装战绩</span>}
          </div>
        </li>)}</ul>
      </div>;
    })}
  </div>;
}
