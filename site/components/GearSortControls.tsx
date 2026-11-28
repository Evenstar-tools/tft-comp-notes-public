import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { gearSortAscending, gearSortOrders, parseGearOrder, type GearOrder, type GearSortMetric } from "@/domain/gear-wearer";
import "../app/items/gear-sort.css";

const columns = { mean: "均名", wins: "登顶率", games: "场数" } satisfies Record<GearSortMetric, string>;
const options = {
  mean: "均名最低", "mean-desc": "均名最高",
  wins: "登顶率最高", "wins-asc": "登顶率最低",
  games: "场数最多", "games-asc": "场数最少",
} satisfies Record<GearOrder, string>;

type SortProps = { order: GearOrder; onSort: (order: GearOrder) => void };

export function GearSortButton({ metric, order, onSort }: SortProps & { metric: GearSortMetric }) {
  const [first, reverse] = gearSortOrders[metric];
  const active = order === first || order === reverse;
  const ascending = gearSortAscending(order);
  const next = order === first ? reverse : first;
  const Icon = active ? (ascending ? ArrowUp : ArrowDown) : ArrowUpDown;
  return <button type="button" className="gear-sort-button" aria-pressed={active}
    title={"按" + options[next] + "排序"} onClick={() => onSort(next)}>
    <Icon size={12} aria-hidden="true" />
    {columns[metric]}{active && <span className="sr-only">{ascending ? "，从低到高" : "，从高到低"}</span>}
  </button>;
}

export function GearSortSelect({ order, onSort, includeWins = true, label }: SortProps & { includeWins?: boolean; label: string }) {
  return <select aria-label={label} value={order} onChange={event => onSort(parseGearOrder(event.target.value))}>
    <option value="mean">{options.mean}</option><option value="mean-desc">{options["mean-desc"]}</option>
    {includeWins && <><option value="wins">{options.wins}</option><option value="wins-asc">{options["wins-asc"]}</option></>}
    <option value="games">{options.games}</option><option value="games-asc">{options["games-asc"]}</option>
  </select>;
}
