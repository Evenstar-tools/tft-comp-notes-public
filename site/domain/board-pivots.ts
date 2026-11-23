import type { Item, Piece, Team } from "./types";

export type PublishedPivot = {
  section: string;
  sectionId: string;
  team: Team;
  population: number;
  cores: string[];
  augment?: string;
};

type Transfer = { from: Piece; to: Piece; items: string[] };

function compareBoard(current: Piece[], candidate: PublishedPivot, items: ReadonlyMap<string, Item>) {
  const remaining = [...candidate.team.pieces];
  const needed = new Map(remaining.map(piece => [piece.instanceId, [...piece.items]]));
  const capacity = new Map(remaining.map(piece => [piece.instanceId, 3]));
  const kept: Piece[] = [];
  const removed: Piece[] = [];
  let value = 0;
  const owned = [...current].sort((a, b) => b.stars - a.stars || b.items.length - a.items.length);
  for (const piece of owned) {
    const index = remaining.findIndex(next => next.unitId === piece.unitId);
    if (index === -1) {
      removed.push(piece);
      continue;
    }
    const [target] = remaining.splice(index, 1);
    const slots = needed.get(target.instanceId)!;
    capacity.set(target.instanceId, Math.max(0, 3 - piece.items.length));
    kept.push(piece);
    value += 3 + Math.min(piece.stars, target.stars) - 1;
    if (candidate.cores.includes(target.unitId)) value += 2;
    for (const item of piece.items) {
      const at = slots.indexOf(item);
      if (at >= 0) {
        slots.splice(at, 1);
        value += 2;
      }
    }
  }
  // First fill a carry or tank's actual published loadout. Every equipped copy
  // can move only once, and only units leaving the board donate equipment.
  const receivers = [...candidate.team.pieces].sort((a, b) =>
    Number(candidate.cores.includes(b.unitId)) - Number(candidate.cores.includes(a.unitId)));
  const transfers: Transfer[] = [];
  for (const source of removed) {
    for (const itemId of source.items) {
      if (items.get(itemId)?.category === "component") continue;
      const receiver = receivers.find(piece =>
        capacity.get(piece.instanceId)! > 0 && needed.get(piece.instanceId)!.includes(itemId));
      if (!receiver) continue;
      const slots = needed.get(receiver.instanceId)!;
      slots.splice(slots.indexOf(itemId), 1);
      capacity.set(receiver.instanceId, capacity.get(receiver.instanceId)! - 1);
      const transfer = transfers.find(entry => entry.from === source && entry.to === receiver);
      if (transfer) transfer.items.push(itemId);
      else transfers.push({ from: source, to: receiver, items: [itemId] });
      value++;
    }
  }
  const ownedEmblems = current.flatMap(piece => piece.items.filter(id => items.get(id)?.traitId));
  const missingEmblems = candidate.team.pieces.flatMap(piece => piece.items.filter(id => items.get(id)?.traitId))
    .filter(id => {
      const index = ownedEmblems.indexOf(id);
      if (index < 0) return true;
      ownedEmblems.splice(index, 1);
      return false;
    });
  value -= missingEmblems.length * 3;
  return { candidate, kept, removed, added: remaining, transfers, missingEmblems, value };
}

export function findBoardPivots(current: Piece[], population: number, choices: PublishedPivot[], items: ReadonlyMap<string, Item>) {
  if (!current.length) return [];
  const nearby = choices.filter(choice => choice.population === population || choice.population === population + 1)
    .map(choice => compareBoard(current, choice, items));
  const ownGuides = new Set(nearby.filter(match => !match.added.length && !match.removed.length).map(match => match.candidate.sectionId));
  const ranked = nearby.filter(match => (match.added.length || match.removed.length) && match.kept.length >= Math.ceil(current.length / 3))
    // Prefer a documented next board when the current roster is one of the guide's own stages.
    .map(match => ownGuides.has(match.candidate.sectionId) && match.candidate.population === population + 1
      ? { ...match, value: match.value + 4 } : match)
    .sort((a, b) => b.value - a.value || b.kept.length - a.kept.length || a.added.length - b.added.length);
  const best: typeof ranked = [];
  for (const match of ranked) {
    if (best.some(other => other.candidate.sectionId === match.candidate.sectionId)) continue;
    best.push(match);
    if (best.length === 2) break;
  }
  return best;
}
