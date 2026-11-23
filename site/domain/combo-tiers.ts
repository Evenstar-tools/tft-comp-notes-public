type Tier = { activeAt: number; bronzeRanges: number[][] };
export function comboTierCounts(indices: number[], mask: number, heroes: { siteTraits: string[] }[], tiers: Record<string, Tier>) {
  const contributions = new Map<string, number>();
  indices.forEach((index, slot) => {
    for (const id of heroes[index].siteTraits) {
      const weight = id === "k-da" && (mask & (1 << slot)) ? 2 : 1;
      contributions.set(id, (contributions.get(id) ?? 0) + weight);
    }
  });
  const bronze: string[] = [];
  let activeCount = 0;
  for (const [id, count] of contributions) {
    const tier = tiers[id];
    if (!tier || count < tier.activeAt) continue;
    activeCount++;
    if (tier.bronzeRanges.some(([min, max]) => count >= min && count <= max)) bronze.push(id);
  }
  return { bronze, activeCount, jazz: (contributions.get("jazz") ?? 0) >= tiers.jazz.activeAt };
}

export function comboStarMask(indices: number[], suggested: number, heldAtTwo: ReadonlySet<number>, heroes: { siteTraits: string[]; dataTraits: string[] }[]) {
  if (!heldAtTwo.size) return { mask: suggested, pending: suggested };
  let mask = 0;
  let required = 0, contributed = 0;
  const isKda = (id: number) => heroes[id].siteTraits.includes("k-da") && heroes[id].dataTraits.includes("k-da");
  for (const [slot, id] of indices.entries()) {
    const bit = 1 << slot;
    if (suggested & bit) required++;
    if (!heldAtTwo.has(id)) continue;
    mask |= bit;
    if (isKda(id)) contributed++;
  }
  let pending = 0;
  for (const [slot, id] of indices.entries()) {
    const bit = 1 << slot;
    if (!(suggested & bit) || heldAtTwo.has(id)) continue;
    if (contributed >= required && isKda(id)) continue;
    mask |= bit;
    pending |= bit;
    if (isKda(id)) contributed++;
  }
  return { mask, pending };
}
