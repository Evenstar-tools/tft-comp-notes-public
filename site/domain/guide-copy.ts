import type { ContentBlock } from "./document";
import { itemAliases } from "./roster-import.ts";
import type { Season, Team } from "./types";

// Match the published wording so a later edit can replace any of these lines.
const reviewedCopy: Record<string, [string, string][]> = {
  "00000000-0000-4000-8000-000000000042": [
    ["二阶段选秀前 D 四次开芬妮，两星炸弹带一件开可酷伯。五级追炸弹和可酷伯，熊三星早就把肉装给他。", "开了芬妮、有吉格斯和可酷伯才走。缺芬妮转八级三爵士。"],
    ["六级四高能配芬妮、乌鸦，芬妮牌多一起追三。900 热力开提莫，一星就上，成型两星。错过芬妮就走八级三爵士。", ""],
    ["主C：吉格斯、萨勒芬妮。吉格斯羊刀、法爆、科技枪。芬妮青龙刀、虚空之杖、鬼书，提莫没开前就能铺减魔抗和重伤。", ""],
    ["提莫一星可上，九级追两星。接余下的青龙刀、帽子和法装。", ""],
    ["主坦：可酷伯。早到三星便接石像鬼、狂徒、振奋。斯维因补前排和余肉。", "可酷伯先三星就接肉装，余肉给斯维因。"],
    ["七级上盖伦。八级热力没满先放加里奥，提莫一星到手就换上。九级补奈德丽。", "七级上盖伦。八级热力没满先放加里奥，提莫一星到手就换上。"],
  ],
  "00000000-0000-4000-8000-000000000096": [
    ["吉格斯、可酷伯在五级追三，六级补齐四高能，追三星芬妮。斯维因两星就停。没解锁芬妮，走八级三爵士。", "六级上四高能加芬妮、斯维因。从芬妮、璐璐和小炮里顺牌追两张，凑够四个三星让芬妮升巨星。斯维因两星够用。没解锁芬妮就走八级三爵士。"],
  ],
  "00000000-0000-4000-8000-000000000098": [
    ["可酷伯主坦，吉格斯羊刀法爆科技枪，小炮无尽轻语。斯维因带离子、日炎。想上提莫可换加里奥，三爵士降成两爵士。", "提莫可换加里奥，三爵士降成两爵士。"],
  ],
  "00000000-0000-4000-8000-000000000087": [
    ["双 C 追三后升八，下阿木木，上约里克和奥拉夫。约里克带薄暮、日炎站双 C 同侧第一排，佛耶戈从第二排进场，贝蕾亚看对手后排换边。", "双 C 追三再升八。约里克站双 C 同侧第一排，佛耶戈从第二排进场。贝蕾亚看对手后排换边。"],
    ["无尽、饮血的散件多，七级搜佛耶戈、贝蕾亚双三星。先凑六舞者，八级补约里克和奥拉夫。", "无尽、饮血的散件多再走这套。"],
    ["七级让不同名舞者或真实伤害棋子合计达到六星，解锁亚索。停七摆佛耶戈、贝蕾亚、凯隐、卡蜜尔、永恩、亚索、阿木木，开六舞者。双C追三后升八，阿木木下，上约里克、奥拉夫，开三五杀双主宰。", "七级让不同名舞者或真实伤害棋子合计达到六星，解锁亚索。"],
    ["约里克带日炎重伤、薄暮破甲，站双C同侧。两张三星后再存钱，九级若有两星永恩开厄斐琉斯，可补心之钢。", "九级若有两星永恩开厄斐琉斯，可补心之钢。"],
  ],
  "00000000-0000-4000-8000-000000000013": [
    ["停七　德莱文、布隆、卡莎、俄洛伊、奥拉夫、斯维因、韦鲁斯。布隆站前排中央，德莱文和带轻语的卡莎同侧隔一格，遇到范围伤害再分边。", ""],
    ["留牌　七级三费率 43%。先 D 到德莱文、布隆两星，再留 50 金慢搜。调音台先补布隆撑场所需的生命，余下给攻击力。", "七级三费率 43%。双核两星后留 50 金追三。调音台先给布隆补生命，余下给攻击力。"],
    ["配装　德莱文带青龙刀、无尽、死亡之刃。布隆拿板甲、狂徒、振奋。卡莎轻语破甲，俄洛伊日炎重伤。", ""],
  ],
  "00000000-0000-4000-8000-000000000059": [
    ["4-2 上八搜烬、锤石，两星接装就成型。 八级挑一轮前两排只放一人开吸血鬼，没来用烈娜塔。奎桑提带薄暮能破到烬的目标，就省轻语。", ""],
    ["能赢再上九补女枪，给她余装，烬继续主 C。", ""],
    ["通常 4-2 上八搜烬和锤石。烬两星换莎弥拉接输出装，锤石两星换卡特接肉装，再补回内瑟斯。锤石锁着就先用两星内瑟斯扛。", "烬两星接莎弥拉的输出装，锤石两星接卡特的肉装，再补回内瑟斯。"],
    ["八级挑一轮前两排只留一人，解锁弗拉基米尔后摆回。弗拉基米尔没到先留烈娜塔保四古典。梅尔和弗拉基米尔开双黑魔，梅尔带鬼书补重伤。", "挑一轮前两排只留一人开弗拉基米尔，解锁后摆回。弗拉基米尔没到，先留烈娜塔保四古典。"],
    ["主坦：锤石。板甲、狂徒、振奋。薄暮给烬同侧的奎桑提，鬼书先给烈娜塔，成型交给梅尔。", "鬼书先给烈娜塔，成型交给梅尔。"],
  ],
};

const reviewedPatchCopy = [
  {
    advice: "霞来得早、能连胜再走，八级先做解锁，稳血再上九。",
    text: "霞来得早、场面能赢就走四国风。八级用四心之钢打工，先让霞上场做任务。",
    replacement: "八级用四心之钢打工。",
  },
  {
    advice: "吉格斯、可酷伯来得早再走。可酷伯先三星就先给肉装。",
    text: "开了芬妮、有吉格斯和可酷伯才走。缺芬妮转八级三爵士。",
    replacement: "芬妮已解锁才走，没开就转八级三爵士。",
  },
  {
    advice: "吉格斯、可酷伯来得早再走。可酷伯先三星就先给肉装。",
    text: "可酷伯先三星就接肉装，余肉给斯维因。",
    replacement: "余肉给斯维因。",
  },
];

export function reviewedGuideCopy(text: string, team: Team, patchNote?: string) {
  const revised = reviewedCopy[team.id]?.find(([source]) => source === text.trim())?.[1] ?? text;
  return reviewedPatchCopy.find(entry => entry.advice === patchNote?.trim() && entry.text === revised.trim())?.replacement ?? revised;
}

function clauses(text: string) {
  return text.match(/[^。！？\n]+[。！？]?/g)?.map(part => part.trim()) ?? [];
}

export function guideCopyKey(text: string) {
  return text.replace(/[\s。！？，、；：,:;.!?]/g, "");
}

export function rememberGuideCopy(text: string, seen: Set<string>) {
  for (const part of clauses(text)) seen.add(guideCopyKey(part));
}

export function hasGuideLinks(block: ContentBlock) {
  return block.elements?.some(element => element.mention_doc || element.text_run?.text_element_style?.link);
}

function wornNames(team: Team, data: Season, unitId: string) {
  const pieces = team.pieces.filter(piece => piece.unitId === unitId);
  return data.items.filter(item => pieces.length && pieces.every(piece => piece.items.includes(item.id))).map(item => item.name);
}

const shortNames: Record<string, string> = { ...itemAliases, 石像鬼: "石像鬼石板甲", 振奋: "振奋盔甲", 薄暮: "薄暮法袍", 虚空杖: "虚空之杖", 杀人剑: "死亡之刃", 泰坦: "泰坦的坚决" };
function itemList(part: string, names: string[]) {
  return part.replace(/[。！？]$/, "").split(/[、，,]/).every(word => {
    const name = word.trim();
    return names.includes(shortNames[name] ?? name);
  });
}

/** Remove literal item lists only when the named wearer already has them on this board. */
export function compactGuideParagraph(text: string, team: Team, data: Season, seen: Set<string>, patchNote?: string) {
  const revised = reviewedGuideCopy(text, team, patchNote);
  if (revised.trim().includes("\n")) return revised;
  if (team.id === "00000000-0000-4000-8000-000000000104" &&
      revised.trim() === "主坦：孙悟空。石像鬼、狂徒、振奋。八级布隆代持，蕾欧娜先带日炎补重伤。" &&
      seen.has(guideCopyKey("卢锡安两星拿霞装，布隆拿肉。")) &&
      seen.has(guideCopyKey("孙悟空两星接布隆的肉装。")) &&
      itemList("石像鬼、狂徒、振奋", wornNames(team, data, "wukong"))) {
    return "八级蕾欧娜先带日炎补重伤。";
  }
  const role = revised.match(/^(主C|副C|主坦|副坦|功能装)[：:]\s*([^。]+)。\s*/);
  const member = role && data.units.find(unit => unit.name === role[2].trim() && team.pieces.some(piece => piece.unitId === unit.id));
  const names = member ? wornNames(team, data, member.id) : [];
  const parts = clauses(role && member ? revised.slice(role[0].length) : revised);
  const explicitWearer = (part: string) => member && data.units.find(unit => part.startsWith(unit.name));
  const keep = parts.filter(part => {
    if (seen.has(guideCopyKey(part)) || itemList(part, names)) return false;
    const wearer = explicitWearer(part);
    const gear = wearer && part.slice(wearer.name.length).match(/^[：:带拿接]\s*(.+)$/)?.[1];
    return !wearer || !gear || !itemList(gear, wornNames(team, data, wearer.id));
  });
  if (keep.length === parts.length) return parts.length ? revised : "";
  return keep.length && member && !explicitWearer(keep[0]) ? member.name + "：" + keep.join("") : keep.join("");
}

export function compactUtilityCopy(text: string, unitId: string, team: Team, data: Season) {
  const names = wornNames(team, data, unitId);
  const namedEffect = (text: string) => {
    const item = text.match(/^(.+?)(?:补|挂|给前排补)?(?:重伤|减魔抗|魔抗击碎|破甲)[。.]?$/)?.[1]?.trim();
    return !!item && names.includes(shortNames[item] ?? item);
  };
  return clauses(text).map(part => {
    if (itemList(part.replace(/^(?:带|拿)\s*/, ""), names) ||
        part.replace(/[。！？]$/, "").split(/[，、,]/).every(namedEffect)) return "";
    const prefix = part.match(/^([^，,]+)[，,]\s*/);
    const rest = prefix && part.slice(prefix[0].length);
    if (prefix && rest && !/^(?:才|再|就|则|否则|即可)/.test(rest) &&
        (namedEffect(prefix[1]) || (/^(?:带|拿)\s*/.test(prefix[1]) &&
        itemList(prefix[1].replace(/^(?:带|拿)\s*/, ""), names)))) {
      return rest;
    }
    return part;
  }).join("");
}
