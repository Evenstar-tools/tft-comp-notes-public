import type { Season, Team } from "./types";
import { guideBoardSearchAliases } from "./guide-slugs.ts";
import { unitSearchNames } from "./unit-search.mjs";

export const guideSearchKey = (line: string) => line.normalize("NFKC").toLowerCase().replace(/[\s·'’()./&_-]/g, "");
const key = guideSearchKey;

export function guideBoardBySearchAlias<T extends Pick<Team, "id">>(sectionId: string, boards: readonly T[], query: string) {
  const term = key(query);
  return term ? boards.find(board => guideBoardSearchAliases(sectionId, board.id).some(alias => key(alias) === term)) : undefined;
}

export function splitGuideConditions(text: string) {
  return [...new Set(text.split(/\s*[+＋]\s*(?=[^+＋\s])/).map(part => part.trim()).filter(Boolean))].slice(0, 5);
}

export function guideWearerQuery(query: string) {
  const match = query.trim().match(/^(.+?)\s*(主\s*C)?\s*(?:携带|佩戴)\s*(.+)$/i);
  if (!match) return;
  const unit = match[1].trim();
  const item = match[3].trim();
  if (unit && item) return { unit, item, carry: Boolean(match[2]) };
}
const starToken = "(?:[一二两三123]星|[123]★|★{1,3})";
const starPrefix = new RegExp(`^(${starToken})(.+)$`);
const starSuffix = new RegExp(`^(.+?)(${starToken})$`);
const starsByToken: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3 };
const starForms = [["一星", "1星", "★", "1★"], ["二星", "两星", "2星", "★★", "2★"], ["三星", "3星", "★★★", "3★"]];

const digits = "〇一二三四五六七八九";
const numberToken = "[\\d一二两三四五六七八九十]{1,3}";
const populationPattern = new RegExp(`^(${numberToken})(?:人口|级|人)$`);
const traitPattern = new RegExp(`^(${numberToken})(?:星)?(.+)$`);

function queryNumber(value: string) {
  const normalized = value.replace(/两/g, "二");
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const [ten, one] = normalized.split("十");
  return one === undefined ? digits.indexOf(ten) :
    (ten ? digits.indexOf(ten) : 1) * 10 + (one ? digits.indexOf(one) : 0);
}

export function guideStyleKey(value: string) {
  return key(value).replace(/^84$/, "速八").replace(/^95$/, "速九")
    .replace(/^[速](\d)/, (_, digit: string) => "速" + digits[Number(digit)])
    .replace(/^(\d)([级费])/, (_, digit: string, label: string) => digits[Number(digit)] + label)
    .replace(/慢d$/, "慢搜").replace(/运营$/, "");
}

export function matchesGuideStyle(actual: string, requested: string) {
  const key = guideStyleKey(actual);
  const filter = guideStyleKey(requested);
  if (filter === "慢搜") return key.includes("慢搜") || key.includes("追三");
  if (filter === "高费") return key === "速八" || key === "速九";
  return key === filter;
}

export function guideTraitNames(trait: Season["traits"][number]) {
  return [trait.gameName ?? "", trait.name, trait.nameEn, ...(trait.aliases ?? [])].map(key).filter(Boolean);
}

export function homeGuideFilter(query: string, season: Season) {
  const term = key(query);
  const population = populationPattern.exec(term);
  if (population) return { kind: "population" as const, value: queryNumber(population[1]) };

  const style = guideStyleKey(term);
  if (/^(?:速[八九]|(?:[一二三四五六七八九][级费]|低费)?慢搜)$/.test(style)) {
    return { kind: "style" as const, value: style };
  }

  const trait = traitPattern.exec(term);
  if (!trait) return;
  const value = queryNumber(trait[1]);
  const exact = season.traits.filter(entry => [entry.gameName, entry.name].some(name => name && key(name) === trait[2]));
  const candidates = exact.length ? exact : season.traits.filter(entry => guideTraitNames(entry).includes(trait[2]));
  if (candidates.length) return { kind: "trait" as const, ids: candidates.map(entry => entry.id), value };
}

type OpeningSearch =
  | { kind: "star"; stars: number; unitIds: string[]; names: string[] }
  | { kind: "emblem"; itemIds: string[]; names: string[] };

export function openingSearch(query: string, season: Season): OpeningSearch | undefined {
  const value = key(query);
  const prefix = starPrefix.exec(value);
  const suffix = prefix ? null : starSuffix.exec(value);
  if (prefix || suffix) {
    const token = prefix?.[1] ?? suffix![2];
    const hero = prefix?.[2] ?? suffix![1];
    const stars = token.startsWith("★") ? token.length : starsByToken[token[0]] ?? Number(token[0]);
    const units = season.units.flatMap(unit => {
      const names = unitSearchNames(unit).map(key);
      return names.includes(hero) ? [{ id: unit.id, names }] : [];
    });
    return { kind: "star", stars, unitIds: units.map(unit => unit.id), names: units.flatMap(unit => unit.names) };
  }

  const emblem = /^(.+?)(?:转职|纹章|转)$/.exec(value);
  if (!emblem) return;
  const found = season.items.flatMap(item => {
    if (!item.traitId) return [];
    const trait = season.traits.find(entry => entry.id === item.traitId);
    const names = [item.name.replace(/纹章$/, ""), trait?.name, trait?.nameEn, ...(trait?.aliases ?? [])]
      .filter((name): name is string => !!name).map(key);
    return names.some(name => name === emblem[1] || (emblem[1].length >= 2 && name.startsWith(emblem[1])))
      ? [{ id: item.id, names }] : [];
  });
  return {
    kind: "emblem",
    itemIds: found.map(item => item.id),
    names: found.length === 1 ? [...found[0].names, emblem[1]] : found.flatMap(item => item.names),
  };
}

function statements(text: string) {
  return (text.match(/[^。；！？\n]+[。；！？]?/g) ?? []).map(line => line.trim()).filter(Boolean);
}

export function matchOpeningSearch(search: OpeningSearch, team: Team, opening: string, paragraphs: string[], transition: boolean) {
  const lines = [opening, team.notes, ...paragraphs].filter(Boolean).flatMap(statements);
  if (search.kind === "star") {
    const actual = team.pieces.some(piece => search.unitIds.includes(piece.unitId) && piece.stars === search.stars);
    const terms = search.names.flatMap(name => starForms[search.stars - 1].flatMap(token => [token + name, name + token]));
    const context = lines.find(line => (actual || /打工|代持|带.{0,8}装|接.{0,8}装|开局|留牌|先用|过渡|稳血/.test(line)) &&
      terms.some(term => key(line).includes(term)));
    return { rank: actual ? (transition ? 4 : 3) : context ? 2 : 0, context };
  }

  const actual = team.pieces.some(piece => piece.items?.some(item => search.itemIds.includes(item)));
  const terms = search.names.flatMap(name => [name + "纹章", name + "转职", name + "转"]);
  const context = lines.find(line => {
    const text = key(line);
    return terms.some(term => {
      const at = text.indexOf(term);
      return at >= 0 && /(?:^|[，、：:])(?:只有|已有|开局有|开局拿到|拿到|有|需要|前提是)$/.test(text.slice(0, at));
    });
  });
  return { rank: actual ? 3 : context ? 2 : 0, context };
}

export function searchPhaseNote(team: Team, opening: string, stage: string) {
  return statements([stage, team.notes].filter(Boolean).join("\n")).find(line =>
    line.length <= 80 && !key(opening).includes(key(line)) &&
    !/^[一二三四五六七八九十\d]+\s*(?:级|人口)(?:主阵|过渡|备选|成型|稳血|上限)?[。！]?$/.test(line) &&
    /[一二三四五六七八九十0-9](?:级|人口)|解锁|稳血|打工|接装|追三|再升/.test(line)
  );
}
