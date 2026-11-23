import nicknames from "../data/unit-nicknames.json" with { type: "json" };

/** @type {Record<string, string[]>} */
const nicknamesById = nicknames;

/** @param {Pick<import("./types").Unit, "id" | "name" | "nameEn">} unit */
export function unitDirectSearchNames(unit) {
  return [
    unit.name,
    unit.name.split(" · ")[0],
    unit.nameEn,
    unit.id,
  ];
}

/** @param {string} unitId */
export function unitNicknames(unitId) {
  return nicknamesById[unitId] ?? [];
}

/** @param {Pick<import("./types").Unit, "id" | "name" | "nameEn" | "aliases">} unit */
export function unitSearchNames(unit) {
  return [...new Set([
    ...unitDirectSearchNames(unit),
    ...(unit.aliases ?? []),
    ...unitNicknames(unit.id),
  ])];
}

/** @param {import("./types").Trait} trait */
export function unitTraitSearchNames(trait) {
  return [trait.name, trait.nameEn, ...(trait.aliases ?? []), ...(trait.id === "beach-pop" ? ["海之歌"] : [])];
}
