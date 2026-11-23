import { itemMap } from "@/data";
import { itemWearers } from "@/data/item-library";
import { commonHeroItems } from "@/domain/hero-insights";

const { items, ...gearSource } = itemWearers;

export const editorLoadout = {
  gearSource,
  commonItems: commonHeroItems(itemMap, items, gearSource.minGames),
};
