import { itemMap } from "@/data";
import { itemWearers } from "@/data/item-wearers";
import { commonHeroItems } from "@/domain/hero-insights";
import { HeroLibrary } from "@/components/HeroLibrary";
import { publicGuidePublication } from "@/server/publication";
import { heroGuideIndex, type HeroGuideIndex } from "@/domain/hero-guides";
import "./hero-library.css";
export const metadata = { title: "英雄图鉴" };
export const dynamic = "force-dynamic";
const { items, ...gearSource } = itemWearers;
const commonItems = commonHeroItems(itemMap, items, gearSource.minGames);

export default async function Heroes() {
  let guides: HeroGuideIndex | null = null;
  try {
    const live = await publicGuidePublication();
    if (live) guides = heroGuideIndex(live.sections, live.season);
  } catch {
    // The static hero library remains usable when published guides cannot load.
  }
  return <HeroLibrary guides={guides} commonItems={commonItems} gearSource={gearSource} />;
}
