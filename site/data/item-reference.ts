import references from "./item-reference.json";
import emblems from "./emblem-equipment.json";
import specialEquipment from "./special-equipment.json";

export interface ItemReference {
  name: string;
  description: string;
  stats: { label: string; value: string }[];
  components?: string[];
  sourceUrl?: string;
  build?: string;
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
