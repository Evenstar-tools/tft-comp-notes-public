export type TierCounts = Record<string, Record<string, number[]>>;
export type TraitScope = { labels: string[]; url: string; rows: TierCounts };
export type TraitContext = { title: string; back: string; stats?: TraitScope; compared: Record<string, TraitScope>; pins: string[]; heroAugment: boolean };
export type TraitBoardLink = { sectionId: string; title: string; board: string; url: string };
export type TraitBoardIndex = Record<string, Record<string, TraitBoardLink[]>>;
export type CrossTier = { name: string; id: string; tier: number; noxuMean: number; noxuGames: string; metaMean: number; metaGames: number };
export type TraitCrosscheck = { set: number; patch: string; on: string; url: string; metaUrl: string; rows: CrossTier[] };

export function tierPerformance(counts?: number[]) {
  if (!counts || counts.length !== 8 || counts.some(n => !Number.isInteger(n) || n < 0)) return;
  const games = counts.reduce((a, b) => a + b, 0);
  if (!games) return;
  return {
    games, mean: counts.reduce((sum, n, i) => sum + n * (i + 1), 0) / games,
    top4: counts.slice(0, 4).reduce((a, b) => a + b, 0) / games,
    win: counts[0] / games,
  };
}

export function traitScopeKey(url?: string, released: readonly string[] = []) {
  if (!url) return;
  const params = new URL(url).searchParams;
  if (params.get("set") !== "TFTSet19") return;
  const fixed = Array.from(new Set(params.getAll("trait"))).filter(pin => !released.includes(pin)).sort();
  const restrictions = ["duplicate_unit_count", "emblem_count", "tactician_item_count"].flatMap(key => {
    const values = params.getAll(key);
    return values.map(value => key + "=" + value);
  });
  return [params.get("level") ?? "", ...Array.from(new Set(params.getAll("unit"))).sort(), ...fixed, ...restrictions].join(",");
}

export function compatibleTraitBatch(edition: string, set: number, queue: string, patch: string) {
  const season = "s" + set + "-" + queue.toLowerCase() + "-";
  if (!edition.startsWith(season)) return false;
  const version = edition.slice(season.length);
  // Game-data editions carry the numeric build; MetaTFT can append a hotfix letter to the patch.
  const base = patch.replace(/^(\d+\.\d+)[a-z]$/, "$1");
  return version === patch || version.startsWith(patch + ".") || version === base || version.startsWith(base + ".");
}

export function boardTraitLink(trait: string, tier: number, guide: string, team: string) {
  return "/traits?" + new URLSearchParams({ trait, tier: String(tier), guide, team });
}
