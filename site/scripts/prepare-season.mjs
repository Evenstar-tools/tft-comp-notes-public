import fs from "node:fs";
import path from "node:path";
import { pinyin } from "pinyin-pro";
import { preferredTraitName } from "../domain/trait-names.mjs";

import { currentUnlocks, researchRoot, updateUnlocks } from "./prepare-unlocks.mjs";

const research = path.join(researchRoot(), "2026-11-16");
const source = JSON.parse(
  fs.readFileSync(path.join(research, "units-source.json"), "utf8"),
);
const local = JSON.parse(
  fs.readFileSync(path.join(research, "local-s19-extracted.json"), "utf8"),
);
const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const rows = [
  "Ionic Spark",
  "K|DA",
  "True Damage",
  "Heartsteel",
  "Rock",
  "Pentakill",
  "Hyperpop",
  "Beach Pop",
  "Classical",
  "Illbeats",
  "Jazz",
  "R&B",
  "EDM",
  "Gu Feng",
  // 动态羁绊：成员每局不同，羁绊网单列一行并在行头注明，不当作固定成员。
  "Collab",
];
const columns = [
  "Bodyguard",
  "Manager",
  "Prodigy",
  "Frontman",
  "Arcanist",
  "Swiftstriker",
  "Encore",
  "Hitmaker",
  "Slayer",
  "Choreographer",
  "Trickshot",
  "Renegade",
  "Producer",
  "Juggernaut",
];
const excluded = new Set(local.currentMetaTFTFocusedChecks.traitsOnlyInLocal);
const overrides = local.currentMetaTFTFocusedChecks.breakpointChecks;
const aliasMap = {
  Ziggs: ["炸弹人", "zhadanren", "zdr", "jigesi", "jgs"],
  Ryze: ["瑞兹", "ruizi", "rz"],
  Sylas: ["塞拉斯", "sailasi", "sls"],
  Rakan: ["luo"],
  Xayah: ["xia"],
  Jinx: ["金克丝", "jinx", "jinkesi", "jks"],
  "Dr. Mundo": ["蒙多", "mengduo", "md"],
  "Miss Fortune": ["女枪", "nvqiang", "nq"],
  Wukong: ["猴子", "houzi", "hz", "sunwukong", "swk"],
  "Tahm Kench": ["塔姆", "tamu", "tm"],
  "Lee Sin": ["盲僧", "mangseng", "ms"],
  Alistar: ["牛头", "niutou", "nt"],
  Ashe: ["寒冰", "hanbing", "hb"],
  "Twisted Fate": ["卡牌", "kapai", "kp"],
  "Jarvan IV": ["皇子", "huangzi", "hz"],
  "Nunu & Willump": ["努努", "nunu", "nn"],
};
const publicAssets = path.resolve("public/assets");
fs.mkdirSync(publicAssets, { recursive: true });
function imagePath(image) {
  if (!image?.exists || !image.path) return "";
  const filename = path.basename(image.path);
  fs.copyFileSync(
    path.join(research, "local-s19-site", image.path),
    path.join(publicAssets, filename),
  );
  return `/assets/${filename}`;
}
// Riot PBE 19.1.0.5973071: CT_Glitterbomb19_StageToPoints and CT_GlitterBomb19.
const hyperpopDescription =
  "超流行弈子获得额外生命值和攻击速度。" +
  "每场玩家对战结束，上场的超流行弈子按星级产生热力，一星 3 点、两星 6 点、三星 12 点、四星 40 点，参与击杀再加 1 点。" +
  "2、3、4、5 名超流行弈子分别按 1、1.5、3、3.5 倍结算热力。每达到一个新的热力等级即可获得奖励。";
const traits = local.traits
  .filter((trait) => !excluded.has(trait.nameEn))
  .map((trait) => ({
    id: slug(trait.nameEn),
    name: trait.nameZh.replace(/（待官方）/g, ""),
    nameEn: trait.nameEn,
    axis: rows.includes(trait.nameEn)
      ? "row"
      : columns.includes(trait.nameEn)
        ? "column"
        : "special",
    thresholds: overrides[trait.nameEn] ?? trait.breakpoints,
    description: trait.nameEn === "Hyperpop" ? hyperpopDescription : trait.descriptionZh,
    image: imagePath(trait.image),
    dynamic: trait.nameEn === "Collab",
    provisional: true,
    countMode: trait.nameEn === "K|DA" ? "stars" : "unique",
  })).map(preferredTraitName);
const units = local.units.map((unit) => {
  const previous = source.units.find(([en]) => en === unit.baseNameEn);
  const isTrueDamage = unit.variant === "true-damage";
  const unitTraits = isTrueDamage
    ? source.akali_variant.traits
    : (previous?.[3].split(" / ") ?? unit.traits);
  let unlock = source.unlocks[unit.baseNameEn];
  if (isTrueDamage) unlock = undefined;
  return {
    id: slug(unit.baseNameEn + (unit.variant ? `-${unit.variant}` : "")),
    name:
      (previous?.[1] ?? unit.nameZh) +
      (unit.baseNameEn === "Akali"
        ? isTrueDamage
          ? " · 真实伤害"
          : " · K/DA"
        : ""),
    nameEn: unit.baseNameEn,
    cost: unit.cost,
    traits: unitTraits.map(slug),
    image: imagePath(unit.image),
    aliases: [
      ...(aliasMap[unit.baseNameEn] ?? []),
      unit.nameZh,
      unit.nameEn,
      pinyin(unit.nameZh, { toneType: "none" }).replaceAll(" ", ""),
      pinyin(unit.nameZh, { pattern: "first", toneType: "none" }).replaceAll(
        " ",
        "",
      ),
    ],
    ability: unit.abilityZh,
    ...(unlock
      ? { unlock: { text: unlock.zh, raw: unlock.en, note: unlock.note } }
      : {}),
  };
});
// Keep stable team identities and current trait rules. DataTFT enriches artwork
// and full skill wording; differing unlock sources remain separately attributed.
const datatftRoot = path.join(research, "datatft");
const datatft = JSON.parse(
  fs.readFileSync(path.join(datatftRoot, "mapping.json"), "utf8"),
);
const datatftById = new Map(datatft.units.map((entry) => [entry.localId, entry]));
if (datatftById.size !== units.length || datatft.units.length !== units.length)
  throw new Error("DataTFT hero mapping must be one-to-one");
const datatftAssets = path.join(publicAssets, "datatft");
fs.mkdirSync(datatftAssets, { recursive: true });
function datatftImage(entry, kind) {
  const image = entry.images.find((candidate) => candidate.kind === kind);
  if (!image || image.status !== "downloaded")
    throw new Error(`Missing DataTFT ${kind}: ${entry.localId}`);
  const filename = `${entry.localId}-${kind}.jpg`;
  fs.copyFileSync(path.join(datatftRoot, image.path), path.join(datatftAssets, filename));
  return `/assets/datatft/${filename}`;
}
// Names used in published guides and pasted rosters.
const guideAliases = {
  tristana: ["小炮"], kayle: ["天使"], mordekaiser: ["铁男"],
  "akali-kda": ["K/DA阿卡丽"], "akali-true-damage": ["真实伤害阿卡丽"],
};
for (const unit of units) {
  const entry = datatftById.get(unit.id);
  if (!entry || entry.cost !== unit.cost || !entry.abilityText)
    throw new Error(`Invalid DataTFT mapping: ${unit.id}`);
  unit.image = datatftImage(entry, "portrait");
  unit.splashImage = datatftImage(entry, "splash");
  unit.imageSource = entry.sourceUrl;
  unit.ability = entry.abilityText;
  unit.abilityName = entry.abilityName;
  unit.mana = entry.mana;
  unit.abilitySource = {
    label: "DataTFT",
    url: entry.sourceUrl,
    updatedAt: "2026.11.16",
  };
  if (unit.id === "kayle") {
    // The Chinese preview still uses the pre-PBE ascension skill.
    unit.ability = "被动：普攻对目标造成额外魔法伤害。\n主动：在 4 秒内获得 80% 攻速和无限攻击距离，每次普攻召唤一把剑。时间结束时剑雨落向当前目标，造成范围魔法伤害，并按召唤的剑数对目标追加魔法伤害。";
    unit.mana = "0/50";
    unit.abilitySource = { label: "S19 PBE 英文技能与数值", url: "https://data.metatft.com/lookups/TFTSet19_pbe_en_us.json", updatedAt: "2026.11.18" };
  }
  unit.aliases = [...new Set([
    ...unit.aliases,
    ...(guideAliases[unit.id] ?? []),
    entry.name,
    pinyin(entry.name, { toneType: "none" }).replaceAll(" ", ""),
    pinyin(entry.name, { pattern: "first", toneType: "none" }).replaceAll(" ", ""),
  ])];
  if (entry.unlock.text.trim()) {
    unit.sourceUnlock = {
      text: entry.unlock.text,
      url: entry.sourceUrl,
      note: entry.unlock.hasPlaceholder ? "来源中的 xx / xxx 尚未公布。" : "",
    };
  }
}
// Source identities are project-local; UI axes follow the user's grid reference, not a claimed official taxonomy.
const itemSource = JSON.parse(
  fs.readFileSync(path.join(research, "items-source.json"), "utf8"),
);
const items = itemSource.items.map((item) => ({
  id: item.id,
  name: item.name,
  image: item.icon,
  components: item.components,
  category: item.category,
  description: "通用装备参考 · S19 效果待核",
  status: item.status,
}));
const season = {
  id: "s19-preview-2026-11-16",
  title: "S19 棱彩音乐盛典",
  sourceDate: "2026-11-16",
  units,
  traits,
  items,
  sources: [source.source_url, "用户本地 S19-资料站/index.html", datatft.metadata.source],
  notes: [
    "预览资料，中文羁绊名暂用本地资料译名",
    "Collab 成员每局变化",
    "部分解锁阈值仍为 X",
    "羁绊行列分类为参考图驱动的 UI 配置",
    "DataTFT S19 页面显示版本 18.6；技能按来源全文保留，缺失系数未补造",
    "DataTFT 羁绊差异单独归档，未覆盖当前阵容计算规则",
  ],
};
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(
  "data/season.json",
  JSON.stringify(updateUnlocks(season, currentUnlocks()), null, 2) + "\n",
  "utf8",
);
console.log(
  JSON.stringify({
    units: units.length,
    distinctHeroes: new Set(units.map((unit) => unit.nameEn)).size,
    traits: traits.length,
    imageCount: units.filter((unit) => unit.image).length,
  }),
);
