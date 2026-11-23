const legacyIllbeatsName = "病拍";
const previousIllbeatsName = "酷炫节拍";
const illbeatsName = "大触打击乐";

/** @param {string} text */
export function displayTraitNames(text) {
  return text.replaceAll(legacyIllbeatsName, illbeatsName).replaceAll(previousIllbeatsName, illbeatsName);
}

/** @type {ReadonlyArray<readonly [RegExp, string]>} */
const guideTitleTraits = [
  [/酷炫(?:节拍)?|病拍/g, illbeatsName],
  [/疾风(?:射手)?|迅捷攻手/g, "迅击鼓手"],
  [/迅捷射手|花射|花式(?!射手)/g, "花式射手"],
  [/海洋之歌|海滩流行|海洋/g, "海之歌"],
  [/([三五七357])海(?!之歌)/g, "$1海之歌"],
  [/古典(?!乐)/g, "古典乐"],
  [/保镖/g, "护卫"],
  [/爵士(?!乐)/g, "爵士乐"],
  [/编舞(?!师)/g, "编舞师"],
  [/五杀摇滚/g, "五杀乐队"],
  [/(?<!情绪)摇滚(?!恶魔)乐?/g, "摇滚恶魔"],
  [/炫音返场/g, "安可"],
  [/金曲制作人/g, "制作人"],
  [/叛逆者|混沌战士/g, "非主流"],
  [/屠戮者|裁决战士/g, "舞者"],
  [/超流行乐?/g, "高能流行"],
  [/([双二四五六246]\s*)泰坦(?!的坚决)/g, "$1主唱"],
];

/** Use for S19 lineup names and titles, not equipment names or player prose. @param {string} title */
export function displayGuideName(title) {
  return guideTitleTraits.reduce((name, [former, current]) => name.replace(former, current), title);
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
      ...(illbeats ? [legacyIllbeatsName, previousIllbeatsName] : [])])].filter(alias => alias !== name),
  };
}

/** @param {import("./types").Trait[]} traits */
export function preferredSeasonTraitNames(traits) {
  const named = traits.map(preferredTraitName);
  const officialNames = new Set(named.map(trait => trait.name));
  return named.map(trait => ({ ...trait, aliases: trait.aliases?.filter(alias => !officialNames.has(alias)) }));
}
