/** @type {Record<string, {exclusiveTier?: number; condition: string}>} */
const prismaticQuests = {
  "k-da": { exclusiveTier: 21, condition: "棱彩需要先拿 K/DA 专属任务，再凑到 21 星。" },
  "ionic-spark": { exclusiveTier: 10, condition: "棱彩需要先拿离子专属任务，开 7 离子用 10 回合收集签名，最后上 10 离子。" },
  heartsteel: { condition: "棱彩需要先拿心之钢专属任务，开 7 心之钢，让成员完成伤害、承伤和治疗要求。" },
  pentakill: { condition: "棱彩需要先拿五杀专属任务，开 7 五杀，让任务指定的弈子完成击杀要求，并升到 10 级。" },
  "true-damage": { condition: "棱彩需要先拿真实伤害专属任务，开 5 真实伤害，按任务指定的顺序打赢或打输玩家对战。" },
};

/** @param {string} id */
export function requiresPrismaticQuest(id) {
  return Object.hasOwn(prismaticQuests, id);
}

/** A board records its pieces, not the player's quest progress.
 * @param {import("./types").Trait} trait @param {number} count
 */
export function confirmedTraitLevel(trait, count) {
  if (trait.dynamic) return 0;
  const gated = prismaticQuests[trait.id]?.exclusiveTier;
  return Math.max(0, ...trait.thresholds.filter(level => level !== gated && count >= level));
}

/** @param {import("./types").Trait} trait @param {string} [holderName] @param {boolean} [showBasic] */
export function traitActivationText(trait, holderName, showBasic = true) {
  if (trait.id === "collab") return "上场本局的 3 名不同合奏成员开启，5 名升档。娑娜固定是合奏，其余成员每局变化。";
  if (trait.axis === "special" && trait.thresholds.length === 1 && trait.thresholds[0] === 1) {
    if (!showBasic) return "";
    return holderName ? `上场${holderName}即可开启。` : "上场拥有该专属羁绊的弈子即可开启。";
  }
  const quest = prismaticQuests[trait.id];
  if (!showBasic && trait.countMode !== "stars" && trait.id !== "edm" && trait.id !== "r-b") return quest?.condition ?? "";
  const [first, ...rest] = trait.thresholds.filter(level => level !== quest?.exclusiveTier);
  if (first == null) return "";
  let rule;
  if (trait.countMode === "stars") {
    rule = `场上不同${trait.name}弈子的星级相加，${first} 星开启，同名只取最高星。`;
    if (rest.length) rule += `${rest.join("、")} 星升档。`;
  } else if (trait.id === "edm") {
    rule = "贾克斯和蔚同时上场开启。";
  } else if (trait.id === "r-b") {
    rule = "上场梅尔或芮尔开启 1 档，两人同时上场开启 2 档。";
  } else {
    rule = `上场 ${first} 名${first === 1 ? "" : "不同的"}${trait.name}弈子开启`;
    rule += rest.length ? `，${rest.join("、")} 名升档。` : "。";
  }
  return rule + (quest?.condition ?? "");
}
