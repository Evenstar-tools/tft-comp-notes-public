import { GUIDE_SECTION_IDS } from "./guide-identities.ts";
import { traitCounts } from "./team.ts";
import type { Piece, Season, Team } from "./types";

const eveGuide = GUIDE_SECTION_IDS.kdaEvelynn;
const eveSeven = "00000000-0000-4000-8000-000000000043";
const eveEight = "00000000-0000-4000-8000-000000000057";
const eveNine = "00000000-0000-4000-8000-000000000025";
const asheGuide = GUIDE_SECTION_IDS.oceanAshe;
const asheEight = "00000000-0000-4000-8000-000000000122";
const gravesGuide = GUIDE_SECTION_IDS.oceanGraves;
const gravesEight = "00000000-0000-4000-8000-000000000075";

export function reviewedGuidePhases(sectionId: string, teams: Team[], data: Season) {
  if (sectionId !== eveGuide) return;
  const labels = [
    { id: eveSeven, label: "7级 · 双 C 追三", detail: "艾克两星先扛" },
    { id: eveEight, label: "8级 · 补蕾欧娜" },
    { id: eveNine, label: "9级 · 补阿卡丽" },
  ];
  const steps = labels.flatMap(({ id, label, detail }) => {
    const team = teams.find(entry => entry.id === id);
    if (!team) return [];
    const kda = traitCounts(team.pieces, data.units, data.traits, data.items).find(trait => trait.id === "k-da");
    return [{ team, label, detail: detail ?? (kda?.active ? kda.level + " 星 K/DA" : undefined), text: "" }];
  });
  return steps.length === labels.length ? steps : undefined;
}

const flexBoards: {
  id: string; sectionId: string; teamId: string;
  out: string; in: string; traitId: string; reason: string; condition: string; items: string[];
}[] = [
  {
    id: "gnar-for-samira", sectionId: eveGuide, teamId: eveSeven,
    out: "samira", in: "gnar", traitId: "trickshot", reason: "保双花式射手",
    condition: "未解锁", items: ["TFT_Item_LastWhisper"],
  },
  {
    id: "taric-for-vi", sectionId: asheGuide, teamId: asheEight,
    out: "vi", in: "taric", traitId: "juggernaut", reason: "保双主宰",
    condition: "没来", items: [],
  },
];

export function guideFlexPreview(sectionId: string, team: Team, data: Season) {
  const option = flexBoards.find(entry => entry.sectionId === sectionId && entry.teamId === team.id);
  if (!option) return;
  const piece = team.pieces.find(entry => entry.unitId === option.out);
  const outgoing = data.units.find(unit => unit.id === option.out);
  const incoming = data.units.find(unit => unit.id === option.in);
  if (!piece || !outgoing || !incoming || team.pieces.some(entry => entry.unitId === incoming.id)) return;
  const changed: Piece = {
    ...piece, unitId: incoming.id, instanceId: "flex-" + piece.instanceId, stars: 2,
    items: piece.items.filter(id => option.items.includes(id)),
  };
  const pieces = team.pieces.map(entry => entry === piece ? changed : entry);
  const tier = (roster: Piece[]) => traitCounts(roster, data.units, data.traits, data.items)
    .find(trait => trait.id === option.traitId)?.level ?? 0;
  const originalTier = tier(team.pieces);
  if (originalTier !== 2 || tier(pieces) !== originalTier) return;
  return {
    id: option.id, outgoing, incoming, condition: option.condition, reason: option.reason, position: piece.position,
    liveTeam: { ...team, pieces, name: team.name + " · " + incoming.name + "替" + outgoing.name },
  };
}

type GearHandoff = {
  from: string; to: string; stars: 1 | 2 | 3; items: string[];
  fromLabel?: string; toLabel?: string;
};

const openingGear: Record<string, { sectionId: string; rows: GearHandoff[]; note: string }> = {
  [gravesEight]: {
    sectionId: gravesGuide,
    rows: [
      { from: "olaf", to: "graves", toLabel: "男枪", stars: 2, items: ["TFT_Item_UnstableConcoction", "TFT_Item_InfinityEdge"] },
      { from: "renekton", fromLabel: "鳄鱼", to: "zac", stars: 2, items: ["TFT_Item_GargoyleStoneplate", "TFT_Item_WarmogsArmor"] },
    ],
    note: "鳄鱼带两件肉装开艾希。扎克一星时先让鳄鱼继续扛。",
  },
  [eveSeven]: {
    sectionId: eveGuide,
    rows: [
      { from: "gnar", to: "kai-sa", stars: 2, items: ["TFT_Item_GuinsoosRageblade", "TFT_Item_RunaansHurricane"] },
    ],
    note: "纳尔带两件先解锁莎弥拉，卡莎两星再接装。",
  },
};

export function guideOpeningGear(sectionId: string, team: Team, data: Season) {
  const entry = openingGear[team.id];
  if (entry?.sectionId !== sectionId) return;
  const rows = entry.rows.flatMap(row => {
    const from = data.units.find(unit => unit.id === row.from);
    const to = data.units.find(unit => unit.id === row.to);
    const recipient = team.pieces.find(piece => piece.unitId === row.to && row.items.every(id => piece.items.includes(id)));
    const items = row.items.flatMap(id => data.items.find(item => item.id === id) ?? []);
    if (!from || !to || !recipient || items.length !== row.items.length) return [];
    return [{ from, to, items, stars: row.stars, fromLabel: row.fromLabel ?? from.name, toLabel: row.toLabel ?? to.name }];
  });
  return rows.length === entry.rows.length ? { rows, note: entry.note } : undefined;
}

export function guideExecutionUnitIds(sectionId: string, teams: Team[]) {
  return teams.flatMap(team => {
    const flex = flexBoards.find(entry => entry.sectionId === sectionId && entry.teamId === team.id);
    const gear = openingGear[team.id];
    return [...(flex ? [flex.in] : []), ...(gear?.sectionId === sectionId ? gear.rows.map(row => row.from) : [])];
  });
}
