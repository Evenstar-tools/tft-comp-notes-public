import type { MouseEvent } from "react";
import { filterEmblems, filterGear, gearGroups, gearHref, type GearFilters, type GearGroup } from "@/domain/gear-library";
import "./gear-category-nav.css";

const categories = Object.keys(gearGroups) as GearGroup[];

type CategoryProps = {
  current: GearGroup;
  filters: GearFilters;
  hrefFor?: (group: GearGroup) => string;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, group: GearGroup) => void;
};

export function GearCategoryNav({ current, filters, hrefFor, onNavigate }: CategoryProps) {
  return <nav className="gear-groups" aria-label="装备类别">
    {categories.map(group => <a key={group} data-gear-group={group} href={hrefFor?.(group) ?? gearHref(group, filters)}
      aria-current={current === group ? "page" : undefined} onClick={onNavigate && (event => onNavigate(event, group))}>
      {gearGroups[group]}
    </a>)}
  </nav>;
}

export function GearCategoryEmpty({ current, filters, hrefFor, onNavigate, onClear }: CategoryProps & { onClear?: () => void }) {
  const reverse = !!filters.wearer && current !== "component" && current !== "craft";
  const matches = !reverse && filters.query.trim() ? categories.flatMap(group => {
    if (group === current || group === "all") return [];
    const count = group === "emblems" ? filterEmblems(filters.query).length : filterGear(group, filters.query).length;
    return count ? [{ group, count }] : [];
  }) : [];
  return <div className="gear-category-empty">
    <div className="gear-empty-heading">
      <p className="gear-empty" role="status">{reverse ? "暂无符合条件的携带记录" : "此类别没有匹配结果"}</p>
      {filters.query.trim() && onClear && <button type="button" onClick={onClear}>{reverse ? "清除装备词" : "清除搜索"}</button>}
    </div>
    {!!matches.length && <nav aria-label="有匹配结果的装备类别">
      {matches.map(({ group, count }) => <a key={group} href={hrefFor?.(group) ?? gearHref(group, filters)}
        onClick={onNavigate && (event => onNavigate(event, group))}>{gearGroups[group]} <small>{count} 项</small></a>)}
    </nav>}
  </div>;
}
