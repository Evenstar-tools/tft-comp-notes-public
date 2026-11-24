import { itemMap, unitMap } from "@/data";
import { augmentArtPath } from "@/data/augment-art";
import augmentCatalog from "@/data/augment-catalog.json";
import currentPatch from "@/data/current-patch.json";
import { augmentHref } from "./augment-library";
import type { Section } from "./document";
import { heroAugmentForGuide } from "./hero-augments";
import { itemLink } from "./links";
import { sameEdition } from "./version-updates";
import type { Item, Season, Team, Unit } from "./types";

export const guideConditionsAnchor = "guide-equipment-conditions";

type ConditionRule = {
  kind: "required" | "upgrade" | "option";
  action?: string;
  games?: number;
  featured?: true;
} & ({ itemId: string; replaces?: string; recipientId?: string } | { augmentId: string });

export type GuideCondition = {
  id: string;
  name: string;
  category: "神器" | "光明装" | "海克斯" | "转职";
  item?: Item;
  recipient?: Unit;
  image?: string;
  replaced?: Item;
  href: string;
  detail?: string;
} & Pick<ConditionRule, "kind" | "action" | "games" | "featured">;

type GuideConditions = { rows: GuideCondition[]; board?: Team; label?: string; wearer?: Unit; source?: string };

const equipmentCategories = { artifact: "神器", radiant: "光明装", emblem: "转职" } as const;
const augmentById = new Map(augmentCatalog.rows.map(augment => [augment.id, augment]));

export function guideConditionTag(row: GuideCondition) {
  return row.kind === "required" ? (row.category === "光明装" ? "光装" : row.category) + "定阵" : undefined;
}

export function guideConditionName(row: GuideCondition) {
  return row.recipient ? row.name + "给" + row.recipient.name : row.name;
}

function augmentCondition(id: string, rule: Pick<ConditionRule, "kind" | "action" | "games" | "featured">): GuideCondition | undefined {
  const augment = augmentById.get(id);
  if (!augment) return;
  return { ...rule, id, name: augment.name, category: "海克斯", detail: rule.action, image: augmentArtPath(augment), href: augmentHref(id) };
}

const guideConditions: Partial<Record<string, {
  boardId: string;
  build?: string;
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
    { itemId: "DA_Artifact_SilvermereDawn", replaces: "TFT_Item_PowerGauntlet", kind: "required", featured: true, games: 30 },
    { itemId: "DA_BlueBuffRadiant", replaces: "TFT_Item_BlueBuff", kind: "upgrade", featured: true, action: "开战获得 20 法力，更早启动。", games: 21 },
    { itemId: "DA_Artifact_GoldCollector", replaces: "TFT_Item_PowerGauntlet", kind: "option", action: "处决残血，有机会掉金币。", games: 27 },
    { augmentId: "DA_Augment19_Heartsteel_SmallSquad", kind: "option", action: "保留瑟提、奎桑提，开 3 心之钢。" },
  ],
}, "sample-block-0229": {
  boardId: "00000000-0000-4000-8000-000000000017",
  label: "七级五天才",
  conditions: [
    { itemId: "emblem-prodigy", recipientId: "amumu", kind: "required", action: "七级起搜时换下斯维因，提前开 5 天才。" },
  ],
} };

export function guideEquipmentConditions(section: Section, teams: Team[], data: Season, build = currentPatch.build): GuideConditions | undefined {
  if (!teams.length || !sameEdition(data.id, currentPatch.seasonId)) return;
  const augment = heroAugmentForGuide(section);
  const hero = augment && augmentCondition(augment.id, { kind: "required" });
  const heroRows = hero && augment ? [{ ...hero, name: augment.label || hero.name, detail: [augment.round, augment.rarity, augment.role].filter(Boolean).join(" · ") }] : [];
  const entry = guideConditions[section.id];
  if (!entry) return hero ? { rows: heroRows } : undefined;
  const board = teams.find(team => team.id === entry.boardId);
  const wearer = data.units.find(unit => unit.id === entry.wearerId);
  if (!board || (entry.wearerId && (!wearer || !board.pieces.some(piece => piece.unitId === wearer.id)))) {
    return hero ? { rows: heroRows } : undefined;
  }

  const rules = entry.conditions.flatMap<GuideCondition>(condition => {
    if ("augmentId" in condition) return augmentCondition(condition.augmentId, condition) ?? [];
    if (entry.build && build !== entry.build) return [];
    const item = itemMap.get(condition.itemId);
    const replaced = data.items.find(entry => entry.id === condition.replaces);
    if (!item || (item.category !== "artifact" && item.category !== "radiant" && item.category !== "emblem")) return [];
    if (condition.replaces && (!replaced || !board.pieces.some(piece => piece.unitId === wearer?.id && piece.items.includes(replaced.id)))) return [];
    const recipient = condition.recipientId ? unitMap.get(condition.recipientId) : undefined;
    if (condition.recipientId && !recipient) return [];
    return [{ ...condition, id: item.id, name: item.name, item, recipient, replaced, detail: recipient ? condition.action : undefined,
      href: itemLink(item.id, recipient?.id ?? wearer?.id), category: equipmentCategories[item.category] }];
  });
  if (rules.length) return {
    board, wearer, rows: [...heroRows, ...rules], label: entry.label,
    source: rules.some(rule => rule.item) ? entry.source : undefined,
  };
  if (hero) return { rows: heroRows };
}
