import { confirmedTraitLevel } from "./trait-activation.mjs";
import { createId } from "./id.ts";
import type { Section } from "./document";
import type { Item, Piece, PieceLoadout, Team, Trait, Unit } from "./types";

export const akaliForms = ["akali-kda", "akali-true-damage"] as const;
export function usedPopulation(pieces: Pick<Piece, "unitId">[]) {
  return pieces.reduce((sum, piece) => sum + (piece.unitId === "baron-nashor" ? 2 : 1), 0);
}
export function guideBoardKind(section: Pick<Section, "stageTeamIds">, team: Team, primary: Team) {
  if (team.id === primary.id) return "主阵";
  const stage = section.stageTeamIds?.includes(team.id) ?? (team.boardRole === "stage");
  if (!stage) return "变阵";
  return usedPopulation(team.pieces) > usedPopulation(primary.pieces) ? "上限" : "过渡";
}

export function conflictingForm(pieces: Piece[], requested: string) {
  return akaliForms.includes(requested as typeof akaliForms[number])
    ? pieces.find(piece => piece.unitId !== requested && akaliForms.some(id => id === piece.unitId))
    : undefined;
}
export function mixedForms(pieces: Piece[]) {
  return akaliForms.every(id => pieces.some(piece => piece.unitId === id));
}
export function switchForm(pieces: Piece[], target: string) {
  if (!akaliForms.some(id => id === target)) return pieces;
  return pieces.map(piece => akaliForms.some(id => id === piece.unitId) ? { ...piece, unitId: target } : piece);
}
export function traitGroup(trait: Trait & { active: boolean }) {
  if (trait.dynamic) return "动态待定";
  if (!trait.active) return "未达档";
  return trait.thresholds.some(level => level > 1) ? "已开常规" : "已开专属";
}
export function traitLines(counts: ReturnType<typeof traitCounts>) {
  return (["已开常规", "已开专属", "未达档", "动态待定"] as const).flatMap(group => {
    const entries = counts.filter(trait => traitGroup(trait) === group);
    const labels = entries.map(trait => {
      if (trait.dynamic) return trait.name + "（按本局成员）";
      const value = trait.active ? trait.level : trait.count;
      return trait.name + " " + value + (trait.countMode === "stars" ? " 星" : "");
    });
    return entries.length ? [[group + " " + entries.length + " · ", ...labels]] : [];
  });
}

export function relatedUnitIds(selectedId: string | null, units: Unit[], extraTraitIds: readonly string[] = []) {
  const selected = units.find((unit) => unit.id === selectedId);
  if (!selected) return new Set<string>();
  const traits = new Set([...selected.traits, ...extraTraitIds]);
  return new Set(
    units
      .filter(
        (unit) =>
          unit.id === selected.id || unit.traits.some((id) => traits.has(id)),
      )
      .map((unit) => unit.id),
  );
}

export function equippedTraitIds(piece: Pick<Piece, "items">, items: ReadonlyMap<string, Item>) {
  return piece.items.map(id => items.get(id)?.traitId).filter((id): id is string => !!id);
}

export function traitCounts(
  pieces: Piece[],
  units: Unit[],
  traits: Trait[],
  items: Item[],
) {
  const unitMap = new Map(units.map((unit) => [unit.id, unit]));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const members = new Map<string, Map<string, number>>();
  for (const piece of pieces) {
    const unit = unitMap.get(piece.unitId);
    if (!unit) continue;
    const ids = new Set([...unit.traits, ...equippedTraitIds(piece, itemMap)]);
    for (const id of ids) {
      const set = members.get(id) ?? new Map<string, number>();
      set.set(unit.nameEn, Math.max(set.get(unit.nameEn) ?? 0, piece.stars));
      members.set(id, set);
    }
  }
  return traits
    .map((trait) => {
      const entries = members.get(trait.id);
      const count =
        trait.countMode === "stars"
          ? [...(entries?.values() ?? [])].reduce(
              (sum, stars) => sum + stars,
              0,
            )
          : (entries?.size ?? 0);
      const level = confirmedTraitLevel(trait, count);
      return { ...trait, count, active: level > 0, level };
    })
    .filter((trait) => trait.count > 0)
    .sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count);
}

export function movePiece(
  pieces: Piece[],
  instanceId: string,
  position: number,
): Piece[] {
  if (!Number.isInteger(position) || position < 0 || position >= 28)
    return pieces;
  const source = pieces.find((piece) => piece.instanceId === instanceId);
  if (!source || source.position === position) return pieces;
  return pieces.map((piece) =>
    piece.instanceId === instanceId
      ? { ...piece, position }
      : piece.position === position
        ? { ...piece, position: source.position }
        : piece,
  );
}

export function stackPiece(pieces: Piece[], alternate: PieceLoadout, position: number): Piece[] {
  const target = pieces.find(piece => piece.position === position);
  if (!target || target.alternate || pieces.some(piece => piece.instanceId === alternate.instanceId)) return pieces;
  return pieces.map(piece => piece === target ? { ...piece, alternate } : piece);
}

export function switchAlternate(pieces: Piece[], instanceId: string): Piece[] {
  const current = pieces.find(piece => piece.instanceId === instanceId);
  if (!current?.alternate) return pieces;
  const { position, alternate, ...loadout } = current;
  const next = pieces.map(piece => piece === current ? { ...alternate, position, alternate: loadout } : piece);
  return mixedForms(next) ? pieces : next;
}

export function splitAlternate(pieces: Piece[], instanceId: string, position: number): Piece[] {
  if (!Number.isInteger(position) || position < 0 || position >= 28 || pieces.some(piece => piece.position === position)) return pieces;
  const current = pieces.find(piece => piece.instanceId === instanceId);
  if (!current?.alternate || conflictingForm(pieces, current.alternate.unitId)) return pieces;
  const { alternate, ...active } = current;
  return [...pieces.map(piece => piece === current ? active : piece), { ...alternate, position }];
}

export function emptyTeam(): Team {
  return {
    id: createId(),
    name: "未命名阵容",
    category: "待分类",
    pieces: [],
    notes: "",
    revision: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function teamFromCombo(code: string, units: Unit[], traits: Trait[]): Team | null {
  if (!code || code.length > 350) return null;
  const roster = code.split(".");
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const pieces: Piece[] = [];
  const names = new Set<string>();
  const slots = [7, 9, 11, 13, 21, 23, 25, 27];
  for (const token of roster) {
    const match = /^([a-z0-9-]+)(:2)?$/.exec(token);
    const unit = match && byId.get(match[1]);
    if (!unit || names.has(unit.nameEn) || pieces.length >= slots.length) return null;
    names.add(unit.nameEn);
    pieces.push({ instanceId: createId(), unitId: unit.id, position: slots[pieces.length], stars: match[2] ? 2 : 1, items: [] });
  }
  if (usedPopulation(pieces) !== 8 || traitCounts(pieces, units, traits, []).filter(t => traitGroup(t) === "已开常规").length < 8) return null;
  const label = [...pieces].sort((a, b) => byId.get(b.unitId)!.cost - byId.get(a.unitId)!.cost).slice(0,2).map(p => byId.get(p.unitId)!.name).join("、");
  return { ...emptyTeam(), name: "八人口 · " + label, pieces };
}

export function teamText(
  team: Team,
  units: Unit[],
  traits: Trait[],
  items: Item[],
) {
  const lines = [
    team.name,
    usedPopulation(team.pieces) + " 人口",
    ...team.pieces.map((piece) => {
      const unit = units.find((entry) => entry.id === piece.unitId);
      return `${unit?.name ?? piece.unitId} ${piece.stars}星 · 第${Math.floor(piece.position / 7) + 1}排第${(piece.position % 7) + 1}格${piece.items.length ? ` · ${piece.items.map((id) => items.find((item) => item.id === id)?.name ?? id).join("、")}` : ""}`;
    }),
  ];
  const active = traitCounts(team.pieces, units, traits, items);
  for (const [label, ...entries] of traitLines(active)) lines.push(label + entries.join(" / "));
  if (team.notes) lines.push(team.notes);
  return lines.join("\n");
}
