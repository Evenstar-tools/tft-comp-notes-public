import bundledIds from "@/data/item-art.json";
import type { Item } from "./types";

const bundled = new Set(bundledIds);

export function bundledItemImage(item?: Pick<Item, "id">) {
  return item && bundled.has(item.id) ? "/assets/items/" + item.id + ".webp" : undefined;
}

export function preferredItemImage(item?: Pick<Item, "id" | "image">) {
  return bundledItemImage(item) ?? item?.image;
}
