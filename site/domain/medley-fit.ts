import type { Item, Piece, Unit } from "./types";

type FitBoard = {
  sectionId: string;
  teamId: string;
  title: string;
  stageLabel?: string;
  stageHref?: string;
  finalHref: string;
};

export type MedleyRoute = FitBoard & {
  opening: readonly Piece[];
  final: readonly Piece[];
  openingCarryIds: readonly string[];
  finalCarryIds: readonly string[];
  guideOpening?: boolean;
};

export type MedleyHandoff = { fromId: string; toId: string; itemIds: string[]; source?: "guide" };

export type MedleyBoardPiece = {
  unitId: string;
  items: string[];
  isCarry: boolean;
  isMedley: boolean;
  isLateMedley: boolean;
};

export type MedleyGuideFit = FitBoard & {
  tier: "core" | "extra";
  cheapIds: string[];
  lateIds: string[];
  openingIds: string[];
  finalIds: string[];
  openingCount: number;
  score: number;
  handoff?: MedleyHandoff;
  finalBoard: MedleyBoardPiece[];
  openingBoard: MedleyBoardPiece[];
};

export type MedleySyncMeta = {
  guideCount: number;
  routeCount: number;
  publishedAt?: string;
  editionMatched: boolean;
};

type MedleyGroup = { number: number; unitIds: readonly string[] };

// Direct damage, attack-speed and casting builds. Defensive, shred-only and random items are not proof.
export const MEDLEY_OUTPUT_ITEMS = new Set([
  "TFT_Item_ArchangelsStaff", "TFT_Item_Bloodthirster", "TFT_Item_BlueBuff", "TFT_Item_Deathblade",
  "TFT_Item_GuinsoosRageblade", "TFT_Item_HextechGunblade", "TFT_Item_InfinityEdge", "TFT_Item_JeweledGauntlet",
  "TFT_Item_LastWhisper", "TFT_Item_Leviathan", "TFT_Item_MadredsBloodrazor", "TFT_Item_PowerGauntlet",
  "TFT_Item_RabadonsDeathcap", "TFT_Item_RunaansHurricane", "TFT_Item_SpearOfShojin", "TFT_Item_UnstableConcoction",
]);

// S19 DataTFT's published roles, restricted to output profiles supported by the catalog.
// Gnar's mixed specialist role plays as a physical auto-attacker in the reviewed Guinsoo route.
const carryProfiles = [
  ["gnar", "yunara", "ashe", "kai-sa", "vayne", "jinx", "aphelios"],
  ["varus", "ezreal", "lucian", "tristana", "samira", "draven", "senna", "xayah", "miss-fortune", "zeri"],
  ["ziggs", "bard", "kayle", "twisted-fate"],
  ["zoe", "neeko", "karthus", "lux", "renata-glasc", "lulu", "seraphine", "malzahar", "syndra", "yuumi",
    "alune", "mel", "ahri", "aurora", "taliyah", "teemo", "janna"],
  ["kayn", "camille", "qiyana", "viego", "yasuo", "graves", "yone", "lee-sin", "vi", "baron-nashor"],
  ["katarina", "jax", "evelynn", "vladimir", "gwen", "mordekaiser", "akali-true-damage"],
  ["briar", "pyke", "akali-kda"],
  ["locke", "rakan"],
];
const profileByUnit = new Map(carryProfiles.flatMap((ids, profile) => ids.map(id => [id, profile] as const)));

export function inferCarryIdsFromPieces(
  pieces: readonly Piece[],
  unitCosts: ReadonlyMap<string, number>,
  carryItems: ReadonlySet<string>,
): string[] {
  return [...pieces]
    .map(piece => ({
      unitId: piece.unitId,
      outputCount: piece.items.filter(id => carryItems.has(id)).length,
      cost: unitCosts.get(piece.unitId) ?? 0,
    }))
    .filter(entry => entry.outputCount > 0)
    .sort((a, b) => b.outputCount - a.outputCount || b.cost - a.cost || a.unitId.localeCompare(b.unitId))
    .slice(0, 2)
    .map(entry => entry.unitId);
}

function carryHandoffs(
  route: MedleyRoute,
  finalIds: Set<string>,
  carryItems: Set<string>,
  openingCarryIds: readonly string[],
  finalCarryIds: readonly string[],
): MedleyHandoff[] {
  const openingCarries = route.opening.filter(piece => openingCarryIds.includes(piece.unitId));
  const finalCarries = route.final.filter(piece => finalCarryIds.includes(piece.unitId));
  const choices: MedleyHandoff[] = [];
  for (const from of openingCarries) for (const to of finalCarries) {
    // Keep a continuing carry's gear, or sell a carry that leaves the lineup.
    if (from.unitId !== to.unitId) {
      const profile = profileByUnit.get(from.unitId);
      if (profile === undefined || profile !== profileByUnit.get(to.unitId) || finalIds.has(from.unitId)) continue;
    }
    const itemIds = [...new Set(to.items.filter(item => carryItems.has(item) && from.items.includes(item)))];
    if (itemIds.length) choices.push({
      fromId: from.unitId, toId: to.unitId, itemIds, ...(route.guideOpening && { source: "guide" }),
    });
  }
  return choices.sort((a, b) => Number(b.fromId === b.toId) - Number(a.fromId === a.toId) ||
    b.itemIds.length - a.itemIds.length);
}

function compareFits(a: MedleyGuideFit, b: MedleyGuideFit) {
  return b.score - a.score ||
    Number(b.tier === "core") - Number(a.tier === "core") ||
    Math.min(3, b.openingCount) - Math.min(3, a.openingCount) ||
    b.cheapIds.length - a.cheapIds.length ||
    b.finalIds.length - a.finalIds.length ||
    (b.handoff?.itemIds.length ?? 0) - (a.handoff?.itemIds.length ?? 0) ||
    Number(a.handoff?.source === "guide") - Number(b.handoff?.source === "guide") ||
    a.sectionId.localeCompare(b.sectionId) ||
    a.teamId.localeCompare(b.teamId) ||
    (a.stageHref ?? "").localeCompare(b.stageHref ?? "");
}

function toBoardPieces(
  pieces: readonly Piece[],
  carrySet: ReadonlySet<string>,
  medleySet: ReadonlySet<string>,
  lateSet: ReadonlySet<string>,
  unitCosts: ReadonlyMap<string, number>,
): MedleyBoardPiece[] {
  const seen = new Set<string>();
  return pieces
    .filter(piece => {
      if (seen.has(piece.unitId)) return false;
      seen.add(piece.unitId);
      return true;
    })
    .map(piece => ({
      unitId: piece.unitId,
      items: [...piece.items],
      isCarry: carrySet.has(piece.unitId),
      isMedley: medleySet.has(piece.unitId),
      isLateMedley: lateSet.has(piece.unitId),
    }))
    .sort((a, b) =>
      Number(b.isCarry) - Number(a.isCarry) ||
      Number(b.isMedley) - Number(a.isMedley) ||
      (unitCosts.get(b.unitId) ?? 0) - (unitCosts.get(a.unitId) ?? 0) ||
      a.unitId.localeCompare(b.unitId));
}

export function buildMedleyFits(
  groups: readonly MedleyGroup[],
  routes: readonly MedleyRoute[],
  units: readonly Unit[],
  items: readonly Item[],
  fixedUnitId = "sona",
  maxPerGroup = 5,
): Record<number, MedleyGuideFit[]> {
  const unitCosts = new Map(units.map(unit => [unit.id, unit.cost]));
  const carryItems = new Set(items.filter(item =>
    item.category === "completed" && !item.traitId && MEDLEY_OUTPUT_ITEMS.has(item.id)).map(item => item.id));
  const boards = routes.map(route => {
    const { opening, final, openingCarryIds, finalCarryIds, ...rest } = route;
    const { sectionId, teamId, title, stageLabel, stageHref, finalHref } = rest;
    const link = { sectionId, teamId, title, stageLabel, stageHref, finalHref };
    const openingIds = new Set(opening.map(piece => piece.unitId));
    const finalIds = new Set(final.map(piece => piece.unitId));
    // Auto-fallback for newly added/edited guides that carry output items without explicit role text.
    const resolvedOpeningCarries = openingCarryIds.length
      ? openingCarryIds
      : inferCarryIdsFromPieces(opening, unitCosts, carryItems);
    const resolvedFinalCarries = finalCarryIds.length
      ? finalCarryIds
      : inferCarryIdsFromPieces(final, unitCosts, carryItems);
    return {
      link,
      opening,
      final,
      openingIds,
      finalIds,
      openingCarrySet: new Set(resolvedOpeningCarries),
      finalCarrySet: new Set(resolvedFinalCarries),
      handoffs: carryHandoffs(route, finalIds, carryItems, resolvedOpeningCarries, resolvedFinalCarries),
    };
  });

  return Object.fromEntries(groups.map(group => {
    const members = [...new Set([...group.unitIds, fixedUnitId])];
    const cheap = members.filter(id => (unitCosts.get(id) ?? 0) >= 1 && (unitCosts.get(id) ?? 0) <= 3);
    const expensive = members.filter(id => unitCosts.get(id) === 4 || unitCosts.get(id) === 5);
    const bestByGuide = new Map<string, MedleyGuideFit>();
    for (const { link, opening, final, openingIds, finalIds, openingCarrySet, finalCarrySet, handoffs } of boards) {
      const openingMembers = members.filter(id => openingIds.has(id));
      const terminalMembers = members.filter(id => finalIds.has(id));
      const cheapIds = cheap.filter(id => openingIds.has(id) && finalIds.has(id));
      const lateIds = link.stageHref ? expensive.filter(id => !openingIds.has(id) && finalIds.has(id)) : [];
      const handoff = handoffs.find(transfer => openingMembers.includes(transfer.fromId));
      const terminalActive = terminalMembers.length >= 3;
      const score = Number(terminalActive) + Number(terminalActive && lateIds.length > 0) + Number(Boolean(handoff));

      const isCore = Boolean(score || cheapIds.length >= 2) && (openingMembers.length > 0 || !link.stageHref);
      const isExtra = !isCore && (terminalMembers.length >= 2 || (openingMembers.length >= 2 && terminalMembers.length >= 1));
      if (!isCore && !isExtra) continue;

      const terminalSet = new Set(terminalMembers);
      const openingSet = new Set(openingMembers);
      const lateSet = new Set(lateIds);
      const fit: MedleyGuideFit = {
        ...link,
        tier: isCore ? "core" : "extra",
        cheapIds,
        lateIds,
        openingIds: openingMembers,
        finalIds: terminalMembers,
        openingCount: openingMembers.length,
        score,
        ...(handoff && { handoff }),
        finalBoard: toBoardPieces(final, finalCarrySet, terminalSet, lateSet, unitCosts),
        openingBoard: toBoardPieces(opening, openingCarrySet, openingSet, new Set(), unitCosts),
      };
      const previous = bestByGuide.get(fit.sectionId);
      if (!previous || compareFits(fit, previous) < 0) bestByGuide.set(fit.sectionId, fit);
    }
    return [group.number, [...bestByGuide.values()].sort(compareFits).slice(0, maxPerGroup)];
  }));
}
