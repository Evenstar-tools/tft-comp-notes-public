import { itemMap } from "@/data";
import { itemName } from "@/domain/gear-library";
import { guideLink } from "@/domain/guide-reading";
import { heroGuideGroups, type HeroGuideIndex } from "@/domain/hero-guides";
import type { Unit } from "@/domain/types";
import { ItemIcon } from "./ItemIcon";
import "./hero-board-context.css";

export function HeroBoardContext({ unit, guides, returnHref, hideGear = false }: {
  unit: Unit;
  guides: HeroGuideIndex[string] | null;
  returnHref: string;
  hideGear?: boolean;
}) {
  const [first, ...others] = guides ?? [];
  const findGuide = "/?" + new URLSearchParams({ q: unit.name, scope: "unit", sort: "category" });
  const row = first && (Math.floor(first.example.position / 7) + 1);
  const items = first?.example.items.flatMap(id => itemMap.get(id) ?? []) ?? [];
  function metadata(guide: HeroGuideIndex[string][number]) {
    const { role, group, board, title } = guide;
    return [board !== title && "棋盘 " + board, group === "过渡" && group, role, guide.example.stars + " 星"]
      .filter(Boolean).join(" · ");
  }
  return (
    <section className="hero-board-context" aria-label="站位与阵容">
      <h3>站位与阵容</h3>
      {first ? <>
        <a className="hero-board-guide" href={guideLink(first.id, first.boardId, returnHref)}>
          <strong>{first.title}</strong>
          <span>{metadata(first)}</span>
        </a>
        <p className="hero-board-position">{first.example.positioning ??
          `第 ${row} 排 · 第 ${first.example.position % 7 + 1} 格`}</p>
        {!hideGear && items.length > 0 && <ul className="hero-board-gear" aria-label="本盘配装">
          {items.map((item, index) => <li key={item.id + index}>
            <ItemIcon item={item} size={20} />{itemName(item)}
          </li>)}
        </ul>}
        {others.length > 0 && <details className="hero-board-more">
          <summary>其他相关阵容（{others.length}）</summary>
          {heroGuideGroups.map(group => {
            const rows = others.filter(guide => guide.group === group);
            return rows.length > 0 && <div key={group}>
              <h4>{group}</h4>
              <ul>{rows.map(guide => <li key={guide.id}>
                <a href={guideLink(guide.id, guide.boardId, returnHref)}>{guide.title}</a>
                <small>{metadata(guide)}</small>
              </li>)}</ul>
            </div>;
          })}
        </details>}
      </> : guides === null ? <p>暂时读不到相关阵容。</p>
        : <a href={findGuide}>查包含{unit.name}的阵容</a>}
    </section>
  );
}
