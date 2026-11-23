import iconNames from "./augment-art.json";
import { rarityClass, type AugmentEntry } from "@/domain/augment-library";

const bundledArt = new Set(iconNames);

export function augmentArtPath({ icon, rarity }: Pick<AugmentEntry, "icon" | "rarity">): string | undefined {
  const path = rarityClass(rarity) + "/" + icon;
  return bundledArt.has(path) ? "/assets/augment-icons/" + path + ".webp" : undefined;
}

