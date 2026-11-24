import { itemMap } from "@/data";
import { augmentArtPath } from "@/data/augment-art";
import augmentCatalog from "@/data/augment-catalog.json";
import currentPatch from "@/data/current-patch.json";
import { itemLink } from "./links";
import { sameEdition } from "./version-updates";
import type { Item, Season, Team } from "./types";

export const guideConditionsAnchor = "guide-equipment-conditions";

export const equipmentConditionLabels = {
  required: "有这件再玩",
  upgrade: "拿到更强",
  option: "可替换",
};

type ConditionRule = {
  kind: keyof typeof equipmentConditionLabels;
  action: string;
  games?: number;
  featured?: true;
} & ({ itemId: string; replaces?: string } | { augmentId: string });

export type GuideCondition = {
  id: string;
  name: string;
  category: "神器" | "光明装" | "海克斯";
  item?: Item;
  image?: string;
  replaced?: Item;
  href: string;
} & Pick<ConditionRule, "kind" | "action" | "games" | "featured">;

const guideConditions: Partial<Record<string, {
  boardId: string;
  build: string;
  label: string;
  wearerId?: string;
  source?: string;
  conditions: ConditionRule[];
}>> = { "sample-block-0254": {
  boardId: "00000000-0000-4000-8000-000000000050",
  build: "6018196",
  label: "8级四安可",
  wearerId: "ezreal",
  source: "https://api-hc.metatft.com/tft-explorer-api/unit_builds/DA_Ezreal19?queue=PBE&patch=19.1&b_patch=b&days=3&permit_filter_adjustment=false&compact=true&formatnoarray=true&duplicate_unit_count=0&unit_tier_numitems_unique=DA_Ezreal19-1_3_3&level=8&trait=DA_Encore19_2&trait=DA_Heartsteel19_2&unit_unique=DA_Nasus19-1&unit_unique=DA_Lucian19-1&item_holder_unit=DA_Ezreal19-1",
  conditions: [
    { itemId: "DA_BlueBuffRadiant", replaces: "TFT_Item_BlueBuff", kind: "upgrade", featured: true, action: "开战获得 20 法力，更早启动。", games: 21 },
    { itemId: "DA_Artifact_GoldCollector", replaces: "TFT_Item_PowerGauntlet", kind: "option", action: "处决残血，有机会掉金币。", games: 27 },
  ],
} };

export function guideEquipmentConditions(sectionId: string, teams: Team[], data: Season, build = currentPatch.build) {
  const entry = guideConditions[sectionId];
  if (!entry || !sameEdition(data.id, currentPatch.seasonId) || build !== entry.build) return;
  const board = teams.find(team => team.id === entry.boardId);
  const wearer = data.units.find(unit => unit.id === entry.wearerId);
  if (!board || (entry.wearerId && (!wearer || !board.pieces.some(piece => piece.unitId === wearer.id)))) return;

  const rows = entry.conditions.flatMap<GuideCondition>(condition => {
    if ("augmentId" in condition) {
      const augment = augmentCatalog.rows.find(row => row.id === condition.augmentId);
      if (!augment) return [];
      return [{ ...condition, id: augment.id, name: augment.name, category: "海克斯",
        image: augmentArtPath(augment), href: "/augments?" + new URLSearchParams({ q: augment.name }) }];
    }
    const item = itemMap.get(condition.itemId);
    const replaced = data.items.find(entry => entry.id === condition.replaces);
    if (!item || (item.category !== "artifact" && item.category !== "radiant")) return [];
    if (condition.replaces && (!replaced || !board.pieces.some(piece => piece.unitId === wearer?.id && piece.items.includes(replaced.id)))) return [];
    return [{ ...condition, id: item.id, name: item.name, item, replaced, href: itemLink(item.id, wearer?.id), category: item.category === "artifact" ? "神器" : "光明装" }];
  }).slice(0, 2);
  if (rows.length) return { board, wearer, rows, label: entry.label, source: entry.source };
}
