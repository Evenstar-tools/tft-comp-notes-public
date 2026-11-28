import { itemMap, unitMap } from "@/data";
import { GUIDE_SECTION_IDS, PYKE_GRAVES_BOARD_ID } from "./guide-identities.ts";
import { augmentArtPath } from "@/data/augment-art";
import augmentCatalog from "@/data/augment-catalog.json";
import currentPatch from "@/data/current-patch.json";
import { augmentHref } from "./augment-library";
import type { Section } from "./document";
import { heroAugmentForGuide } from "./hero-augments";
import { itemLink } from "./links";
import { authoredDirectoryRoutes } from "./reroll-stages";
import { sameEdition } from "./version-updates";
import type { Item, Season, Team, TeamCondition, Unit } from "./types";

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
  category: "神器" | "光明装" | "海克斯" | "转职" | "人口装";
  item?: Item;
  recipient?: Unit;
  image?: string;
  replaced?: Item;
  href: string;
  detail?: string;
} & Pick<ConditionRule, "kind" | "action" | "games" | "featured">;

type GuideConditions = { rows: GuideCondition[]; board?: Team; guideWide?: boolean; label?: string; wearer?: Unit; source?: string };

export const conditionEquipmentCategories = { artifact: "神器", radiant: "光明装", emblem: "转职" } as const;
const augmentById = new Map(augmentCatalog.rows.map(augment => [augment.id, augment]));

export function conditionItemCategory(item?: Item) {
  const category = item?.category;
  if (category === "artifact" || category === "radiant" || category === "emblem") return category;
}

export function conditionKey(condition: TeamCondition) {
  return "augmentId" in condition ? condition.augmentId : `${condition.itemId}:${condition.recipientId}`;
}

export function guideConditionTag(row: GuideCondition) {
  return row.kind === "required" ? (row.category === "光明装" ? "光装" : row.category) + "定阵" : undefined;
}

export function guideConditionName(row: GuideCondition) {
  return row.recipient ? row.name + "给" + row.recipient.name : row.name;
}

export function guideConditionHasName(row: GuideCondition) {
  return row.category === "海克斯" || row.category === "转职" || row.category === "人口装" || Boolean(row.recipient);
}

function augmentCondition(id: string, rule: Pick<ConditionRule, "kind" | "action" | "games" | "featured">): GuideCondition | undefined {
  const augment = augmentById.get(id);
  if (!augment) return;
  return { ...rule, id, name: augment.name, category: "海克斯", detail: rule.action, image: augmentArtPath(augment), href: augmentHref(id) };
}

const guideConditions: Partial<Record<string, {
  boardId?: string;
  build?: string;
  label?: string;
  sharedInEditor?: true;
  wearerId?: string;
  source?: string;
  conditions: ConditionRule[];
}>> = { [GUIDE_SECTION_IDS.encoreEzreal]: {
  boardId: "00000000-0000-4000-8000-000000000050",
  build: "6018196",
  label: "8级四安可",
  sharedInEditor: true,
  wearerId: "ezreal",
  source: "https://api-hc.metatft.com/tft-explorer-api/unit_builds/DA_Ezreal19?queue=PBE&patch=19.1&b_patch=b&days=3&permit_filter_adjustment=false&compact=true&formatnoarray=true&duplicate_unit_count=0&unit_tier_numitems_unique=DA_Ezreal19-1_3_3&level=8&trait=DA_Encore19_2&trait=DA_Heartsteel19_2&unit_unique=DA_Nasus19-1&unit_unique=DA_Lucian19-1&item_holder_unit=DA_Ezreal19-1",
  conditions: [
    { itemId: "DA_Artifact_SilvermereDawn", replaces: "TFT_Item_PowerGauntlet", kind: "required", featured: true, games: 30 },
    { itemId: "DA_BlueBuffRadiant", replaces: "TFT_Item_BlueBuff", kind: "upgrade", featured: true, action: "开战获得 20 法力，更早启动。", games: 21 },
    { itemId: "DA_Artifact_GoldCollector", replaces: "TFT_Item_PowerGauntlet", kind: "option", action: "处决残血，有机会掉金币。", games: 27 },
    { augmentId: "DA_Augment19_Heartsteel_SmallSquad", kind: "option", action: "保留瑟提、奎桑提，开 3 心之钢。" },
  ],
}, [GUIDE_SECTION_IDS.prodigyMalzahar]: {
  boardId: "00000000-0000-4000-8000-000000000017",
  label: "七级五天才",
  conditions: [
    { itemId: "emblem-prodigy", recipientId: "amumu", kind: "required", action: "七级给阿木木天才纹章。拉露恩到手后接替拉克丝，维持 5 天才。" },
  ],
}, [GUIDE_SECTION_IDS.rockVayne]: {
  conditions: [
    { itemId: "emblem-rock", kind: "option", featured: true },
    { itemId: "TFT_Item_ForceOfNature", kind: "option", featured: true },
  ],
}, [GUIDE_SECTION_IDS.oceanGraves]: {
  boardId: PYKE_GRAVES_BOARD_ID,
  label: "五非主流派克男枪",
  conditions: [
    { itemId: "emblem-renegade", recipientId: "vi", kind: "option", action: "有非主流纹章直接给蔚（或九级补崔斯特）吃暴击与 10% 减伤，换下奇亚娜，八级即可提前开 5 非主流稳血。" },
  ],
} };

export function editableTeamConditions(team: Pick<Team, "id" | "sectionId" | "conditions">): TeamCondition[] {
  if (team.conditions) return team.conditions;
  const entry = team.sectionId && guideConditions[team.sectionId];
  if (!entry || entry.boardId !== team.id) return [];
  return entry.conditions.flatMap<TeamCondition>(rule => {
    const { kind } = rule;
    if ("augmentId" in rule) return [{ augmentId: rule.augmentId, kind }];
    const recipientId = rule.recipientId ?? entry.wearerId;
    return recipientId ? [{ itemId: rule.itemId, recipientId, replaces: rule.replaces, kind }] : [];
  });
}

export function sharedGuideEditorConditions(boards: Team[], sectionId: string | undefined, teamId?: string): TeamCondition[] {
  const entry = sectionId && guideConditions[sectionId];
  if (!entry || !entry.sharedInEditor || entry.boardId === teamId) return [];
  const main = boards.find(board => board.id === entry.boardId);
  return main ? editableTeamConditions({ id: main.id, sectionId, conditions: main.conditions }) : [];
}

function authoredCondition(rule: TeamCondition, data: Season): GuideCondition | undefined {
  if ("augmentId" in rule) return augmentCondition(rule.augmentId, rule);
  const item = data.items.find(item => item.id === rule.itemId);
  const category = conditionItemCategory(item);
  const recipient = data.units.find(unit => unit.id === rule.recipientId);
  if (!item || !category || !recipient) return;
  const replaced = data.items.find(item => item.id === rule.replaces);
  return { ...rule, id: item.id, name: item.name, category: conditionEquipmentCategories[category],
    item, replaced, recipient, href: itemLink(item.id, recipient.id) };
}

export function guideEquipmentConditions(section: Section, teams: Team[], data: Season,
  build = currentPatch.build, selectedBoard?: Team): GuideConditions | undefined {
  if (!teams.length) return;
  const currentEdition = sameEdition(data.id, currentPatch.seasonId);
  const augment = heroAugmentForGuide(section);
  const hero = currentEdition && augment && augmentCondition(augment.id, { kind: "required" });
  const heroRows = hero && augment ? [{ ...hero, name: augment.label || hero.name, detail: [augment.round, augment.rarity, augment.role].filter(Boolean).join(" · ") }] : [];
  const entry = currentEdition ? guideConditions[section.id] : undefined;
  const board = selectedBoard ?? teams.find(team => team.id === entry?.boardId) ?? teams.find(team => team.conditions?.length) ?? teams[0];
  const reference = entry && (!entry.boardId || board.id === entry.boardId) ? entry : undefined;
  const guideWide = Boolean(reference && !reference.boardId);
  const wearer = data.units.find(unit => unit.id === reference?.wearerId);
  const referenceApplies = reference && board &&
    (!reference.wearerId || (wearer && board.pieces.some(piece => piece.unitId === wearer.id)));
  const legacyRows = referenceApplies ? reference.conditions.flatMap<GuideCondition>(condition => {
    if ("augmentId" in condition) return augmentCondition(condition.augmentId, condition) ?? [];
    if (reference.build && build !== reference.build) return [];
    const item = itemMap.get(condition.itemId);
    const replaced = data.items.find(entry => entry.id === condition.replaces);
    const equipment = conditionItemCategory(item);
    const category = item?.category === "team-size" ? "人口装" : equipment && conditionEquipmentCategories[equipment];
    if (!item || !category) return [];
    if (condition.replaces && (!replaced || !board.pieces.some(piece => piece.unitId === wearer?.id && piece.items.includes(replaced.id)))) return [];
    const recipient = condition.recipientId ? unitMap.get(condition.recipientId) : undefined;
    if (condition.recipientId && !recipient) return [];
    return [{ ...condition, id: item.id, name: item.name, item, recipient, replaced,
      detail: recipient || category === "人口装" ? condition.action : undefined,
      href: itemLink(item.id, recipient?.id ?? wearer?.id), category }];
  }) : [];
  const authoredRows = board.conditions?.flatMap(rule => {
    const row = authoredCondition(rule, data);
    if (!row) return [];
    const previous = legacyRows.find(legacy => legacy.id === row.id && legacy.category === row.category &&
      (!row.item || ((legacy.recipient?.id ?? wearer?.id) === row.recipient?.id && legacy.replaced?.id === row.replaced?.id)));
    return previous ? [{ ...row, action: previous.action, detail: previous.action, games: previous.games, featured: previous.featured }] : [row];
  });
  const rows = authoredRows ?? legacyRows;
  if (guideWide && authoredRows) rows.push(...legacyRows.filter(legacy => !authoredRows.some(row => row.id === legacy.id)));
  if (rows.length) return {
    board, guideWide, wearer: board.conditions ? undefined : wearer,
    rows: [...heroRows.filter(row => !rows.some(other => other.id === row.id)), ...rows], label: reference?.label,
    source: rows.some(rule => rule.item && rule.games) ? reference?.source : undefined,
  };
  if (hero) return { rows: heroRows };
}

export function guideReferenceConditions(section: Section, teams: Team[], data: Season, selectedBoard: Team) {
  if (section.reroll?.stages.some(stage => stage.teamId === selectedBoard.id && stage.ownEvidenceOnly)) return;
  const boardId = guideConditions[section.id]?.boardId;
  if (!boardId || boardId === selectedBoard.id) return;
  if (authoredDirectoryRoutes(section).length &&
      !section.reroll?.stages.some(stage => stage.teamId === selectedBoard.id && stage.parentTeamId === boardId && stage.boardRole !== "variant")) return;
  const board = teams.find(team => team.id === boardId);
  if (!board) return;
  const conditions = guideEquipmentConditions(section, teams, data, undefined, board);
  if (!conditions?.label) return;
  const hero = heroAugmentForGuide(section);
  const rows = conditions.rows.filter(row => row.id !== hero?.id);
  return rows.length ? { ...conditions, board, label: conditions.label, rows } : undefined;
}
