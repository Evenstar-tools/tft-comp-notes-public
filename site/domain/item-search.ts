import type { Item, Trait } from "./types";

// Bind nicknames to the current equipment rather than the reused recipe slot.
const communityNames: Readonly<Record<string, string[]>> = {
  TFT_Item_BFSword: ["大剑"],
  TFT_Item_RecurveBow: ["反曲弓", "攻速弓"],
  TFT_Item_NeedlesslyLargeRod: ["大棒"],
  TFT_Item_TearOfTheGoddess: ["眼泪", "水滴"],
  TFT_Item_ChainVest: ["锁子", "护甲"],
  TFT_Item_NegatronCloak: ["魔抗"],
  TFT_Item_GiantsBelt: ["腰带"],
  TFT_Item_SparringGloves: ["拳套"],
  TFT_Item_Spatula: ["铲子", "铲铲"],
  TFT_Item_FryingPan: ["锅锅", "平底锅"],
  TFT_Item_AdaptiveHelm: ["头盔", "适应头盔"],
  TFT_Item_ArchangelsStaff: ["大天使"],
  TFT_Item_Bloodthirster: ["饮血"],
  TFT_Item_BlueBuff: ["蓝buff", "blue buff", "buff"],
  TFT_Item_BrambleVest: ["反甲", "荆棘背心"],
  TFT_Item_Deathblade: ["杀人剑", "死刃"],
  TFT_Item_DragonsClaw: ["龙牙", "龙爪"],
  TFT_Item_FrozenHeart: ["冰甲", "圣盾誓约"],
  TFT_Item_GargoyleStoneplate: ["板甲", "石像鬼", "石像板甲"],
  TFT_Item_GuardianAngel: ["夜刃", "夜锋"],
  TFT_Item_GuinsoosRageblade: ["羊刀", "鬼索", "鬼索狂暴之刃"],
  TFT_Item_HextechGunblade: ["科技枪", "科技枪刃"],
  TFT_Item_InfinityEdge: ["无尽"],
  TFT_Item_IonicSpark: ["离子"],
  TFT_Item_JeweledGauntlet: ["法爆"],
  TFT_Item_LastWhisper: ["轻语"],
  TFT_Item_Leviathan: ["纳什"],
  TFT_Item_MadredsBloodrazor: ["巨杀", "巨人捕手"],
  TFT_Item_Morellonomicon: ["鬼书"],
  TFT_Item_NightHarvester: ["心之钢", "坚定"],
  TFT_Item_PowerGauntlet: ["链枷", "破防", "破防者"],
  TFT_Item_Quicksilver: ["水银"],
  TFT_Item_RabadonsDeathcap: ["帽子", "大帽"],
  TFT_Item_RapidFireCannon: ["红buff", "red buff", "buff"],
  TFT_Item_RedBuff: ["日炎"],
  TFT_Item_Redemption: ["振奋", "绿甲"],
  TFT_Item_RunaansHurricane: ["海妖"],
  TFT_Item_SpearOfShojin: ["青龙刀", "龙刀", "青龙"],
  TFT_Item_SpectralGauntlet: ["薄暮", "薄幕", "薄暮袍"],
  TFT_Item_StatikkShiv: ["虚空杖", "虚空法杖"],
  TFT_Item_SteraksGage: ["血手"],
  TFT_Item_ThiefsGloves: ["偷偷", "偷窃手套", "小偷手套"],
  TFT_Item_TitansResolve: ["泰坦"],
  TFT_Item_UnstableConcoction: ["正义", "正义拳"],
  TFT_Item_WarmogsArmor: ["狂徒"],
  TFT_Item_ForceOfNature: ["自然之力", "金铲冠冕", "双铲"],
  TFT_Item_TacticiansRing: ["锅铲冠"],
  TFT_Item_TacticiansScepter: ["双锅", "双锅冠冕"],
  DA_Artifact_BlightingJewel: ["枯萎", "枯萎宝石"],
  DA_Artifact_DeathfireGrasp: ["冥火", "冥火之拥"],
  DA_Artifact_Dawncore: ["黎明核"],
  DA_Artifact_DeathsDefiance: ["死舞", "死亡之舞"],
  DA_Artifact_Fishbones: ["鱼骨"],
  DA_Artifact_ForbiddenIdol: ["雕像", "禁忌"],
  DA_Artifact_GamblersBlade: ["投机", "赌徒之刃"],
  DA_Artifact_GoldCollector: ["收集者", "收集器"],
  DA_Artifact_HellfireHatchet: ["小斧", "地狱火短斧"],
  DA_Artifact_HorizonFocus: ["视界"],
  DA_Artifact_Hullcrusher: ["碎舰", "破舰者"],
  DA_Artifact_InfinityForce: ["三相"],
  DA_Artifact_LichBane: ["巫妖"],
  DA_Artifact_LightshieldCrest: ["光盾"],
  DA_Artifact_LudensTempest: ["卢登"],
  DA_Artifact_MogulsMail: ["大亨"],
  DA_Artifact_NavoriFlickerblade: ["烁刃"],
  DA_Artifact_RapidFireCannon: ["火炮"],
  DA_Artifact_SeekersArmguard: ["护臂", "探索者护臂"],
  DA_Artifact_SilvermereDawn: ["密银"],
  DA_Artifact_SnipersFocus: ["狙击镜", "狙击手专注"],
  DA_Artifact_StatikkShiv: ["电刀", "斯塔缇克电刀"],
  DA_Item_Artifact_TalismanOfAscension: ["飞升符"],
  DA_Artifact_TitanicHydra: ["巨九", "九头蛇"],
  DA_Artifact_VoidGauntlet: ["虚空手套"],
  DA_Artifact_WitsEnd: ["智慧末刃", "智慧末"],
  DA_Artifact_ZhonyasParadox: ["中娅", "金身", "沙漏"],
  DA_ChaliceOfPower: ["圣杯"],
  DA_RanduinsOmen: ["兰顿"],
  DA_ZekesHerald: ["基克"],
  DA_ZZRotPortal: ["传送门"],
  DA_AdaptiveHelm_Radiant: ["千变者贾修"],
  DA_GuinsoosRagebladeRadiant: ["鬼索的清算"],
  DA_InfinityEdgeRadiant: ["天顶锋刃"],
  DA_SpearOfShojinRadiant: ["希拉娜之矛"],
};

export function makeItemSearchTerms(items: readonly Item[], names: (item: Item) => string[]) {
  const own = (item: Item) => [...names(item), ...(communityNames[item.id] ?? [])];
  const baseItems = items.filter(item => item.category === "completed");
  return (item: Item) => {
    const terms = own(item);
    if (item.category !== "radiant") return [...new Set(terms)];
    const baseNames = terms.filter(name => /^光明版/.test(name)).map(name => name.replace(/^光明版\s*/, ""));
    const base = baseItems.find(entry => baseNames.includes(entry.name));
    const aliases = [...baseNames, ...(base ? own(base) : [])];
    return [...new Set([...terms, ...aliases.flatMap(name => ["光" + name, "光明" + name, "光明版" + name])])];
  };
}

const emblemShortNames: Record<string, string[]> = {
  "beach-pop": ["海歌", "海洋"], hyperpop: ["高能", "流行"], "true-damage": ["真伤"],
  arcanist: ["法", "黑法"], choreographer: ["编舞"], manager: ["经纪", "经理"], swiftstriker: ["迅击", "鼓手"],
};

export function emblemSearchNames(item: Item, trait: Trait) {
  return [...new Set([trait.name, trait.gameName, trait.nameEn, ...(trait.aliases ?? []),
    item.name.replace(/(?:纹章|徽章)$/, ""), ...(emblemShortNames[trait.id] ?? [])].filter((name): name is string => Boolean(name)))];
}
