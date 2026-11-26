import type { Item, Piece, Unit } from "./types";

type FitBoard = {
  sectionId: string;
  teamId: string;
  title: string;
  stageLabel: string;
  stageHref: string;
  finalHref: string;
};

export type MedleyRoute = FitBoard & {
  opening: readonly Piece[];
  final: readonly Piece[];
  openingCarryIds: readonly string[];
  finalCarryIds: readonly string[];
};

type MedleyHandoff = { fromId: string; toId: string; itemIds: string[] };

export type MedleyGuideFit = FitBoard & {
  cheapIds: string[];
  lateIds: string[];
  openingCount: number;
  score: number;
  handoff?: MedleyHandoff;
};

type MedleyGroup = { number: number; unitIds: readonly string[] };

const nonCarryItems = new Set([
  "TFT_Item_BrambleVest",
  "TFT_Item_Crownguard",
  "TFT_Item_DragonsClaw",
  "TFT_Item_FrozenHeart",
  "TFT_Item_GargoyleStoneplate",
  "TFT_Item_IonicSpark",
  "TFT_Item_NightHarvester",
  "TFT_Item_RedBuff",
  "TFT_Item_Redemption",
  "TFT_Item_SpectralGauntlet",
  "TFT_Item_ThiefsGloves",
  "TFT_Item_WarmogsArmor",
]);

function carryHandoff(route: MedleyRoute, finalIds: Set<string>, carryItems: Set<string>): MedleyHandoff | undefined {
  const openingCarries = route.opening.filter(piece => route.openingCarryIds.includes(piece.unitId));
  const finalCarries = route.final.filter(piece => route.finalCarryIds.includes(piece.unitId));
  const choices: MedleyHandoff[] = [];
  for (const from of openingCarries) for (const to of finalCarries) {
    // Keep a continuing carry's gear, or sell a carry that leaves the lineup.
    if (from.unitId !== to.unitId && finalIds.has(from.unitId)) continue;
    const itemIds = [...new Set(to.items.filter(item => carryItems.has(item) && from.items.includes(item)))];
    if (itemIds.length) choices.push({ fromId: from.unitId, toId: to.unitId, itemIds });
  }
  return choices.sort((a, b) => Number(b.fromId === b.toId) - Number(a.fromId === a.toId) ||
    b.itemIds.length - a.itemIds.length)[0];
}

function compareFits(a: MedleyGuideFit, b: MedleyGuideFit) {
  return b.score - a.score ||
    Math.min(3, b.openingCount) - Math.min(3, a.openingCount) ||
    b.cheapIds.length - a.cheapIds.length ||
    a.sectionId.localeCompare(b.sectionId) ||
    a.teamId.localeCompare(b.teamId) ||
    a.stageHref.localeCompare(b.stageHref);
}

export function buildMedleyFits(
  groups: readonly MedleyGroup[],
  routes: readonly MedleyRoute[],
  units: readonly Unit[],
  items: readonly Item[],
  fixedUnitId = "sona",
): Record<number, MedleyGuideFit[]> {
  const unitCosts = new Map(units.map(unit => [unit.id, unit.cost]));
  const carryItems = new Set(items.filter(item =>
    item.category === "completed" && !item.traitId && !nonCarryItems.has(item.id)).map(item => item.id));
  const boards = routes.map(route => {
    const { opening, final, openingCarryIds: _openingCarries, finalCarryIds: _finalCarries, ...link } = route;
    const openingIds = new Set(opening.map(piece => piece.unitId));
    const finalIds = new Set(final.map(piece => piece.unitId));
    return { link, openingIds, finalIds, handoff: carryHandoff(route, finalIds, carryItems) };
  });

  return Object.fromEntries(groups.map(group => {
    const members = [...new Set(group.unitIds)].filter(id => id !== fixedUnitId);
    const cheap = members.filter(id => (unitCosts.get(id) ?? 0) >= 1 && (unitCosts.get(id) ?? 0) <= 3);
    const expensive = members.filter(id => unitCosts.get(id) === 4 || unitCosts.get(id) === 5);
    const bestByGuide = new Map<string, MedleyGuideFit>();
    for (const { link, openingIds, finalIds, handoff } of boards) {
      const cheapIds = cheap.filter(id => openingIds.has(id) && finalIds.has(id));
      if (!cheapIds.length) continue;
      const lateIds = expensive.filter(id => finalIds.has(id));
      const openingCount = members.filter(id => openingIds.has(id)).length + Number(openingIds.has(fixedUnitId));
      const score = Math.min(3, cheapIds.length) + Number(lateIds.length > 0) + Number(Boolean(handoff));
      const fit = { ...link, cheapIds, lateIds, openingCount, score, ...(handoff && { handoff }) };
      const previous = bestByGuide.get(fit.sectionId);
      if (!previous || compareFits(fit, previous) < 0) bestByGuide.set(fit.sectionId, fit);
    }
    return [group.number, [...bestByGuide.values()].sort(compareFits).slice(0, 5)];
  }));
}
