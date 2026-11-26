const illbeatsAliases = ["病拍", "酷炫节拍", "炫酷节拍"];
const illbeatsName = "大触打击乐";

/** @type {ReadonlyArray<readonly [RegExp, string]>} */
const legacyTraitTerms = [
  [/酷炫节拍|炫酷节拍|病拍/g, illbeatsName],
  [/保镖/g, "护卫"],
  [/疾风射手|迅捷攻手/g, "迅击鼓手"],
  [/迅捷射手|花射/g, "花式射手"],
  [/海洋之歌|海滩流行/g, "海之歌"],
  [/超流行乐?/g, "高能流行"],
  [/五杀摇滚/g, "五杀乐队"],
  [/(?<!情绪)摇滚乐(?!队)/g, "摇滚恶魔"],
  [/炫音返场/g, "安可"],
  [/黑魔法师/g, "法师"],
  [/金曲制作人纹章/g, "音乐制作人纹章"],
  [/金曲制作人/g, "制作人"],
  [/\u53db\u9006\u8005|混沌战士/g, "非主流"],
  [/屠戮者|裁决战士/g, "舞者"],
];

/** @param {string} text */
export function displayTraitNames(text) {
  return legacyTraitTerms.reduce((name, [former, current]) => name.replace(former, current), text);
}

/** @type {Readonly<Record<string, string>>} */
export const legacyEmblemNames = {
  海洋之歌纹章: "海之歌纹章",
  超流行乐纹章: "高能流行纹章",
  酷炫节拍纹章: "大触打击乐纹章",
  五杀摇滚纹章: "五杀乐队纹章",
  摇滚乐纹章: "摇滚恶魔纹章",
  黑魔法师纹章: "法师纹章",
  保镖纹章: "护卫纹章",
  泰坦纹章: "主唱纹章",
  金曲制作人纹章: "音乐制作人纹章",
  经理纹章: "经纪人纹章",
  裁决战士纹章: "舞者纹章",
  迅捷攻手纹章: "迅击鼓手纹章",
  炫酷节拍纹章: "大触打击乐纹章",
  病拍纹章: "大触打击乐纹章",
};

/** @type {ReadonlyArray<readonly [RegExp, string]>} */
const guideTitleTraits = [
  [/(?:酷炫|炫酷)(?:节拍)?/g, illbeatsName],
  [/疾风(?:射手)?/g, "迅击鼓手"],
  [/花式(?!射手)/g, "花式射手"],
  [/海洋/g, "海之歌"],
  [/([三五七357])海(?!之歌)/g, "$1海之歌"],
  [/古典(?!乐)/g, "古典乐"],
  [/爵士(?!乐)/g, "爵士乐"],
  [/编舞(?!师)/g, "编舞师"],
  [/(?<!情绪)摇滚(?!恶魔)乐?/g, "摇滚恶魔"],
  [/([双二四五六246]\s*)泰坦(?!的坚决)/g, "$1主唱"],
];

/** Use for S19 lineup names and titles, not equipment names or player prose. @param {string} title */
export function displayGuideName(title) {
  if ([
    "爵士派克兔牛", "爵士金克丝", "四古典烬", "三爵士五杀史密奇", "三爵士史密奇",
    "八级 · 四古典烬", "八级 · 六古典烬猫", "六古典烬猫", "九级 · 三爵士史密奇", "七级 · 古典过渡",
    "八级 · 五杀爵士", "九级 · 三爵士五杀",
  ].includes(title)) return title;
  return guideTitleTraits.reduce((name, [former, current]) => name.replace(former, current), displayTraitNames(title));
}

/** @param {import("./types").Trait} trait */
export function preferredTraitName(trait) {
  const illbeats = trait.id === "illbeats";
  const name = trait.gameName || (illbeats ? illbeatsName : trait.name);
  if (name === trait.name && !illbeats) return trait;
  return {
    ...trait,
    name,
    description: illbeats ? displayTraitNames(trait.description) : trait.description,
    aliases: [...new Set([...(trait.aliases ?? []), trait.name,
      ...(illbeats ? illbeatsAliases : [])])].filter(alias => alias !== name),
  };
}

/** @param {import("./types").Trait[]} traits */
export function preferredSeasonTraitNames(traits) {
  const named = traits.map(preferredTraitName);
  const officialNames = new Set(named.map(trait => trait.name));
  return named.map(trait => ({ ...trait, aliases: trait.aliases?.filter(alias => !officialNames.has(alias)) }));
}
