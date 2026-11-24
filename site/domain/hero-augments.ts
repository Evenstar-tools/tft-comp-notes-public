import augments from "../data/hero-augments.json" with { type: "json" };
import type { Section } from "./document";

export const heroAugmentCategory = "英雄强化阵容";
export const heroAugmentLibrary = "/?view=hero-augments";
export const heroAugmentLabel = "专属强化：";
export const heroAugmentGearSource = "https://mobalytics.gg/tft/guides/set-19-best-items#hero-augment-builds";
export type HeroAugment = (typeof augments)[number];
export const heroAugmentsById = new Map(augments.map(augment => [augment.id, augment]));
const byUnit = new Map(augments.map(augment => [augment.unitId, augment]));

export function heroAugmentForUnit(unitId: string, edition: string) {
  return edition.startsWith("s19-pbe-") ? byUnit.get(unitId) : undefined;
}

export function heroAugmentProfileLink(augment: HeroAugment) {
  return "/heroes?" + new URLSearchParams({ unit: augment.unitId, augment: augment.id });
}

export function heroAugmentForGuide(section: Section) {
  if (section.category !== heroAugmentCategory) return;
  const label = section.blocks.find(block => block.type === "text" && block.text?.startsWith(heroAugmentLabel));
  const name = label?.text?.slice(heroAugmentLabel.length).trim();
  return augments.find(augment => augment.name === name || augment.label === name);
}

export function omitRepeatedHeroEntry(text: string, augment: HeroAugment, unitName?: string) {
  if (!text.startsWith(augment.round)) return text;
  const selection = text.slice(augment.round.length).trimStart().match(/^拿(?:到)?\s*([\s\S]+)$/)?.[1];
  const name = [augment.label, augment.name, unitName && `${unitName}专属`].find(label => label && selection?.startsWith(label));
  if (!selection || !name) return text;
  return selection.slice(name.length).match(/^\s*(?:才走。|[，。]|就)\s*([\s\S]+)$/)?.[1] ?? text;
}
