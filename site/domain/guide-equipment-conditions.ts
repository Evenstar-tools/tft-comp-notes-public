import { itemMap } from "@/data";
import currentPatch from "@/data/current-patch.json";
import { sameEdition } from "./version-updates";
import type { Season, Team } from "./types";

export const equipmentConditionLabels = {
  required: "有这件再玩",
  upgrade: "拿到更强",
  option: "可替换",
};

type EquipmentCondition = {
  itemId: string;
  replaces?: string;
  kind: keyof typeof equipmentConditionLabels;
  action: string;
  games?: number;
};

const fourEncore: {
  boardId: string;
  build: string;
  label: string;
  wearerId: string;
  source: string;
  conditions: EquipmentCondition[];
} = {
  boardId: "00000000-0000-4000-8000-000000000050",
  build: "6018196",
  label: "8级四安可",
  wearerId: "ezreal",
  source: "https://api-hc.metatft.com/tft-explorer-api/unit_builds/DA_Ezreal19?queue=PBE&patch=19.1&b_patch=b&days=3&permit_filter_adjustment=false&compact=true&formatnoarray=true&duplicate_unit_count=0&unit_tier_numitems_unique=DA_Ezreal19-1_3_3&level=8&trait=DA_Encore19_2&trait=DA_Heartsteel19_2&unit_unique=DA_Nasus19-1&unit_unique=DA_Lucian19-1&item_holder_unit=DA_Ezreal19-1",
  conditions: [
    { itemId: "DA_BlueBuffRadiant", replaces: "TFT_Item_BlueBuff", kind: "upgrade", action: "开战获得 20 法力，更早启动。", games: 21 },
    { itemId: "DA_Artifact_GoldCollector", replaces: "TFT_Item_PowerGauntlet", kind: "option", action: "处决残血，有机会掉金币。", games: 27 },
  ],
};

export function guideEquipmentConditions(sectionId: string, teams: Team[], data: Season) {
  if (sectionId !== "sample-block-0254" || !sameEdition(data.id, currentPatch.seasonId) || currentPatch.build !== fourEncore.build) return;
  const board = teams.find(team => team.id === fourEncore.boardId);
  const wearer = data.units.find(unit => unit.id === fourEncore.wearerId);
  const loadout = board?.pieces.find(piece => piece.unitId === wearer?.id);
  if (!board || !wearer || !loadout) return;

  const rows = fourEncore.conditions.flatMap(condition => {
    const item = itemMap.get(condition.itemId);
    const replaced = data.items.find(entry => entry.id === condition.replaces);
    if (!item || (item.category !== "artifact" && item.category !== "radiant")) return [];
    if (condition.replaces && (!replaced || !loadout.items.includes(replaced.id))) return [];
    return [{ ...condition, item, replaced, category: item.category === "artifact" ? "神器" : "光明装" }];
  });
  if (rows.length) return { board, wearer, rows, label: fourEncore.label, source: fourEncore.source };
}
