import references from "./item-reference.json";
import emblems from "./emblem-equipment.json";
import samples from "./item-wearers.json";
import specialEquipment from "./special-equipment.json";
import specialSamples from "./special-item-wearers.json";

interface ItemReference {
  name: string;
  description: string;
  stats: { label: string; value: string }[];
  components?: string[];
  sourceUrl?: string;
  build?: string;
}

interface ItemWearers {
  url: string;
  totalGames?: number;
  mean?: number;
  winRate?: number;
  rows: { unitId: string; games: number; mean?: number; rate?: number; winRate?: number; placementDelta?: number }[];
}

export const itemReference = {
  ...references,
  items: {
    ...references.items,
    ...specialEquipment.recipes,
    ...Object.fromEntries(Object.entries(emblems.items).map(([id, entry]) => [id, {
      ...(specialEquipment.recipes as Record<string, ItemReference>)[id],
      sourceUrl: emblems.sourceUrl,
      build: emblems.build,
      ...entry,
    }])),
    ...Object.fromEntries(specialEquipment.items.map(item => [item.id, item])),
  },
} as {
  build: string;
  date: string;
  sources: { label: string; url: string }[];
  items: Record<string, ItemReference>;
};

interface WearerSnapshot {
  source: string;
  version: string;
  window: string;
  date: string;
  minGames: number;
  items: Record<string, ItemWearers>;
}

export const itemWearers: WearerSnapshot = samples;
export const specialItemWearers: WearerSnapshot = specialSamples;
