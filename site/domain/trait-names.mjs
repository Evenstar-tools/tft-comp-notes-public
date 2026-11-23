const legacyIllbeatsName = "病拍";
const previousIllbeatsName = "酷炫节拍";
const illbeatsName = "大触打击乐";

/** @param {string} text */
export function displayTraitNames(text) {
  return text.replaceAll(legacyIllbeatsName, illbeatsName).replaceAll(previousIllbeatsName, illbeatsName);
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
