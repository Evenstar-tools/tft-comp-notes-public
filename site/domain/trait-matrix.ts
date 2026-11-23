import type { Trait, Unit } from "./types";

export type MatrixAxis = Pick<Trait, "id" | "name" | "nameEn" | "thresholds" | "image" | "dynamic">;

const themeOrder = ["gu-feng", "jazz", "hyperpop", "illbeats", "classical", "ionic-spark", "beach-pop",
  "true-damage", "heartsteel", "pentakill", "rock", "k-da", "edm", "r-b"];

export function matrixAxes(traits: Trait[], roster: Unit[]) {
  const count = new Map<string, number>();
  for (const unit of roster) {
    for (const id of new Set(unit.traits)) count.set(id, (count.get(id) ?? 0) + 1);
  }
  const rank = new Map(themeOrder.map((id, i) => [id, i]));
  const index = (id: string) => rank.get(id) ?? themeOrder.length;
  const other = (id: string, name: string): MatrixAxis => ({ id, name, nameEn: "", thresholds: [] });
  const rows: MatrixAxis[] = traits.filter(t => t.axis === "row")
    .sort((a,b) => index(a.id) - index(b.id));
  const columns: MatrixAxis[] = traits.filter(t => t.axis === "column")
    .sort((a,b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0));
  rows.push(other("other-row", "无主题"));
  columns.unshift(other("other-column", "无职业"));
  return { rows, columns, rowIds: new Set(rows.map(t => t.id)), columnIds: new Set(columns.map(t => t.id)) };
}

export function matrixCells(units: Unit[], axes: ReturnType<typeof matrixAxes>) {
  const cells = new Map<string, Unit[]>();
  const usedRows = new Set<string>(), usedColumns = new Set<string>();
  for (const unit of units) {
    const traits = [...new Set(unit.traits)];
    const rows = traits.filter(id => axes.rowIds.has(id));
    const columns = traits.filter(id => axes.columnIds.has(id));
    if (!rows.length) rows.push("other-row");
    if (!columns.length) columns.push("other-column");
    for (const row of rows) {
      usedRows.add(row);
      for (const col of columns) {
        usedColumns.add(col);
        const key = row + "|" + col;
        const members = cells.get(key);
        if (members) members.push(unit);
        else cells.set(key, [unit]);
      }
    }
  }
  return { cells, rows: axes.rows.filter(t => usedRows.has(t.id)), columns: axes.columns.filter(t => usedColumns.has(t.id)) };
}
