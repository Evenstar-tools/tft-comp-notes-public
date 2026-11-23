type SampleUnit = { unitId: string; stars?: number; items?: number; completedItems?: number; itemIds?: string[] };
type SampleBoard = {
  edition?: string;
  augmentId?: string;
  teamId?: string;
  requireBoundFull?: boolean;
  preferBoundCore?: boolean;
  traitLevels?: Record<string, number>;
  completedItems?: ReadonlySet<string>;
  pieces: { unitId: string; stars: number; items: string[] }[];
};

export interface PlacementRecord {
  population: number;
  roster: string[];
  games: number;
  mean?: number;
  topFourRate?: number;
  winRate?: number;
  placementCounts?: number[];
  url: string;
  sampleScope?: string;
  sampleLabel?: string;
  detailOnly?: boolean;
  observedOn?: string;
  boardObservation?: {
    patchId: string;
    title: string;
    play: string;
    guide?: string;
    cores?: string[];
  };
  referencesAugment?: string;
  augmentBuild?: { teamId: string; label: string; kind: "guide" | "observed" };
  conditions?: { kind: "core" | "full"; teamId?: string; coreRoster?: string[]; population?: number; trait?: { id: string; level: number }; traits?: Record<string, number>; units?: SampleUnit[]; augmentId?: string };
}

export interface PlacementBatch {
  patch: string;
  window: string;
  date: string;
  edition?: string;
  minGames: number;
  greenThrough: number;
  redFrom: number;
  records: PlacementRecord[];
  renataNasusReference?: { url: string; observedOn: string; placementCounts: number[] };
  boardComparisons?: {
    sectionId: string;
    teamId?: string;
    coreRoster: string[];
    samples: { label: string; scope: string; url: string; observedOn: string; placementCounts: number[] }[];
  }[];
  formationComparisons?: FormationComparison[];
}

type FormationSample = { url: string; placementCounts: number[] };
export type FormationFamilyReference = FormationSample & { name: string; checkedAt: string; windowHours: number };

export type FormationComparison = {
  edition: string;
  patch: string;
  windowHours: number;
  checkedAt: string;
  population: number;
  condition: string;
  exclusions: string;
  boards: {
    name: string;
    roster: string[];
    sample: FormationSample;
    familyReference?: FormationFamilyReference;
    subset?: { condition: string; remainder: string; sample: FormationSample };
  }[];
};

export function placementEvidenceKind(record: Pick<PlacementRecord, "url" | "conditions" | "referencesAugment">) {
  if (record.referencesAugment || record.conditions?.augmentId) return "augment";
  if (record.conditions?.kind === "core") return "core";
  // Older records include the entire roster in `tab=units` queries. Those match co-occurrence.
  return URL.canParse(record.url) && new URL(record.url).searchParams.get("tab") === "comps" ? "fixed" : "lineup";
}

export function formationComparisonFor(groups: FormationComparison[], edition: string, roster: string[], population: number) {
  const identity = [...roster].sort().join(",");
  for (const group of groups) {
    if (population !== group.population || (edition !== group.edition && !edition.startsWith(group.edition + "."))) continue;
    const board = group.boards.find(entry => [...entry.roster].sort().join(",") === identity);
    if (board) return { group, board };
  }
}

export function remainingPlacements(total: number[], subset: number[]) {
  if (total.length !== 8 || subset.length !== 8 ||
      !total.every((count, i) => Number.isSafeInteger(count) && Number.isSafeInteger(subset[i]) && subset[i] >= 0 && count >= subset[i])) return;
  return total.map((count, i) => count - subset[i]);
}

export type PlacementRating = PlacementRecord & {
  tone: "strong" | "middle" | "weak" | "limited";
  patch: string;
  window: string;
  date: string;
};

export function augmentLoadout(record: PlacementRecord) {
  if (!record.referencesAugment || !record.augmentBuild) return;
  return record.conditions?.units?.find((rule): rule is SampleUnit & {itemIds: string[]} =>
    rule.stars === 3 && rule.completedItems === 3 && rule.itemIds?.length === 3);
}

export type AugmentBoard = NonNullable<PlacementRecord["augmentBuild"]> & {
  games: number;
  mean?: number;
  url: string;
  date: string;
  unitId: string;
  itemIds: string[];
};

export function augmentBoardSamples(records: PlacementRecord[], defaultDate: string) {
  const byName: Record<string, AugmentBoard[]> = {};
  for (const record of records) {
    const name = record.referencesAugment;
    const build = record.augmentBuild;
    const gear = augmentLoadout(record);
    if (!name || !build || !gear || (!record.games && build.kind === "observed")) continue;
    (byName[name] ??= []).push({
      ...build, games: record.games, mean: record.mean, url: record.url, date: record.observedOn ?? defaultDate,
      unitId: gear.unitId, itemIds: gear.itemIds,
    });
  }
  return byName;
}

/** The author supplies the first board. A tie or an incompatible sample keeps that preference. */
export function byBestMean<T extends { rating?: PlacementRating }>(first: T, candidates: T[]): T {
  const scope = first.rating?.sampleScope ?? "";
  return candidates.reduce((best, board) => {
    const rating = board.rating;
    if (!rating || rating.mean === undefined || (rating.sampleScope ?? "") !== scope) return best;
    return best.rating?.mean === undefined || rating.mean < best.rating.mean ? board : best;
  }, first);
}

export const heroAugmentSortingMinGames = 20;
type PlacementSample = { mean?: number; games?: number };
type PlacementSortTier = "ranked" | "low" | "missing";
function hasSortMean(rating: PlacementSample | undefined): rating is PlacementSample & { mean: number } {
  return rating?.mean !== undefined && Number.isFinite(rating.mean);
}

export function placementSortTier(rating: PlacementSample | undefined, minimumGames = 100): PlacementSortTier {
  if (!hasSortMean(rating)) return rating?.games ? "low" : "missing";
  return rating.games !== undefined && rating.games < minimumGames ? "low" : "ranked";
}

export function orderByPlacement<T extends { rating?: PlacementSample }>(entries: T[], minimumGames = 100) {
  return [...entries].sort((a, b) => {
    const aRating = a.rating, bRating = b.rating;
    const aRated = hasSortMean(aRating), bRated = hasSortMean(bRating);
    if (!aRated || !bRated) return Number(bRated) - Number(aRated);
    const aLow = placementSortTier(aRating, minimumGames) === "low";
    const bLow = placementSortTier(bRating, minimumGames) === "low";
    return Number(aLow) - Number(bLow) || aRating.mean - bRating.mean || (bRating.games ?? 0) - (aRating.games ?? 0);
  });
}

export function isLowWinRate(rating?: PlacementRating) {
  return rating?.tone === "weak" && rating.winRate !== undefined && rating.winRate < 0.05;
}

export function findPlacement(batch: PlacementBatch, roster: string[], population: number, board?: SampleBoard): PlacementRating | undefined {
  if (batch.edition && (!board?.edition ||
      (board.edition !== batch.edition && !board.edition.startsWith(batch.edition + ".")))) return;
  const identity = [...roster].sort().join(",");
  function matches(entry: PlacementRecord) {
    const scope = entry.conditions;
    if (board?.requireBoundFull && (!board.teamId || scope?.kind !== "full" || scope.teamId !== board.teamId)) return false;
    if ((scope?.augmentId ?? entry.referencesAugment) !== board?.augmentId) return false;
    if (scope?.teamId && scope.teamId !== board?.teamId) return false;
    if (entry.referencesAugment) {
      const loadout = augmentLoadout(entry);
      if (!loadout || entry.augmentBuild?.teamId !== board?.teamId || !board?.pieces.some(piece =>
        piece.unitId === loadout.unitId && piece.stars === 3 &&
        [...piece.items].sort().join(",") === [...loadout.itemIds].sort().join(","))) return false;
    }
    if (scope?.population !== undefined && scope.population !== population) return false;
    if (scope?.trait && board?.traitLevels?.[scope.trait.id] !== scope.trait.level) return false;
    if (scope?.traits && Object.entries(scope.traits).some(([id, level]) => board?.traitLevels?.[id] !== level)) return false;
    if (scope?.kind === "core") {
      if (!scope.coreRoster?.length || !scope.coreRoster.every(id => roster.includes(id))) return false;
    } else if (entry.population !== population || entry.roster.join(",") !== identity) {
      return false;
    }
    if (!scope) return !entry.sampleScope;
    return !!board && (scope.units ?? []).every(rule => board.pieces.some(piece =>
      piece.unitId === rule.unitId && (rule.stars === undefined || piece.stars === rule.stars) &&
      (rule.items === undefined || piece.items.length === rule.items) &&
      (rule.completedItems === undefined || piece.items.filter(id => board.completedItems?.has(id)).length === rule.completedItems) &&
      (rule.itemIds ?? []).every(id => piece.items.includes(id))));
  }
  const threshold = (entry: PlacementRecord) => entry.conditions?.augmentId || entry.referencesAugment ? 1 : batch.minGames;
  const hasMean = (entry: PlacementRecord) => entry.games >= threshold(entry) &&
    entry.mean !== undefined && Number.isFinite(entry.mean) && entry.mean >= 1 && entry.mean <= 8;
  const preferredCore = (entry: PlacementRecord) => Number(Boolean(
    board?.preferBoundCore && entry.conditions?.kind === "core" && entry.conditions.teamId,
  ));
  const candidates = batch.records.filter(matches).sort((a, b) =>
    Number(!!a.referencesAugment) - Number(!!b.referencesAugment) ||
    preferredCore(b) - preferredCore(a) ||
    Number(a.conditions?.kind === "core") - Number(b.conditions?.kind === "core"));
  const record = candidates.find(hasMean) ?? candidates.find(entry => entry.games > 0);
  if (!record) return;
  const mean = hasMean(record) ? record.mean : undefined;
  const tone = mean === undefined || record.games < batch.minGames || record.referencesAugment ? "limited"
    : mean <= batch.greenThrough ? "strong" : mean >= batch.redFrom ? "weak" : "middle";
  return { ...record, mean, tone, patch: batch.patch, window: batch.window, date: record.observedOn ?? batch.date };
}
