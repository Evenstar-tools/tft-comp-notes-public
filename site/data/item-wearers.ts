import samples from "./item-wearers.json";

export interface ItemWearers {
  url: string;
  totalGames?: number;
  mean?: number;
  winRate?: number;
  rows: { unitId: string; games: number; mean?: number; rate?: number; winRate?: number; placementDelta?: number }[];
}

export interface WearerSnapshot {
  updatedAt?: string | null;
  rankedScope?: string;
  queue?: string;
  source: string;
  version: string;
  window: string;
  date?: string | null;
  minGames: number;
  items: Record<string, ItemWearers>;
}

export const itemWearers: WearerSnapshot = samples;
