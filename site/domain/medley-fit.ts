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

type MedleyHandoff = { fromId: string; toId: string; itemIds: string[]; source?: "guide" };

export type MedleyGuideFit = FitBoard & {
  cheapIds: string[];
  lateIds: string[];
  openingIds: string[];
  finalIds: string[];
  openingCount: number;
  score: number;
  handoff?: MedleyHandoff;
};

type MedleyGroup = { number: number; unitIds: readonly string[] };

// Direct damage, attack-speed and casting builds. Defensive, shred-only and random items are not proof.
const outputItems = new Set([
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

function carryHandoffs(route: MedleyRoute, finalIds: Set<string>, carryItems: Set<string>): MedleyHandoff[] {
  const openingCarries = route.opening.filter(piece => route.openingCarryIds.includes(piece.unitId));
  const finalCarries = route.final.filter(piece => route.finalCarryIds.includes(piece.unitId));
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
    Math.min(3, b.openingCount) - Math.min(3, a.openingCount) ||
    b.cheapIds.length - a.cheapIds.length ||
    b.finalIds.length - a.finalIds.length ||
    (b.handoff?.itemIds.length ?? 0) - (a.handoff?.itemIds.length ?? 0) ||
    Number(a.handoff?.source === "guide") - Number(b.handoff?.source === "guide") ||
    a.sectionId.localeCompare(b.sectionId) ||
    a.teamId.localeCompare(b.teamId) ||
    (a.stageHref ?? "").localeCompare(b.stageHref ?? "");
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
    item.category === "completed" && !item.traitId && outputItems.has(item.id)).map(item => item.id));
  const boards = routes.map(route => {
    const { opening, final, openingCarryIds: _openingCarries, finalCarryIds: _finalCarries, guideOpening: _guideOpening, ...link } = route;
    const openingIds = new Set(opening.map(piece => piece.unitId));
    const finalIds = new Set(final.map(piece => piece.unitId));
    return { link, openingIds, finalIds, handoffs: carryHandoffs(route, finalIds, carryItems) };
  });

  return Object.fromEntries(groups.map(group => {
    const members = [...new Set([...group.unitIds, fixedUnitId])];
    const cheap = members.filter(id => (unitCosts.get(id) ?? 0) >= 1 && (unitCosts.get(id) ?? 0) <= 3);
    const expensive = members.filter(id => unitCosts.get(id) === 4 || unitCosts.get(id) === 5);
    const bestByGuide = new Map<string, MedleyGuideFit>();
    for (const { link, openingIds, finalIds, handoffs } of boards) {
      const openingMembers = members.filter(id => openingIds.has(id));
      if (!openingMembers.length && link.stageHref) continue;
      const terminalMembers = members.filter(id => finalIds.has(id));
      const cheapIds = cheap.filter(id => openingIds.has(id) && finalIds.has(id));
      const lateIds = link.stageHref ? expensive.filter(id => !openingIds.has(id) && finalIds.has(id)) : [];
      const handoff = handoffs.find(transfer => openingMembers.includes(transfer.fromId));
      const terminalActive = terminalMembers.length >= 3;
      const score = Number(terminalActive) + Number(terminalActive && lateIds.length > 0) + Number(Boolean(handoff));
      if (!score && cheapIds.length < 2) continue;
      const fit = {
        ...link, cheapIds, lateIds, openingIds: openingMembers, finalIds: terminalMembers, openingCount: openingMembers.length,
        score, ...(handoff && { handoff }),
      };
      const previous = bestByGuide.get(fit.sectionId);
      if (!previous || compareFits(fit, previous) < 0) bestByGuide.set(fit.sectionId, fit);
    }
    return [group.number, [...bestByGuide.values()].sort(compareFits).slice(0, 3)];
  }));
}
